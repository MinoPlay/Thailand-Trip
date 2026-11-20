-- LOCAL/DISPOSABLE DATABASE ONLY. Runs in a transaction and never imports trip data.
begin;
-- Only rolled-back synthetic metadata is deleted in this test transaction.
-- Storage installs a statement-level guard, even for RLS-filtered zero-row DELETEs.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
  ('10000000-0000-0000-0000-000000000001','thailand-test@example.invalid'),
  ('10000000-0000-0000-0000-000000000002','existing-test@example.invalid');
insert into thailand_private.thailand_config(account_id) values ('10000000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok($$ select * from public.thailand_trips $$,'42501',null,'anonymous table access denied');
select throws_ok(
  $$ select public.thailand_initialize_trip('Test','2000-01-01','2000-01-02','UTC') $$,
  '42501',null,'anonymous initialization denied'
);
select throws_ok($$ select public.thailand_consume_shared_login_attempt('test') $$,'42501',null,'anonymous throttle RPC denied');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.thailand_initialize_trip('Test','2000-01-01','2000-01-02','UTC') $$,
  '42501','authentication_required','existing project users cannot initialize Thailand trips'
);
select throws_ok(
  $$ insert into public.thailand_trips(owner_id,title,start_date,end_date)
     values(auth.uid(),'Test','2000-01-01','2000-01-02') $$,
  '42501',null,'existing user cannot bypass initialization with direct insert'
);
select throws_ok($$ select public.thailand_shared_account_id() $$,'42501',null,'account allowlist is service-only');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.thailand_initialize_trip('Test','2000-01-01','2000-01-02','UTC',
    '[]','[{"title":"Invalid relation","item_id":"20000000-0000-0000-0000-000000000099"}]','[]') $$,
  '23503',null,'invalid import fails atomically'
);
select is((select count(*) from public.thailand_trips),0::bigint,'failed import leaves no partial trip');
select throws_ok(
  $$ select public.thailand_initialize_trip('Test','2000-01-01','2000-01-02','UTC',
    '[{"title":"Invalid override","type":"activity","version":99}]') $$,
  '22023','invalid_item_import_fields','import cannot override managed fields'
);
select lives_ok(
  $$ select public.thailand_initialize_trip('Test','2000-01-01','2000-01-02','Asia/Bangkok',
    '[{"id":"20000000-0000-0000-0000-000000000001","title":"Sample activity","type":"activity"}]',
    '[{"id":"30000000-0000-0000-0000-000000000001","item_id":"20000000-0000-0000-0000-000000000001","title":"Sample task"}]',
    '[{"id":"40000000-0000-0000-0000-000000000001","item_id":"20000000-0000-0000-0000-000000000001","body":"Sample note"}]'
  ) $$,'allowlisted account can atomically import related records'
);
select lives_ok(
  $$ select public.thailand_initialize_trip('Do not replace','2001-01-01','2001-01-02','UTC') $$,
  'initialization is idempotent without resetting data'
);
select is((select count(*) from public.thailand_trips),1::bigint,'one trip per owner');
select is((select title from public.thailand_trips),'Test','repeat preserves title');
select is((select count(*) from public.thailand_tasks),1::bigint,'repeat preserves tasks');
select throws_ok($$ select * from thailand_private.thailand_config $$,'42501',null,'allowlist table is private');
select throws_ok($$ select * from thailand_private.thailand_deletion_claims $$,'42501',null,'claims table is private');
select throws_ok(
  $$ select public.thailand_finalize_content_deletion(gen_random_uuid(),auth.uid()) $$,
  '42501',null,'user cannot finalize deletion'
);
select throws_ok($$ select public.thailand_consume_shared_login_attempt('test') $$,'42501',null,'user cannot manipulate throttle');
select throws_ok(
  $$ update public.thailand_trips set owner_id='10000000-0000-0000-0000-000000000002' $$,
  '23514',null,'owner is immutable'
);
select throws_ok($$ update public.thailand_trips set end_date='1999-01-01' $$,'23514',null,'date range validated');
select throws_ok($$ update public.thailand_itinerary_items set start_zone='Invalid/Zone' $$,'23514',null,'timezone validated');
select throws_ok($$ update public.thailand_itinerary_items set type='invalid' $$,'23514',null,'item type validated');
select throws_ok(
  $$ insert into public.thailand_notes(trip_id,body) select id,'' from public.thailand_trips $$,
  '23514',null,'empty note rejected'
);
select throws_ok(
  $$ insert into public.thailand_tasks(trip_id,item_id,title)
     select id,'20000000-0000-0000-0000-000000000099','Invalid relation' from public.thailand_trips $$,
  '23503',null,'missing item relation rejected'
);
select throws_ok($$ delete from public.thailand_itinerary_items where version=1 $$,'42501',null,'direct item delete denied');
select throws_ok($$ delete from public.thailand_trips where version=1 $$,'55000','trip_not_empty','nonempty trip cannot be deleted');

