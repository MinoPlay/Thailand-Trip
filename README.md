# Thailand Trip

A private, shared travel planner with a responsive React interface, GitHub Pages hosting, and Supabase persistence. Everyone with the trip password can edit the same itinerary.

## What is included

- Month and week calendars plus a mobile-first daily agenda.
- Overnight accommodation, distinct transfer legs, activities, booking/provider details, and safe map links.
- Shared checklist, trip/item notes, and private PDF/image attachments.
- Missing-information warnings, preparation states, and checkmarks.
- Live synchronization, explicit connection/save errors, and version conflicts that preserve drafts.

The public website contains no itinerary, password, tickets, or booking references. Trip data is loaded after authentication from Supabase.

## Local development

Requires Node.js 24 or later.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using the project's URL and public publishable key. These two values are public configuration, not privileged credentials. Without configuration the app displays a setup notice; it does not pretend to save data locally.

## Supabase setup

Follow [the backend setup instructions](supabase/README.md) to apply the namespaced migrations, provision the dedicated shared account, configure its allowlist and login function, and deploy the functions.

Existing projects are supported: application objects are prefixed `thailand_`, its Edge Functions are named `thailand-shared-login` and `thailand-delete-content`, and its private Storage bucket is `thailand-documents`. Do not reset an existing database or change its global signup configuration. Existing users are not automatically authorized to access this trip.

After login, the first-run form creates the shared trip once. Enter the travel dates and optionally paste a private JSON object containing `items`, `tasks`, and `notes` arrays. Fields match [the data models](src/lib/models.ts), excluding IDs, ownership, versions, and timestamps; backend validation applies. Never commit your import file or real booking data. Repeating setup does not reset progress or resurrect deleted tasks.

Calendar days use the trip's IANA time zone, not the device's zone. Transfer start and end times retain their own zones. Stays cover check-in nights through the night before checkout. Save incomplete entries as drafts; missing essentials remain visible even after an item is marked done.

The optional operator scripts reuse existing CLI authentication:

- `scripts/provision_account.py` creates only the dedicated shared account, prompts for its password without saving it, and writes public client configuration to ignored `.env.local`. Provision the account allowlist separately as documented in the backend instructions.
- `scripts/configure_deployment.py` sets only the trip's namespaced function secrets and the two public GitHub Actions variables. It never stores the account password in Edge secrets.
- `scripts/live_smoke.py` checks the real login/data/file flow, using only newly created synthetic records for write/delete checks. Its optional `--initialize-from` accepts a private JSON file for first-time setup. Run `--help` before use.

## Checks

```sh
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests use synthetic data and mocked Supabase requests on desktop and mobile. They do not connect to your real trip. Backend authorization and integrity tests run with `supabase test db` against the local Supabase stack; see the backend instructions. GitHub Actions runs both frontend and database checks.

For an explicitly authorized real deployment check, `scripts/live_smoke.py --session-output /private/path/session.json` can export a short-lived session with owner-only permissions. Supply that path as `TRIP_SMOKE_SESSION` when running `npx playwright test --config playwright.live.config.ts`; optionally set `TRIP_LIVE_URL` to the published site URL. This separate test creates and removes its own uniquely labeled task and verifies synchronization between desktop and mobile browser contexts. Delete the private session file afterward. These live checks never run in normal CI.

## GitHub Pages

1. In repository Settings → Pages, select **GitHub Actions** as the source.
2. Set repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Configure the deployed site's origin in the Supabase login function's allowed origins.
4. Push to `main` or run **Deploy GitHub Pages** manually.

The Vite build uses `/Thailand-Trip/` when running in GitHub Actions. Navigation stays within the page, so project-path reloads do not depend on SPA rewrites. A different repository name requires updating the Pages base path in `vite.config.ts`.

Deployment only uploads the static frontend; migrations, account provisioning, and Edge Functions are deployed separately. Never put a service-role key, account password, refresh token, or private trip JSON into an Actions variable or a `VITE_` variable. Change the shared account password and revoke its sessions in Supabase when access needs to be removed.

## Data and operations

Only PDF, JPEG, PNG, and WebP files up to 10 MiB are accepted. Documents stay in a private bucket and download through short-lived links. Interrupted uploads and deletions remain visible and retryable; remove an unfinished upload before retrying it.

Editing requires a connection. Open drafts are kept in memory after failed saves, but they are not an offline backup and are lost when the page is closed. Review the current record before explicitly reapplying a conflicted draft.

Use the Supabase project's database backup/export facilities and private Storage export for backups. Retain the migrations alongside exports and protect both as private data. A database export alone does not include ticket files. Restore only to a separate test project first; never overwrite unrelated tables in a shared project.
