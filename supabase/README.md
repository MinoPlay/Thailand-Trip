# Thailand planner backend

## Shared-project safety

The approved target is the **existing Collective project**
`clkhiheomufzytfxrezn`. This repository owns only new `public.thailand_*`
objects, the `thailand_private` schema, two `thailand-*` Edge Functions and the
private `thailand-documents` bucket. Model field names remain those in
`src/lib/models.ts`; physical table names are:

| Model | Table |
| --- | --- |
| Trip | `thailand_trips` |
| Item | `thailand_itinerary_items` |
| Task | `thailand_tasks` |
| Note | `thailand_notes` |
| Attachment | `thailand_attachments` |

**Do not run `supabase db push`, remote `db reset`, `config push`, migration
repair, a project-wide function deployment, or `functions deploy --prune`.**
This repository does not represent the existing project's migration history.
Do not change its Auth signup/providers/rate limits, existing tables, existing
buckets or existing Storage policies. `config.toml` describes an isolated local
development stack, not a configuration to push to Collective. Public signup may
remain enabled for the project's other applications: that does **not** confer
access to this planner.

The migration adds specifically named Storage policies; it never replaces or
drops another application's policy. Its **restrictive** policies fence only
`bucket_id = 'thailand-documents'`, returning true for every other bucket. This
is necessary because PostgreSQL ORs permissive policies: merely adding an
owner-only policy would not protect planner files against an existing broad
Storage policy. No anonymous or non-allowlisted user can access planner data,
even if they own another valid account on this project.

### Review and apply only the additive migration

1. Back up the project and inventory current objects/policies. Confirm the
   explicit project reference rather than relying on a CLI link.
2. Before applying, run read-only collision checks in the approved project:

   ```sql
   select nspname from pg_namespace where nspname = 'thailand_private';
   select schemaname, tablename from pg_tables
   where schemaname = 'public' and left(tablename, 9) = 'thailand_';
   select n.nspname, p.proname from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and left(p.proname, 9) = 'thailand_';
   select id from storage.buckets where id = 'thailand-documents';
   select policyname, cmd, permissive, roles, qual, with_check
   from pg_policies where schemaname = 'storage' and tablename in ('objects','buckets');
   ```

   Namespace collisions must be reviewed, not overwritten. The migration
   deliberately fails on a collision rather than adopting existing data.
3. Review `migrations/202611200001_thailand_planner.sql` and the follow-up
   `migrations/202611200002_thailand_guard_record.sql`. An administrator can
   submit **only these files in order**, each already wrapped in
   `BEGIN; ... COMMIT;`, through the
   Supabase Management API database query endpoint, with explicit projectRef
   `clkhiheomufzytfxrezn`. Do not send migration repair/reset SQL or infer that
   all local migrations belong to Collective. Record the applied file's hash
   privately for future targeted upgrades. Apply the follow-up before accepting
   mutations: it fixes PostgreSQL's runtime resolution of table-specific fields
   in the generic trigger without changing grants or unrelated functions.
4. Compare the inventory afterward: only namespaced objects, this bucket, six
   new `thailand_documents_*` object policies, three `thailand_bucket_*` bucket
   management fences and publication entries for the five
   new tables should be added. Existing policy definitions must be unchanged.
   The migration does not create extensions or alter Auth settings. Bucket
   management fences prevent existing permissive policies from letting users
   make the planner bucket public or relax its limits.
5. Provision the dedicated account and secrets below before exposing the UI.
   An empty allowlist intentionally denies everyone.

On 2026-11-20, both SQL files were applied individually to the explicitly
approved project using `supabase db query --linked --project-ref
clkhiheomufzytfxrezn --file <file> --output json`. No Auth configuration,
unrelated data/policies, credentials, account provisioning or Edge deployments
were changed by the backend agent. The initial trigger's runtime field bug was
found by the integration tests and corrected by migration `202611200002`.

## Dedicated shared account

An administrator must create **one new, email-confirmed dedicated Auth user**
using the Auth Admin API or Dashboard. Use a high-entropy private email and a
unique long random password. Do not reuse an existing application's account.
Do not commit either credential, the UUID, user exports or itinerary imports.
Store the chosen password only through Supabase Auth; never add it to an Edge
secret, `.env`, provisioning file, repository or log.
There is no planner signup flow, email input, password reset flow, public share
link or invitation feature. All planner users intentionally share this account.

