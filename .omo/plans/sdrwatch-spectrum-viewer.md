# Spectrum Viewer — Zoomable Frequency vs Power with Signal/Recording Overlays

New page at `/spectrum` showing real PSD data from `baseline_noise.power_ema` with zoom/pan via Canvas 2D, colored signal markers, and recording markers.

## TODOs

### Wave 1 — Foundation (Parallel)

1. [x] `/api/spectrum` endpoint. Create sdrwatch_web/blueprints/api_spectrum.py. Query baseline_noise joined with baselines for frequency mapping. Parameters: baseline_id (required), f_min_hz, f_max_hz, points (default 1000). Downsample via uniform decimation. Return {freqs, power_db, noise_db}. Register in app.py. Category: deep. QA: curl returns valid JSON with correct array lengths.

2. [x] useZoomPan hook. Create sdrwatch_ui/src/hooks/useZoomPan.ts. State: centerHz, spanHz, minDb, maxDb. Handlers: onWheel (zoom around cursor), onMouseDown/Move/Up (drag pan), onDoubleClick (zoom to freq), reset(). Auto-scale Y from data percentiles. xScale(freqHz): number, yScale(powerDb): number. Category: deep. QA: xScale(100e6) returns correct pixel for given canvas width.

### Wave 2 — Types + Canvas + Blueprint (needs Wave 1)

3. [x] SpectrumData type + fetch helper. Add SpectrumData interface to types/index.ts. Add fetchSpectrum() to api/client.ts. Category: quick. QA: tsc --noEmit passes.

4. [x] SpectrumCanvas component. Create sdrwatch_ui/src/components/SpectrumCanvas.tsx. Canvas 2D rendering with ctx.setTransform(). Layers: grid lines, frequency trace (filled area + line), noise floor (dashed), signal markers (colored vertical by classification), recording markers (dashed vertical orange), axis labels, DPR scaling. Props: data, signals, recordings, zoomPan. Category: deep. QA: Canvas renders at correct DPR, tooltips appear on marker hover.

5. [x] Register blueprint in app.py. Category: quick. QA: curl returns 200 after restart.

### Wave 3 — Page + Routes (needs Wave 2)

6. [x] SpectrumPage page. Create sdrwatch_ui/src/pages/SpectrumPage.tsx. Fetch spectrum data every 5s, fetch signals, fetch recordings in visible range. Loading/error states. Reset button. Category: unspecified-high. QA: Page loads, polling works.

7. [x] Route + nav link. Add /spectrum route in App.tsx. Add "Spectrum" link in NavBar.tsx. Category: quick. QA: Navigate to /spectrum renders page, nav link active.

## Final Verification Wave

F1. [x] /api/spectrum endpoint returns correct PSD data with frequency mapping
F2. [x] Mouse wheel zooms centered on cursor, drag pans, double-click zooms in
F3. [x] Signal markers show as colored vertical lines by classification
F4. [x] Recording markers show as dashed vertical lines
F5. [x] Page polls every 5s, loading/error states work
F6. [x] ruff check passes, tsc --noEmit passes, Docker build succeeds
