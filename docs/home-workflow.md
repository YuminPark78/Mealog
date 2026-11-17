# Home meal workflow

The `/home` page is a viewport-sized deck. The shared Home/Account navigation stays above it; content scrolls inside the active card. Forms can scroll internally when the keyboard or larger text reduces available space. The account page retains its own normal scrolling layout.

## Save boundary and navigation

1. Start with a camera photo, library photo, or manual entry.
2. Selecting a photo immediately prepares it and starts analysis on the review card. The same full-size photo panel replaces its two side-by-side camera/library buttons with the selected image; **Change photo** stays available there; there is no separate preview/Continue step. Review the editable meal name, carbohydrates in the planned personal serving, and local eating time. Photo sharing adjusts the carbohydrate suggestion; it is separate from confirmed consumption.
3. **Save meal & view history** creates the meal before comparisons are requested. Actual consumption starts unknown. A comparison failure never causes a second meal creation.
4. Explore up to three historical matches over −60 to +120 minutes. Current-meal readings automatically load on the same plot, show available readings through +120 minutes, and refresh once per minute while this workspace is visible and immediately when the browser tab becomes visible again. At creation only collected pre-meal data is drawn; the current curve extends after the final collection job runs (eating time +2 hours +10 minutes for source delay). The vertical domain includes post-meal values so peaks remain visible. Historical curves start muted; scrolling or the arrow controls highlights one. Insulin dose markers appear for the current and highlighted meals, with dose units and meal context below the graph. Scrolling or swiping on the graph changes the highlighted curve and slides the details strip horizontally. Details have no independent scrollbar. The graph fills the remaining vertical space, and both axis domains stay fixed during browsing. Routine glucose-status and disclaimer footer text is omitted. Up/down keyboard navigation provides an alternative to graph gestures. The **Add meal details** action sits beside the **Similar meals** heading; there is no visible arrow/counter toolbar below the graph, leaving that space for the details strip. Gaps and conflicting readings remain excluded.
5. **Add meal details** opens optional portion/activity/note/insulin editors. Each editor saves only its own data, then returns to comparisons. Insulin uses separate create/update endpoints and records doses already administered, not recommendations.

There is no persistent Back/Next toolbar. Contextual arrows return from review to entry, from follow-up to comparisons, and from each editor to its detail menu. Leaving unsaved fields asks for confirmation. After saving, selecting the **Log a meal** bookmark starts a new draft. Unsaved drafts are preserved when switching bookmarks.

**Meals** is a persistent bottom bookmark beside **Log a meal** and **Insulin**. The full-width bookmark row occupies its own space below the card. The active bookmark shares the card background and covers only its one-pixel border seam; inactive bookmarks are darker. Tabs keep a fixed position and never overlap card content. Arrow keys, Home and End navigate the bookmarks. Workspaces preserve drafts when switching away. Selecting **Meals**, including when already active, resets that workspace to **Recent meals**, with confirmation before discarding unsaved meal details. The recent list scrolls inside a rounded inset card with padding below the last record and a fixed gap above the bookmarks. The meal list refreshes when revisited, and each meal offers direct **Add details** or **View history** actions.

**Insulin** supports recording an injection without a meal, optionally linking a recent meal, and editing recent entries. Creation uses the same frozen-payload/idempotency retry behaviour as meal follow-up.

**Recent meals** reopens existing records using an owner-scoped GET. Saved meals use `/home?meal=<id>` so the selected record can be reopened after reload. Photo/draft contents are held in memory rather than browser storage. Persistent photo storage and editing saved name/carbohydrate/time fields are outside this first iteration.

## Components

- `components/layout/app-navigation.tsx`: shared navigation.
- `components/home/home-workflow.tsx`: authentication, draft/photo lifecycle, requests, viewport/keyboard sizing, and step transitions.
- `lib/meal-workflow.ts`: workflow reducer and shared comparison domain calculation.
- `meal-source-card.tsx` / `meal-details-card.tsx`: entry and review.
- `meal-comparison-card.tsx` / `historical-glucose-chart.tsx`: fixed plot, scrolling historical records, and recorded context.
- `meal-follow-up-card.tsx`: independent editors and saved insulin entries.
- `recent-meals-sheet.tsx` / `meals-workspace.tsx`: bounded recent-meal list and direct saved-meal actions.
- `insulin-workspace.tsx`: standalone insulin recording and editing.
- `lib/meal-photo.ts`: supported photo preparation, downscaling, and encoding. Unsupported HEIC gets a manual-entry/export-JPEG fallback.

Card transitions use 360 ms and reverse direction for contextual return actions. Browsers with View Transitions animate both outgoing and incoming cards; other browsers animate entry. Reduced-motion preferences disable deck movement and curve-emphasis transitions.

## Backend additions

Apply the additive migration `20261113120000_creation_request_ids.sql` before running the new submissions. It adds per-user creation-request IDs/hashes and uniqueness constraints to meals and insulin events.

`POST /meals` and `POST /insulin-events` accept an optional UUID `Idempotency-Key` header. Repeating the same payload/key returns the existing record, including after a lost response or concurrent request. Reusing a key with a different original payload returns 409. Old callers without a key continue to work. The UI keeps an uncertain submission's payload fixed until retry resolves it.

`GET /meals/{id}` returns only a meal owned by the authenticated user; missing/foreign IDs return 404. Existing auth verification, RLS, context timestamp validation, glucose collection, and matching rules remain in force.

Normal login and Google/email confirmation return to `/home`. Local Supabase redirect URLs include Home. Configure equivalent allowed URLs for a hosted deployment.

## Verification completed

- Frontend lint, TypeScript, and production build passed.
- 61 backend unit/local PostgreSQL checks passed. Database fixtures are synthetic and rolled back.
- 13 frontend/browser checks passed, including photo review, portion calculation, save-before-compare, interrupted meal and insulin retries, comparison failure/retry, fixed chart axes under scrolling, narrow-screen layout, follow-up, and reopening saved meals.
- New frontend end-to-end checks use mocked authentication/provider/API data, not real photos or personal glucose records. Native camera and keyboard behaviour still warrant testing on a physical phone. No real Dexcom requests were necessary for this UI change.

Commands:

```sh
# apps/web
npm run lint
npx tsc --noEmit
npm run build
MEALOG_WEB_URL=http://localhost:3000 npx playwright test tests/home-workflow.spec.ts tests/home-photo.spec.ts tests/home-tabs.spec.ts tests/meal-comparison.spec.ts tests/meal-context.spec.ts tests/datetime.spec.ts --workers=1
```

```sh
# services/api
uv run pytest tests/unit -q
# Real database checks require MEALOG_TEST_DATABASE_URL pointing to migrated local Supabase.
uv run pytest tests/integration -q
```

## Surface styling

Home and Account share frosted panels, translucent navigation and soft coral/sage background gradients through `app-frame.module.css`. Text stays fully opaque, and chart plot backgrounds use a denser frosted surface for readability. Glass styles follow light/dark theme tokens and fall back to solid surfaces for reduced-transparency preferences. The bottom tab row remains outside the card content area.