As the database administrator, substitute the provisioned user's UUID into:

```sql
begin;
insert into thailand_private.thailand_config(singleton, account_id)
values (true, '<DEDICATED_AUTH_USER_UUID>'::uuid);
commit;
```

This private table has no grants for `anon`/`authenticated` and is not exposed
through PostgREST. Its sole entry is required by every planner RLS ownership
check, initialization, deletion claim and finalizer. A different authenticated
project user cannot create even their own planner trip. The service-only
`thailand_shared_account_id()` RPC lets the login function verify that the
secret email resolves to exactly this UUID. If the allowlist is missing or
misconfigured, login fails closed.

The per-owner unique constraint protects initialization retries; it is not the
membership boundary. The explicit UUID allowlist is that boundary.

## Secrets and deployment

Set **new, prefixed** secrets without overwriting another app's secrets:

| Name | Value |
| --- | --- |
| `THAILAND_SHARED_ACCOUNT_EMAIL` | Email of the dedicated confirmed user |
| `THAILAND_ALLOWED_ORIGINS` | Comma-separated exact browser origins, e.g. your HTTPS site and explicitly needed local origin; no wildcard or trailing slash |
| `THAILAND_LOGIN_HMAC_SECRET` | At least 32 cryptographically random characters, server-only |
| `THAILAND_LOGIN_TRUSTED_IP_HEADER` | `cf-connecting-ip` on hosted Supabase (verified below) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
by the Supabase runtime. The service key must never be in a `VITE_*` variable,
browser bundle, repository, logs or client requests. The browser only needs the
project URL and public publishable/anon key. If using a local secret file, keep
it outside source control and use `supabase secrets set --env-file <private-file>
--project-ref clkhiheomufzytfxrezn`; ensure it contains only the new prefixed
keys. Do not put secret values in shell history.

After review, deploy only the named functions:

```sh
supabase functions deploy thailand-shared-login \
  --project-ref clkhiheomufzytfxrezn --use-api --no-verify-jwt
supabase functions deploy thailand-delete-content \
  --project-ref clkhiheomufzytfxrezn --use-api
```

`--use-api` bundles remotely without requiring local Docker. Only
`thailand-shared-login` has `verify_jwt = false`. The deletion function retains
gateway JWT verification **and** calls `auth.getUser()` on a request-scoped user
client; a decoded JWT or the presence of a header alone is never authorization.
Future authenticated functions must do the same.

Browser requests must use an allowed Origin; denied origins receive 403.
Origin-less CLI/native requests are allowed but still need the password or
valid session. CORS is not an authentication boundary. Responses are `no-store`.

### Persistent login throttle and IP trust

The service-only `thailand_consume_shared_login_attempt(p_ip_key text)` RPC
atomically consumes three counters under one transaction advisory lock:
20 attempts/minute globally, 100/hour globally, and 5/15 minutes per source.
It returns `{allowed: boolean, retry_after: integer}`. Counters survive Edge
isolate restarts, include failed/malformed requests, and expire after a day.
Storage/DB failure fails closed rather than bypassing throttling. Denials
return HTTP 429 with `Retry-After`. No password or raw IP is stored.

**Default:** no client IP header is trusted. All callers share an HMAC-derived
`unattributed` source bucket, so the effective safe limit is 5 attempts/15
minutes across users. Spoofed `X-Forwarded-For`, `X-Real-IP` and
`CF-Connecting-IP` do not change it.

Only configure `THAILAND_LOGIN_TRUSTED_IP_HEADER=cf-connecting-ip` or `x-real-ip`
after proving that a trusted ingress **strips client-provided copies and sets
one canonical client address**, and that direct requests to the Supabase
function URL cannot bypass that ingress. Supabase header names alone are not
proof of trust. If bypass cannot be prevented, leave the setting absent.
Lists, missing values, invalid addresses and scoped IPv6 fall into the shared
unattributed bucket; valid IPv6 is canonicalized and all sources are HMAC-SHA256
hashed. Arbitrary header names and `X-Forwarded-For` are not supported.

