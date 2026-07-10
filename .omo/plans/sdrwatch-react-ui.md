# SDRWatch Flask → React SPA Migration

Refactor from Flask Jinja2 templates + inline JS + Tailwind CDN to a React SPA served by the existing Flask backend. Flask REST APIs already exist and are consumable as-is. Incremental migration: React and Jinja2 pages coexist via Flask catch-all route.

## TODOs

### Wave 1 — Foundation (Parallel, no deps)

1. [x] Vite + React + TypeScript scaffolding. Create sdrwatch_ui/ with package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js, index.html, src/main.tsx, src/App.tsx, src/index.css. Verify npm run build and npm run dev work. Category: visual-engineering. QA: npm run build produces dist/.

2. [x] New chart data API endpoints (backend). Create sdrwatch_web/blueprints/api_charts.py with 7 JSON endpoints (timeline, coverage-heatmap, snr-histogram, frequency-bins, top-services, strongest-signals) plus GET /api/baselines/\<id>. Extract query logic from charts.py returning clean JSON. Register in app.py. Category: deep. QA: curl each endpoint returns valid JSON.

### Wave 2 — Shell (needs Wave 1)

3. [x] API client + auth + types. Create src/api/client.ts (fetch wrapper with localStorage SDRWATCH_TOKEN Bearer auth) and src/types/index.ts (TypeScript interfaces for all API responses: Baseline, Signal, SnapshotData, TimelineData, HeatmapData, ChangeEvent, Recording, Job). Category: quick. QA: npm run typecheck passes.

4. [x] AppLayout + NavBar + React Router. Create AppLayout.tsx, NavBar.tsx matching base.html. React Router with 9 routes (placeholder pages). Baseline selector in nav persisting via URL query param. Auth status indicator. PostCSS Tailwind (no CDN). Category: visual-engineering. QA: Navigate all 9 routes, baseline selector updates URL.

### Wave 3 — Core Pages (needs Wave 2, parallel)

5. [x] Dashboard page (React). Full DashboardPage with: baseline selector, tactical snapshot stats (persistent signals count, recent new, last update), signal card grid (50 active signals), frequency bar chart (latest + average bins), timeline chart (detections/scans/SNR over time), coverage heatmap, SNR histogram, change feed preview, filter bar (service, min SNR, lookback, frequency range). Sub-components: SignalCard, SignalCardGrid, FreqBarChart, TimelineChart, CoverageHeatmap, SNRHistogram, FilterBar, TacticalSnapshot, ChangeFeedPreview, TopServicesList, StrongestSignalsList. CSS-only bar charts (no charting library). Polling via setInterval 5s. Category: deep. QA: All 6 chart sections render, polling works, filters work.

6. [x] Signals List page (React). Table with ID, center frequency, bandwidth, label, classification chip, confidence, hits, last seen. Filter toolbar: baseline, classification, selected-only. Uses existing /api/signals. Category: quick. QA: Table renders, filters work, links to signal detail.

7. [x] Signal Detail page (React). Signal header, threat assessment, classification/label/notes edit form (PATCH), recording controls (Record IQ, Mute), captures list, collection context, real-time panel indicator. Uses existing /api/signals/\<id>. Category: quick. QA: Detail renders, classification PATCH works.

8. [x] Changes page (React). Baseline filter, event type chips (ALL, NEW_SIGNAL, QUIETED, POWER_SHIFT), change event feed with color per type. Uses existing /api/baseline/\<id>/changes. Category: quick. QA: Event types filter correctly.

9. [x] Control page (React). Baseline/device/profile selectors, sweep/detection/CFAR/persistence config forms, continuous capture config, log viewer, baseline create form, preset buttons. Uses existing /api/jobs, /api/baselines, /api/profiles, /ctl/devices. Category: unspecified-low. QA: Forms render, job start/stop works.

### Wave 4 — Remaining Pages (needs Wave 3)

10. [x] Remaining pages (React). LivePage (job status, windows table, strip chart), SpurMapPage (spur entries table), DebugPage (health, DB stats, config, error ring), RecordingsPage (filter toolbar, recordings table, expandable rows). Category: unspecified-low. QA: Each page matches Jinja2 original.

### Wave 5 — Deployment (needs Wave 4)

11. [x] Flask catch-all + Docker multi-stage. Add catch-all route in app.py serving index.html for non-/api paths. Docker multi-stage build (node→python). Token injection via meta tag. Category: unspecified-high. QA: docker build succeeds, Flask serves SPA.

### Wave 6 — Verification (needs Wave 5)

12. [x] Final verification. npm run build, ruff check, pytest. Walk through every page against live backend. Compare each React page with Jinja2 original for feature parity. Category: unspecified-high. QA: All checks pass, feature parity confirmed.

## Final Verification Wave

F1. [x] All 9 React pages render with feature parity to Jinja2 originals
F2. [x] Chart data renders correctly (CSS bars, no charting library)
F3. [x] Auth works (localStorage SDRWATCH_TOKEN + Bearer header)
F4. [x] Baseline selector persists across routes
F5. [x] 5-second polling keeps Dashboard data current
F6. [x] Docker multi-stage build produces working image
F7. [x] ruff check and npm run typecheck pass with 0 errors
F8. [x] React and Jinja2 templates coexist during migration
