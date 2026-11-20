import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import process from 'node:process'

const execute = promisify(execFile)
const project = process.env.THAILAND_TEST_PROJECT_REF

test('a concurrent claim transaction lock blocks the actual mutation trigger', {
  skip: !project,
  timeout: 45000,
}, async () => {
  assert.equal(project, 'clkhiheomufzytfxrezn', 'Only the explicitly approved project may be targeted')
  const query = async (sql) => {
    const { stdout } = await execute('supabase', [
      'db', 'query', '--linked', '--project-ref', project, '--output', 'json', sql,
    ], { maxBuffer: 1024 * 1024, timeout: 30000 })
    return JSON.parse(stdout)
  }
  const trip = randomUUID()
  const owner = randomUUID()
  const key = `hashtextextended('thailand:trip:${trip}',0)`
  // Hold the exact lock used by a deletion claim. A distinct Management API
  // session then runs the real BEFORE INSERT trigger, not a mock of the guard.
  const holder = query(`begin;
    select pg_advisory_xact_lock(${key});
    select pg_sleep(12);
    rollback;`)
  try {
    let held = false
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await query(`begin;
        select pg_try_advisory_xact_lock(${key}) as acquired;
        rollback;`)
      if (result[0]?.acquired === false) {
        held = true
        break
      }
      await setTimeout(250)
    }
    assert.equal(held, true, 'The independent lock-holder must be running')
    const result = await query(`begin;
      set local lock_timeout = '800ms';
      insert into auth.users(id,email)
      values('${owner}','thailand-concurrency-${owner}@example.invalid');
      do $test$
      declare rejected boolean := false;
      begin
        begin
          insert into public.thailand_trips(id,owner_id,title,start_date,end_date,timezone)
          values('${trip}','${owner}','Synthetic concurrency test','2000-01-01','2000-01-02','UTC');
        exception when lock_not_available then
          rejected := true;
        end;
        if not rejected then
          raise exception 'claim_lock_did_not_block_record_mutation';
        end if;
      end;
      $test$;
      select 'claim_lock_blocks_record_mutation' as assertion;
      rollback;`)
    assert.equal(result[0]?.assertion, 'claim_lock_blocks_record_mutation')
  } finally {
    // Both sessions end with ROLLBACK; no fixtures, config, credentials or
    // extensions persist, even if the assertion fails.
    await holder
  }
  const cleanup = await query(`select
    not exists(select 1 from auth.users where id='${owner}')
    and not exists(select 1 from public.thailand_trips where id='${trip}') as rolled_back;`)
  assert.equal(cleanup[0]?.rolled_back, true, 'Synthetic fixture and trip must not persist')
})