**Hosted Supabase (verified 2026-11-20):** Edge Functions sit behind Cloudflare,
which sets `CF-Connecting-IP` to the real client address and rejects requests
that supply their own copy (Cloudflare error 1000). The deployment therefore
sets `THAILAND_LOGIN_TRUSTED_IP_HEADER=cf-connecting-ip`, so each visitor gets
their own 5/15-minute bucket and one person cannot lock everyone else out.

The project's public Auth password endpoint still exists for its other apps.
Someone who learns the shared email can call it directly, bypassing this Edge
throttle; Supabase Auth's existing platform limits then apply. The private email
reduces discovery, **not** replaces a strong password. Do not claim that this
function is a project-wide Auth firewall, or change global Auth settings to
make it one. An absolute password-endpoint gate would require separately
approved infrastructure/Auth changes or a dedicated project.

## Frontend contracts

### `thailand-shared-login`

`POST {password: string}` (no email/account identifier), no session required.
Success: `{access_token: string, refresh_token: string}`. Install those with
`supabase.auth.setSession()`. The returned session is for the allowlisted
dedicated user only. Invalid credentials produce generic HTTP 401
`{error:"Sign-in failed"}`; malformed input is 400, throttling 429 and server
configuration/unavailability 503, without leaking Auth errors/email. Request
bodies are limited to 32 KiB.

### `thailand_initialize_trip`

Authenticated RPC arguments:

```ts
{
  p_title: string,
  p_start_date: string, // YYYY-MM-DD entered by the user
  p_end_date: string,
  p_timezone: string, // IANA name
  p_items?: Json[], // default []
  p_tasks?: Json[], // default []
  p_notes?: Json[]  // default []
}
```

Returns the **Trip JSON object**, not an array or `{trip: ...}` wrapper.
Initialization is one transaction, serialized per owner. It returns an existing
trip untouched on repeat, regardless of new arguments; it never resets data.
Private import is optional. No real dates, bookings, passengers, tickets,
checklists or other itinerary seed data are included.

Import item objects accept the Item domain fields except `trip_id` and base
record fields, with optional `id` UUID for relationships; `type` and `title`
are required. Task objects accept optional `id`, `item_id`, `details`,
`due_date`, `done`, `position`, and required `title`; notes accept optional
`id`, `item_id` and required `body`. Child `item_id` must reference an imported
item belonging to this trip. Identity/owner/trip/version/timestamp overrides
and unknown fields are rejected. Limits: 2,000 items, 5,000 tasks, 5,000 notes.
An invalid import rolls back the trip and all children. IDs should be omitted
unless needed for import relationships. Attachments are uploaded separately.

### Optimistic mutations

All rows have server-managed UUID/timestamps/version; inserts start at version
1, and every update sets `version = OLD.version + 1`, ignoring a caller's
version assignment. Use both predicates and return the row:

```ts
db.from('thailand_notes').update({ body })
  .eq('id', original.id).eq('version', original.version)
  .select().maybeSingle()
```

`data === null` means a stale/deleted row, **not success**. Preserve the draft
and reload rather than retrying with an invented version. Notes/tasks (and
empty trips, although the frontend does not delete trips) use
`.delete().eq('id', id).eq('version', version).select().maybeSingle()`.
Database row locks and the version predicate make these atomic. SQL cannot
infer whether an arbitrary caller supplied the predicates; the client must
always supply them. Nonempty trip deletion is rejected instead of cascading
into accidental data/file loss. File-bearing records have no direct DELETE
grant. Owner/trip/record identity and attachment metadata cannot be reassigned.

### Files

Bucket: **`thailand-documents`**, private. Allowed MIME types:
`application/pdf`, `image/jpeg`, `image/png`, `image/webp`; 1–10,485,760 bytes.
Do not trust the extension to identify file content; bucket enforcement checks
the declared MIME type, not malware or a file signature. Treat downloaded
documents as untrusted. No upsert, client object UPDATE or client object DELETE
is allowed, including through another application's broad policies.

1. Generate `attachment_id` and a filename with
   `file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'`.
   Reject the exact filenames `.` and `..`.