with changed as (
  update public.thailand_itinerary_items set title='Updated',version=99
  where id='20000000-0000-0000-0000-000000000001' and version=1 returning *
) select is((select version from changed),2,'version is old plus one, never caller supplied');
with changed as (
  update public.thailand_itinerary_items set title='Stale'
  where id='20000000-0000-0000-0000-000000000001' and version=1 returning *
) select is((select count(*) from changed),0::bigint,'stale update affects no rows');
with removed as (
  delete from public.thailand_notes where id='40000000-0000-0000-0000-000000000001' and version=99 returning *
) select is((select count(*) from removed),0::bigint,'stale note deletion preserves row');

insert into public.thailand_attachments(id,trip_id,item_id,name,path,mime_type,size)
select '50000000-0000-0000-0000-000000000001',id,'20000000-0000-0000-0000-000000000001',
  'sample.pdf',id::text || '/50000000-0000-0000-0000-000000000001/_sample.pdf','application/pdf',100
from public.thailand_trips;
select throws_ok(
  $$ update public.thailand_attachments set status='ready' where version=1 $$,
  '23514','upload_not_verified','ready requires uploaded object'
);
select throws_ok(
  $$ insert into public.thailand_attachments(trip_id,name,path,mime_type,size)
     select id,'unsafe.pdf','../unsafe.pdf','application/pdf',100 from public.thailand_trips $$,
  '23514',null,'unsafe metadata path rejected'
);
select throws_ok(
  $$ insert into public.thailand_attachments(trip_id,name,path,mime_type,size)
     select id,'large.pdf','invalid','application/pdf',10485761 from public.thailand_trips $$,
  '23514',null,'oversize metadata rejected'
);
select lives_ok(
  $$ insert into storage.objects(bucket_id,name,metadata)
     select 'thailand-documents',path,'{"size":100,"mimetype":"application/pdf"}'::jsonb from public.thailand_attachments $$,
  'owner may upload registered staged object'
);
select lives_ok($$ update public.thailand_attachments set status='ready' where version=1 $$,'verified upload becomes ready');
select throws_ok(
  $$ insert into storage.objects(bucket_id,name) values('thailand-documents','unregistered.pdf') $$,
  '42501',null,'unregistered upload rejected'
);
with removed as (
  delete from storage.objects where bucket_id='thailand-documents' returning *
) select is((select count(*) from removed),0::bigint,'user cannot directly delete files');
select is((select count(*) from storage.objects where bucket_id='thailand-documents'),1::bigint,'owner can read own file');
select throws_ok($$ delete from public.thailand_attachments where version=2 $$,'42501',null,'direct metadata delete denied');
reset role;

