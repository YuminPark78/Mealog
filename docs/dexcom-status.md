# Dexcom status and sleeping API startup

Account reads the saved Dexcom status once when entered and on an explicit load retry. It does not poll every 15 seconds or refresh on browser visibility changes. Loading saved status does not verify credentials with Dexcom.

The status header shows `last_check_at` from the backend in the device's local timezone. Successful connection/credential updates and explicit tests update this timestamp. An unsuccessful actual Dexcom test also updates it with the failed result. A transport/startup error preserves the last known status and timestamp.

Before loading saved status or sending a connect/test/disconnect action, the frontend checks the existing `/health` endpoint. `lib/api-readiness.ts` accepts only the FastAPI JSON health response, tolerates temporary platform HTML/network errors, and retries read-only health requests with exponential backoff up to 8 seconds. Startup has a 120-second overall deadline; each request has a 15-second limit. Cancellation on navigation stops waiting. Missing/misconfigured health endpoints fail without repeated retries.

The status symbol becomes a spinner during startup and account actions. The interface distinguishes “Starting connection service…” from “Checking Dexcom…”. Once ready, the account action has its own 70-second timeout. The action is sent once, with no automatic mutation retries. Returned status updates the card directly, without a redundant GET.

Glucose collection remains independent; worker scheduling and runtime are unchanged. Cold-start handling here is scoped to Account/Dexcom, not all meal API requests. The deployment must allow the hosted frontend origin through API CORS, including `/health`.

Verification uses synthetic health/auth/account responses, with no real Dexcom requests:

```sh
# apps/web
npm run lint
npx tsc --noEmit
MEALOG_WEB_URL=http://localhost:3000 npx playwright test tests/api-readiness.spec.ts tests/dexcom-status.spec.ts --workers=1
```

API URLs are joined through `lib/api-url.ts`, so a trailing slash in `NEXT_PUBLIC_API_BASE_URL` cannot produce paths such as `//health` or `//account/dexcom`. The Account card keeps Connect available if saved status cannot load, while clearly marking that state as unverified. An unavailable endpoint is never treated as proof that an account has no saved records.