2. Insert `thailand_attachments` metadata with status `uploading`, original
   `name`, MIME/size, trip/item IDs and exact path
   `${trip_id}/${attachment_id}/${safe_filename}`.
3. Upload to that path with `upsert:false`, matching MIME type.
4. Update metadata to `ready` with the inserted ID **and version**, returning
   the row. The DB checks Storage metadata MIME and size before accepting ready.
   A failed/version-conflicted finalization must remain visible as unfinished.

No upload is authorized without staged, owned metadata. Abandoned/failed
uploads retain that metadata deliberately: the user can explicitly retry
cleanup through `thailand-delete-content` with the **current metadata version**
before attempting a fresh upload with a new UUID. Never delete metadata first
or silently forget an uploading row. Object reads/signed-URL creation require
owned metadata and no deletion claim. Keep signed URLs short (the frontend uses
60 seconds); a previously minted URL remains usable until expiry.

### `thailand-delete-content`

Authenticated `POST`:
`{table: 'itinerary_items' | 'attachments', id: string, version: number}`.
The **body table discriminator is logical/unprefixed**; the Edge Function maps
it to the namespaced physical table. Success: **`{ok:true}`**.

The user's client calls
`thailand_claim_content(p_table: 'thailand_itinerary_items' |
'thailand_attachments', p_id: uuid, p_version: integer)`.
This RPC validates the allowlisted identity and trip ownership, checks the
version under locks, and persists an immutable claim:
`{claim_id: uuid, paths: string[], completed: boolean}`.
The backend-only claim table means Item fields need no lifecycle change.
While a claim is active, triggers reject item/dependent edits, reparenting,
child insertion and attachment upload. Overlapping parent/attachment claims
are rejected, not silently merged.

The function removes only the claimed paths using the service Storage client,
then calls service-only
`thailand_finalize_content_deletion(p_claim_id: uuid, p_owner_id: uuid)`.
The finalizer refuses to proceed while any Storage object row remains, then
deletes dependent notes/tasks/attachments and the target in one transaction,
returning `{deleted:true}` internally. Direct item/attachment deletes are denied
even to a service SQL caller outside the finalizer. No generic caller-controlled
GUC can bypass the mutation guard.

Errors are explicit JSON `{error:string,retryable:boolean,claim_id?:string}`:

| HTTP | Error | Action |
| --- | --- | --- |
| 400 | `invalid_deletion_request` | Fix input |
| 401/403 | `authentication_required` | Sign in again/check allowlist |
| 404 | `content_not_found` | Reload; no ownership information disclosed |
| 409 | `version_conflict` | Preserve draft, reload; do not auto-delete latest |
| 409 | `parent_deletion_in_progress` / `dependent_deletion_in_progress` | Finish the other deletion, then retry |
| 409 | `claim_failed` with retryable=true | Retry after a transient deadlock |
| 503 | `storage_delete_failed` / `storage_cleanup_required` / `finalization_failed` / `claim_failed` | Retry the exact same table/id/version |

Partial file removal or finalization failure **retains the claim and rows**.
There is intentionally no unsafe “cancel claim and resume edits” operation.
Finish cleanup by retrying the original request. Identical retries reuse the
claim; completed receipts remain durable after rows are gone. Repeated calls
remove the recorded paths again before finalizing, including completed claims,
so delayed upload cleanup can be retried explicitly. Record IDs with receipts
cannot be reused.

For operational recovery, an administrator can inspect only
`thailand_private.thailand_deletion_claims` and replay each pending receipt
through the Edge Function using the dedicated account session. For abandoned
uploads, inspect `thailand_attachments where status = 'uploading'` and submit
their current id/version to the same endpoint. Do not delete `storage.objects`
rows with SQL in production: that does not remove physical bytes. If an upload
was interrupted at the Storage service/provider layer and bytes exist without
any object metadata, escalate to Storage's administrative/provider orphan
reconciliation; application SQL cannot prove the absence of such bytes.
Do not claim that the pgTAP metadata simulation tests physical object removal.

## Local development and tests

Prerequisites: existing frontend npm dependencies, Supabase CLI, Docker/Podman
for the isolated database, and optionally Deno for native function typechecks.
Never point local reset/tests at Collective. No trip seed runs.