-- Simulate permissive policies from another application without changing any real policy.
create policy thailand_test_broad_read on storage.objects for select to public using(true);
create policy thailand_test_broad_insert on storage.objects for insert to public with check(true);
create policy thailand_test_broad_update on storage.objects for update to public using(true) with check(true);
create policy thailand_test_broad_delete on storage.objects for delete to public using(true);
create policy thailand_test_broad_bucket_read on storage.buckets for select to public using(true);
create policy thailand_test_broad_bucket_update on storage.buckets for update to public using(true) with check(true);
create policy thailand_test_broad_bucket_delete on storage.buckets for delete to public using(true);
insert into storage.buckets(id,name,public) values('thailand-test-other-bucket','thailand-test-other-bucket',false);
insert into storage.objects(bucket_id,name) values('thailand-test-other-bucket','existing-app.txt');
select set_config('thailand_test.owner_trip',(select id::text from public.thailand_trips),true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from public.thailand_trips),0::bigint,'existing users cannot read trip');
select is((select count(*) from public.thailand_itinerary_items),0::bigint,'existing users cannot read items');
select is((select count(*) from public.thailand_tasks),0::bigint,'existing users cannot read tasks');
select is((select count(*) from public.thailand_notes),0::bigint,'existing users cannot read notes');
select is((select count(*) from public.thailand_attachments),0::bigint,'existing users cannot read metadata');
with changed as (
  update storage.buckets set public=true where id='thailand-documents' returning *
) select is((select count(*) from changed),0::bigint,'existing policies cannot let users make Thailand bucket public');
with removed as (
  delete from storage.buckets where id='thailand-documents' returning *
) select is((select count(*) from removed),0::bigint,'existing policies cannot let users delete Thailand bucket');
with changed as (
  update public.thailand_notes set body='Foreign update'
  where id='40000000-0000-0000-0000-000000000001' and version=1 returning *
) select is((select count(*) from changed),0::bigint,'existing users cannot update known records');
with removed as (
  delete from public.thailand_tasks where id='30000000-0000-0000-0000-000000000001' and version=1 returning *
) select is((select count(*) from removed),0::bigint,'existing users cannot delete known records');
select is((select count(*) from storage.objects where bucket_id='thailand-documents'),0::bigint,'broad existing policies cannot expose Thailand files');
select is((select count(*) from storage.objects where bucket_id='thailand-test-other-bucket'),1::bigint,'other buckets retain existing policy behavior');
select throws_ok(
  $$ insert into storage.objects(bucket_id,name) values('thailand-documents','foreign.pdf') $$,
  '42501',null,'broad existing policy cannot allow foreign upload'
);
select throws_ok(
  $$ insert into public.thailand_notes(trip_id,body)
     values(current_setting('thailand_test.owner_trip')::uuid,'unauthorized') $$,
  '42501',null,'known trip ID does not permit foreign insert'
);
select throws_ok(
  $$ select public.thailand_claim_content('thailand_itinerary_items','20000000-0000-0000-0000-000000000001',2) $$,
  '42501','authentication_required','existing user cannot claim content'
);
reset role;

