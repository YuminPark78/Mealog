# Completing milestones 3–5

This implementation completes the code for insulin editing, independently timed
meal activity/notes, collector regression checks, and a combined meal timeline.
Photo-assisted logging remains the next feature after the acceptance checks below.

Verification completed in this workspace: the migration was applied to local
Supabase; 37 backend unit checks, all seven real PostgreSQL checks, eight frontend
helper checks, lint, TypeScript, and the synthetic browser flow passed. Live Dexcom
account retrieval and the interactive two-account API script were not run.

## 1. Apply the database change

From the repository root, with local Supabase running:

```sh
npx supabase migration up --local
```

Do not reset the database. The additive migration
`supabase/migrations/20261109100000_event_times_and_insulin_edits.sql`:

- Adds `meals.activity_at` and `meals.notes_at` as timezone-aware timestamps.
- Preserves existing records without inventing historical event times.
- Extends the context audit trigger to include timestamp-only corrections.
- Adds `insulin_events.updated_at`, column-specific editing privileges, and an
  owner-only update policy. Ownership and creation time cannot be edited.
- Keeps the existing composite foreign key enforcing ownership of linked meals.

The existing model stores **one activity summary and one note per meal**, with
separate occurrence times. Multiple activities/notes and unlinked activity records
would need a later event-table extension. Insulin already supports multiple events
and may be unlinked from a meal.

## 2. Backend behavior and request examples

Restart FastAPI after applying the migration:

```sh
cd services/api
uv run uvicorn mealog_api.main:app --reload --port 8000
```

All requests below require the signed-in user's bearer token.

### Correct insulin

`PUT /insulin-events/{event_id}` replaces editable fields. Send the entire editable
record; omitted optional fields become null. The service checks linked-meal
ownership and normalizes injection time to UTC. Missing/foreign records return 404;
invalid doses, timezone-free times and client-supplied ownership return 422.

```json
{
  "meal_id": "22222222-2222-4222-8222-222222222222",
  "dose_units": "2.500",
  "insulin_name": "Recorded insulin name",
  "injected_at": "2026-11-09T11:50:00+08:00",
  "notes": "Corrected administration time"
}
```

The repository filters updates by both event ID and authenticated owner. Database
row-level security provides a second ownership check. `updated_at` changes only
when editable values actually differ.

### Correct activity and notes

`PATCH /meals/{meal_id}/context` changes only supplied fields. Send each content/time
pair together when changing either member:

```json
{
  "activity_after": "light_activity",
  "activity_at": "2026-11-09T12:30:00+08:00",
  "notes": "Walk started after lunch",
  "notes_at": "2026-11-09T12:35:00+08:00"
}
```

To clear a recorded detail, clear both members:

```json
{
  "activity_after": null,
  "activity_at": null
}
```

`context_updated_at` remains an audit timestamp; it is never used to position
activity or notes on the timeline. Legacy notes created through the meal-create
endpoint can still have an unknown occurrence time; add it through the context
editor to include them in the timeline.

Relevant code:

- `services/api/src/mealog_api/schemas/meals.py`
- `services/api/src/mealog_api/{routes,services,repositories}/insulin_events.py`
- `apps/web/src/components/{insulin/insulin-events-panel,meals/meal-context-form}.tsx`
- `apps/web/src/lib/datetime.ts`: device-local inputs, absolute ISO requests, and
  preservation of an unchanged timestamp's original precision.

## 3. Collector behavior and verification

The worker collects **meal windows**, not a continuous whole-day glucose archive.
Each meal queues an initial and final job covering eating time ±2 hours. The final
job is scheduled ten minutes after the window ends. It must run as a separate
process; starting FastAPI does not start collection.

Required backend configuration in `services/api/.env`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<your local publishable key>
DATABASE_URL=<your local PostgreSQL connection URL>
DEXCOM_ENCRYPTION_KEY=<a persistent Fernet key>
```

Generate a key once, retain it, and never commit it:

```sh
cd services/api
uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Connect an account and start the collector in separate terminals:

```sh
cd services/api
uv run python scripts/connect_dexcom.py
```

```sh
cd services/api
uv run python -m mealog_api.jobs.glucose_worker
```

The worker stores readings using `(connection_id, measured_at)` as the unique key.
Repeated readings update collection metadata. A changed value at the same source
time is flagged as conflicting while the original value is retained. One
transaction covers claiming a job, inserting its batch and completing the job;
an interruption rolls back the batch and leaves the job available for retry.

This change also defers a future meal's initial job until its window starts and
keeps retryable failures pending. An exhausted final job becomes failed. Initial
and final jobs have separate retry budgets (three attempts each).

### Automated checks

Backend unit checks and opt-in real PostgreSQL checks:

```sh
cd services/api
uv run pytest tests/unit -q
```

```sh
cd services/api
# Use a migrated local development database, never production.
export MEALOG_TEST_DATABASE_URL='<local PostgreSQL connection URL>'
uv run pytest tests/integration -q
```

The integration fixture creates synthetic users/data within a rollback-only outer
transaction. Worker transactions run in savepoints and are scoped to the fixture's
meal, leaving other queued jobs untouched. Checks cover:

- Repeated/overlapping jobs retain exactly 49 synthetic readings.
- Conflicting values are flagged without overwriting the original.
- A failure after the first insert rolls back the partial batch; another worker
  invocation succeeds.
- Retry scheduling, exhaustion, future meals and source-account mismatch.
- Database privacy for meals, insulin, readings, windows and connections.
- Owner-only insulin edits and blocked ownership changes.
- Timestamp corrections, equivalent instants and clearing details.

These checks use a synthetic source. They verify the database/worker flow without
contacting Dexcom. They do not prove real Dexcom credentials or account access.

### Live acceptance

1. Run `uv run python scripts/check_private_meals.py` using two different test
   accounts. This creates synthetic development meal/insulin records.
2. Connect Dexcom and keep the worker running. Save a recent meal and load its
   timeline at `/account`.
3. Confirm stored readings appear and that reloading the timeline does not fetch
   from Dexcom or duplicate readings.
4. For a full window, wait until two hours and ten minutes after eating and confirm
   the final job reports ready, partial, or failed rather than remaining pending.
5. Confirm the second account cannot read the first account's glucose snapshot or
   edit its insulin/context through either the API or direct database access.

## 4. Combined timeline

`GET /meals/{meal_id}/glucose` now returns `activities` and `notes` alongside
`readings`, `meals` and `injections`. Each event kind is selected using its own
occurrence timestamp inside the glucose window, even if its associated meal was
eaten outside that window. Every query is scoped to the authenticated user.

The chart at `/account` shows:

- Blue glucose curve, with breaks for missing/conflicting readings.
- Gray meal, purple insulin, green activity and amber note markers.
- A chronological text list with full device-local dates/times and event details.
- Events even when no glucose readings have arrived.

Successful context or insulin edits invalidate loaded charts. Click **Load meal
timeline** again to retrieve the corrected snapshot. **Refresh timeline** reads
stored data; it does not run the collector. Records with unknown occurrence times
are omitted until corrected.

Frontend checks:

```sh
cd apps/web
npm run lint
npx tsc --noEmit
npx playwright test tests/meal-context.spec.ts tests/datetime.spec.ts
```

For the synthetic browser flow, start the frontend with `npm run dev`, then run:

```sh
cd apps/web
MEALOG_WEB_URL=http://localhost:3000 npx playwright test tests/milestones-ui.spec.ts --workers=1
```

This uses installed Google Chrome, mocks authentication/API responses, and checks
insulin editing, local-to-UTC conversion, independent event times, all four timeline
markers, clearing details, and event markers before any glucose samples arrive.
It does not replace live account/collector checks.

## Before starting photo-assisted logging

All unit/type/lint checks, the browser scenario, database regression suite and live
acceptance checks should pass. Apply the migration before running the updated API;
code present in the repository alone does not establish a working deployment.