```sh
supabase start
supabase db reset --local
supabase db lint --local
supabase test db supabase/tests/thailand_planner.test.sql
node --experimental-vm-modules --test supabase/tests/functions.test.mjs
node supabase/tests/typecheck.mjs
# Explicitly approved remote, rollback-only, two-session lock test:
THAILAND_TEST_PROJECT_REF=clkhiheomufzytfxrezn \
  node --test supabase/tests/concurrency.test.mjs
# With Deno installed:
deno check --config supabase/functions/deno.json \
  supabase/functions/thailand-shared-login/index.ts \
  supabase/functions/thailand-delete-content/index.ts
```

Provision a local confirmed user/allowlist as above, and serve functions with
private local prefixed secrets. Tests use synthetic `example.invalid` users
and sample dates only, inside a rolled-back local transaction. They cover
anonymous/other-project-user access, imported initialization/idempotency,
versions and stale deletes, checks, Storage fencing against broad existing
policies, claim mutation guards, and service-only finalization/throttling.
Node tests evaluate the actual Edge entrypoints against an SDK mock and cover
auth validation, generic errors, source hashing/trust, throttling, deletion
ordering, failures and completed-claim retries; they are not integration tests.

For real Storage integration, use the local API to upload a small allowed test
file, verify ready, deny other users, force a removal failure, then retry the
same deletion and verify file/rows are gone. Exercise concurrent upload/edit/
delete requests; PostgreSQL may abort a competing transaction with `40P01`
because row-trigger and claim locks can contend. Retry a transient deadlock
without dropping optimistic version predicates. Realtime publishes all five
namespaced tables; select policies still apply to change delivery. Avoid
`REPLICA IDENTITY FULL` because DELETE old-row payloads should not expose content.

### Verification in the implementation environment

Local Docker/Podman is unavailable, so local database startup/lint remained
blocked. With explicit user authorization, the migrations were applied only to
the approved project's new namespace, and all **78 pgTAP assertions passed**
inside a rolled-back transaction. The test-only pgTAP extension, synthetic
Auth users, trip data, broad test Storage policies, test bucket, claims and
throttle records were confirmed absent afterward. The existing Storage-policy
fingerprint was unchanged. No extension installation persisted.

The separate two-session concurrency test holds the exact namespaced trip
advisory lock used by a deletion claim and verifies that the real mutation
trigger times out rather than writing past it. Both sessions roll back; a
post-check verifies that its synthetic Auth user/trip did not persist. It does
not claim to test a complete concurrent file-upload/deletion race: physical
Storage uploads and live Auth/Edge calls still require separately approved
smoke tests. Sixteen mocked Edge tests, backend strict types and ESLint passed.
No new dependencies were installed.

## Rotation and incident handling

- Rotate the dedicated user's password through Admin Auth, keeping its UUID.
  Update the privately distributed shared password; it is not an Edge secret.
  Revoke that user's existing refresh sessions through the supported Admin
  mechanism. Changing a password alone is not a guarantee of immediate
  invalidation of already-issued access tokens.
- To immediately block planner database/file access, remove the allowlist entry
  as administrator (`delete from thailand_private.thailand_config where
  singleton`). This affects only Thailand. Existing signed URLs may live for
  their remaining short TTL. Restore only the reviewed dedicated UUID.
- Rotate the HMAC secret with a new namespaced secret and redeploy only the
  login function. This changes per-source buckets; global DB counters remain.
  Do not clear the counter table as part of normal deployment or login.
- If changing the dedicated email, update Auth and
  `THAILAND_SHARED_ACCOUNT_EMAIL` together; UUID validation prevents accidentally
  logging users into some other project's account.
- Do not replace the allowlisted UUID casually: existing trip/claim ownership
  intentionally does not transfer. A new UUID requires a separately reviewed
  namespaced data migration, not a reset.
- Rotate a compromised service-role key using the project's coordinated
  procedure: it is project-wide and impacts other apps. Do not do it as an
  isolated planner maintenance action. Log only non-sensitive lifecycle/error
  identifiers, never request bodies, passwords, tokens, signed URLs or imports.