set local role anon;
select is((select count(*) from storage.objects where bucket_id='thailand-documents'),0::bigint,'broad policies cannot expose files to anonymous role');
select is((select count(*) from storage.objects where bucket_id='thailand-test-other-bucket'),1::bigint,'anonymous behavior for other buckets is unchanged');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
with changed as (
  update storage.objects set name='renamed.pdf' where bucket_id='thailand-documents' returning *
) select is((select count(*) from changed),0::bigint,'broad existing update policy cannot move Thailand files');
with removed as (
  delete from storage.objects where bucket_id='thailand-documents' returning *
) select is((select count(*) from removed),0::bigint,'broad existing delete policy cannot remove Thailand files');
select throws_ok(
  $$ select public.thailand_claim_content('thailand_itinerary_items','20000000-0000-0000-0000-000000000001',1) $$,
  '40001','version_conflict','stale deletion claim rejected'
);
select lives_ok(
  $$ select public.thailand_claim_content('thailand_itinerary_items','20000000-0000-0000-0000-000000000001',2) $$,
  'owner can claim item and all file paths'
);
select lives_ok(
  $$ select public.thailand_claim_content('thailand_itinerary_items','20000000-0000-0000-0000-000000000001',2) $$,
  'identical deletion retry shares claim'
);
select throws_ok(
  $$ update public.thailand_itinerary_items set title='Race' where version=2 $$,
  '55000','deletion_in_progress','claimed item edits blocked'
);
select throws_ok(
  $$ update public.thailand_tasks set item_id=null where version=1 $$,
  '55000','deletion_in_progress','claimed children cannot escape by reparenting'
);
select set_config('planner.finalizing_claim','yes',true);
select throws_ok(
  $$ update public.thailand_itinerary_items set title='Bypass attempt' where version=2 $$,
  '55000','deletion_in_progress','caller-controlled GUC cannot bypass claim guard'
);
select throws_ok(
  $$ insert into public.thailand_attachments(id,trip_id,item_id,name,path,mime_type,size)
     select '50000000-0000-0000-0000-000000000002',id,'20000000-0000-0000-0000-000000000001',
       'race.pdf',id::text || '/50000000-0000-0000-0000-000000000002/race.pdf','application/pdf',100 from public.thailand_trips $$,
  '55000','deletion_in_progress','claimed item rejects attachment insertion'
);
select throws_ok(
  $$ select public.thailand_claim_content('thailand_attachments','50000000-0000-0000-0000-000000000001',2) $$,
  '55000','parent_deletion_in_progress','overlapping attachment claim rejected'
);
reset role;
select set_config('thailand_test.claim',(select id::text from thailand_private.thailand_deletion_claims),true);
set local role service_role;
select throws_ok(
  $$ select public.thailand_finalize_content_deletion(current_setting('thailand_test.claim')::uuid,'10000000-0000-0000-0000-000000000001') $$,
  '55000','storage_cleanup_required','finalization refuses orphan files'
);
-- Simulate API deletion of object metadata; never do this against real files.
delete from storage.objects where bucket_id='thailand-documents';
select lives_ok(
  $$ select public.thailand_finalize_content_deletion(current_setting('thailand_test.claim')::uuid,'10000000-0000-0000-0000-000000000001') $$,
  'service finalization removes item and all dependents transactionally'
);
select lives_ok(
  $$ select public.thailand_finalize_content_deletion(current_setting('thailand_test.claim')::uuid,'10000000-0000-0000-0000-000000000001') $$,
  'finalization is idempotent'
);
reset role;
select is((select count(*) from public.thailand_itinerary_items),0::bigint,'item removed');
select is((select count(*) from public.thailand_tasks),0::bigint,'dependent tasks removed');
select is((select count(*) from public.thailand_notes),0::bigint,'dependent notes removed');
select is((select count(*) from public.thailand_attachments),0::bigint,'dependent metadata removed');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (public.thailand_claim_content('thailand_itinerary_items','20000000-0000-0000-0000-000000000001',2)->>'completed')::boolean,
  true,'owner can retry completed receipt after row is gone'
);
with removed as (delete from public.thailand_trips where version=99 returning *)
select is((select count(*) from removed),0::bigint,'stale trip deletion preserves row');
with removed as (delete from public.thailand_trips where version=1 returning *)
select is((select count(*) from removed),1::bigint,'empty trip can be version-deleted without losing receipt');
reset role;
set local role service_role;
select is((public.thailand_consume_shared_login_attempt('test_ip')->>'allowed')::boolean,true,'first throttle attempt allowed');
do $$ begin perform public.thailand_consume_shared_login_attempt('test_ip') from generate_series(1,4); end $$;
select is((public.thailand_consume_shared_login_attempt('test_ip')->>'allowed')::boolean,false,'sixth source attempt denied');
select ok((public.thailand_consume_shared_login_attempt('test_ip')->>'retry_after')::integer>0,'throttle returns retry interval');
do $$ begin perform public.thailand_consume_shared_login_attempt('source_' || n::text) from generate_series(1,14) n; end $$;
select is((public.thailand_consume_shared_login_attempt('new_source')->>'allowed')::boolean,false,'global limit cannot be bypassed with new source keys');
reset role;
select * from finish();
rollback;
