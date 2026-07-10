"""Sweep orchestration helpers tying drivers, DSP, and detection together."""

from __future__ import annotations

import time
from typing import Any

import numpy as np  # type: ignore

from sdrwatch.baseline.events import BaselineEventWriter
from sdrwatch.util.logging import get_logger

_log = get_logger(__name__)
from sdrwatch.baseline.spur import SpurCalibrationTracker
from sdrwatch.baseline.stats import BaselineStatsUpdater
from sdrwatch.baseline.store import BaselineContext, Store
from sdrwatch.baseline.summary import BandSummaryConfig
from sdrwatch.detection.engine import DetectionEngine
from sdrwatch.detection.types import RevisitTag, Segment
from sdrwatch.dsp.detection import detect_segments
from sdrwatch.dsp.fft import compute_psd_db
from sdrwatch.dsp.noise_estimation import robust_noise_floor_db
from sdrwatch.dsp.power_monitor import WindowPowerMonitor
from sdrwatch.io.bandplan import Bandplan
from sdrwatch.recording.recorder import IQRecorder
from sdrwatch.sweep.scheduler import WindowScheduler
from sdrwatch.util.scan_logger import ScanLogger


class _QueuedTarget:
    """Minimal detection-like wrapper for queued recording rows (tuples from sqlite3)."""
    def __init__(self, row):
        self.queued_id = int(row[0])  # recordings.id
        self.id = int(row[0])         # also used as detection_id for IQRecorder
        self.f_center_hz = int(row[1])  # f_center_hz
        self.snr_db = 0.0
        self.f_low_hz = self.f_center_hz - 50000
        self.f_high_hz = self.f_center_hz + 50000
from sdrwatch.recording.cleanup import enforce_retention


def _select_revisit_segment(tag: RevisitTag, segments: list[Segment]) -> Segment | None:
    for seg in segments:
        if seg.f_low_hz <= tag.f_center_hz <= seg.f_high_hz:
            return seg
        if tag.f_low_hz <= seg.f_center_hz <= tag.f_high_hz:
            return seg
    return None


def _segment_shape_kwargs_from_args(args) -> dict[str, Any]:
    def _clean_float(attr: str, default: float) -> float:
        val = getattr(args, attr, None)
        if val in (None, ""):
            return default
        try:
            return float(val)
        except Exception:
            return default

    def _clean_int(attr: str, default: int) -> int:
        val = getattr(args, attr, None)
        if val in (None, ""):
            return default
        try:
            return int(val)
        except Exception:
            return default

    raw_drop = getattr(args, "bandshape_drop_db", None)
    try:
        drop_val = float(raw_drop) if raw_drop not in (None, "") else None
    except Exception:
        drop_val = None

    return {
        "center_mode": str(getattr(args, "segment_center_mode", "midpoint") or "midpoint"),
        "centroid_span_hz": _clean_float("segment_centroid_span_hz", 240_000.0),
        "centroid_drop_db": _clean_float("segment_centroid_drop_db", 20.0),
        "centroid_floor_margin_db": _clean_float("segment_centroid_floor_margin_db", 2.0),
        "bandshape_mode": str(getattr(args, "bandshape_mode", "minus6db") or "minus6db"),
        "bandshape_drop_db": drop_val,
        "bandshape_window_bins": max(3, _clean_int("bandshape_window_bins", 24)),
        "bandshape_curvature_db": _clean_float("bandshape_curvature_db", 3.0),
        "bandshape_min_prominence_db": _clean_float("bandshape_min_prominence_db", 1.0),
        "bandshape_polyfit_bins": max(3, _clean_int("bandshape_polyfit_bins", 10)),
        "split_peak_drop_db": _clean_float("split_peak_drop_db", 4.0),
        "split_noise_margin_db": _clean_float("split_noise_margin_db", 1.5),
        "split_min_valley_bins": max(1, _clean_int("split_min_valley_bins", 2)),
        "split_min_peak_prominence_db": _clean_float("split_min_peak_prominence_db", 2.0),
    }


def _run_revisit_pass(
    args,
    src,
    detection_engine: DetectionEngine,
    tags: list[RevisitTag],
    logger: ScanLogger | None = None,
    segment_shape_kwargs: dict[str, Any] | None = None,
) -> dict[str, int]:
    stats = {"total": len(tags), "confirmed": 0, "false_positive": 0}
    if not tags:
        return stats

    revisit_fft = int(getattr(args, "revisit_fft", 0) or max(int(args.fft), int(args.fft * 2)))
    revisit_avg = int(getattr(args, "revisit_avg", 0) or max(int(args.avg), 4))
    revisit_threshold = float(getattr(args, "revisit_floor_threshold_db", args.threshold_db))
    revisit_guard = int(getattr(args, "guard_bins", 1))
    revisit_min_width_bins = int(max(1, getattr(args, "min_width_bins", 2)))
    raw_margin = getattr(args, "revisit_margin_hz", None)
    if raw_margin is None or float(raw_margin) <= 0.0:
        revisit_margin_hz = float(getattr(detection_engine, "revisit_margin_hz", 0.0))
    else:
        revisit_margin_hz = float(raw_margin)
    revisit_params = {
        "fft": revisit_fft,
        "avg": revisit_avg,
        "threshold_db": revisit_threshold,
        "guard_bins": revisit_guard,
        "min_width_bins": revisit_min_width_bins,
        "margin_hz": revisit_margin_hz,
        "samp_rate_hz": args.samp_rate,
        "two_pass": bool(getattr(args, "two_pass", False)),
        "max_bands": int(getattr(args, "revisit_max_bands", 0) or 0),
    }
    if logger:
        logger.log(
            "revisit_start",
            baseline_id=detection_engine.baseline_ctx.id,
            tag_count=len(tags),
            revisit_params=revisit_params,
        )

    segment_shape_kwargs = segment_shape_kwargs or _segment_shape_kwargs_from_args(args)

    for tag in tags:
        _log.debug("revisit tag=%s reason=%s center=%.6fMHz", tag.tag_id, tag.reason, tag.f_center_hz / 1e6)
        try:
            src.tune(tag.f_center_hz)
            _ = src.read(int(revisit_fft))
            samples = src.read(int(revisit_fft * revisit_avg))
        except Exception as exc:
            _log.warning("revisit tag=%s tune_error: %s", tag.tag_id, exc)
            if logger:
                logger.emit_error("revisit_tune", str(exc), exc_info=exc, tag_id=tag.tag_id)
            detection_engine.apply_revisit_miss(tag)
            if tag.reason == "new":
                stats["false_positive"] += 1
            if logger:
                logger.log(
                    "revisit_result",
                    tag_id=tag.tag_id,
                    reason=tag.reason,
                    center_hz=tag.f_center_hz,
                    coarse_width_hz=max(tag.f_high_hz - tag.f_low_hz, 0),
                    error=str(exc),
                    matched=False,
                )
            continue

        baseband_f, psd_db = compute_psd_db(samples, args.samp_rate, revisit_fft, revisit_avg)
        rf_freqs = baseband_f + tag.f_center_hz
        segs, _, _ = detect_segments(
            rf_freqs,
            psd_db,
            thresh_db=revisit_threshold,
            guard_bins=revisit_guard,
            min_width_bins=revisit_min_width_bins,
            cfar_mode=args.cfar,
            cfar_train=args.cfar_train,
            cfar_guard=args.cfar_guard,
            cfar_quantile=args.cfar_quantile,
            cfar_alpha_db=args.cfar_alpha_db,
            abs_power_floor_db=getattr(args, "abs_power_floor_db", None),
            **segment_shape_kwargs,
        )
        match = _select_revisit_segment(tag, segs)
        if match:
            detection_engine.apply_revisit_confirmation(tag, match)
            stats["confirmed"] += 1
        else:
            detection_engine.apply_revisit_miss(tag)
            if tag.reason == "new":
                stats["false_positive"] += 1
        if logger:
            measured_width = float(match.bandwidth_hz) if match else None
            logger.log(
                "revisit_result",
                tag_id=tag.tag_id,
                reason=tag.reason,
                center_hz=tag.f_center_hz,
                coarse_width_hz=max(tag.f_high_hz - tag.f_low_hz, 0),
                matched=bool(match),
                measured_width_hz=measured_width,
                segment_count=len(segs),
                strongest_snr_db=(max(seg.snr_db for seg in segs) if segs else None),
            )
    if logger:
        logger.log(
            "revisit_summary",
            total=stats.get("total", 0),
            confirmed=stats.get("confirmed", 0),
            false_positive=stats.get("false_positive", 0),
        )
    return stats


class Sweeper:
    """Orchestrate a single sweep across scheduled windows."""

    def __init__(
        self,
        args,
        store: Store,
        bandplan: Bandplan,
        baseline_ctx: BaselineContext,
        logger: ScanLogger | None = None,
    ) -> None:
        self.args = args
        self.store = store
        self.bandplan = bandplan
        self.baseline_ctx = baseline_ctx
        self.logger = logger

    def _sweep_params(self) -> dict[str, Any]:
        args = self.args
        return {
            "start_hz": args.start,
            "stop_hz": args.stop,
            "step_hz": args.step,
            "samp_rate_hz": args.samp_rate,
            "fft": args.fft,
            "avg": args.avg,
            "threshold_db": args.threshold_db,
            "guard_bins": args.guard_bins,
            "min_width_bins": args.min_width_bins,
            "cfar_mode": args.cfar,
            "cfar_train": args.cfar_train,
            "cfar_guard": args.cfar_guard,
            "cfar_quantile": args.cfar_quantile,
            "cfar_alpha_db": args.cfar_alpha_db,
            "gain": args.gain,
            "driver": args.driver,
            "profile": getattr(args, "profile", None),
            "spur_calibration": bool(args.spur_calibration),
            "two_pass": bool(getattr(args, "two_pass", False)),
            "persistence_mode": getattr(args, "persistence_mode", None),
            "persistence_hit_ratio": getattr(args, "persistence_hit_ratio", None),
            "persistence_min_seconds": getattr(args, "persistence_min_seconds", None),
            "persistence_min_hits": getattr(args, "persistence_min_hits", None),
            "persistence_min_windows": getattr(args, "persistence_min_windows", None),
            "bandwidth_pad_hz": getattr(args, "bandwidth_pad_hz", None),
            "min_emit_bandwidth_hz": getattr(args, "min_emit_bandwidth_hz", None),
            "confidence_hit_normalizer": getattr(args, "confidence_hit_normalizer", None),
            "confidence_duration_norm": getattr(args, "confidence_duration_norm", None),
            "confidence_bias": getattr(args, "confidence_bias", None),
            "revisit_span_limit_hz": getattr(args, "revisit_span_limit_hz", None),
            "cluster_merge_hz": getattr(args, "cluster_merge_hz", None),
            "max_detection_width_ratio": getattr(args, "max_detection_width_ratio", None),
            "max_detection_width_hz": getattr(args, "max_detection_width_hz", None),
            "segment_center_mode": getattr(args, "segment_center_mode", None),
            "segment_centroid_span_hz": getattr(args, "segment_centroid_span_hz", None),
            "segment_centroid_drop_db": getattr(args, "segment_centroid_drop_db", None),
            "segment_centroid_floor_margin_db": getattr(args, "segment_centroid_floor_margin_db", None),
        }

    def run(self, src, sweep_seq: int) -> None:
        """Perform a single wideband sweep and update baseline state."""

        args = self.args
        store = self.store
        bandplan = self.bandplan
        baseline_ctx = self.baseline_ctx
        logger = self.logger
        self.src = src

        scheduler = WindowScheduler(args.start, args.stop, args.step)
        power_monitor = WindowPowerMonitor()
        spur_tracker = SpurCalibrationTracker() if args.spur_calibration else None
        bin_hz = float(args.samp_rate) / float(args.fft) if args.fft else float(args.samp_rate)
        stats_updater = BaselineStatsUpdater(store, baseline_ctx, sweep_bin_hz=bin_hz)
        event_writer = BaselineEventWriter(store, baseline_ctx, logger)
        segment_shape_kwargs = _segment_shape_kwargs_from_args(args)
        if args.spur_calibration:
            detection_engine: DetectionEngine | None = None
        else:
            detection_engine = DetectionEngine(
                store,
                bandplan,
                args,
                bin_hz=bin_hz,
                baseline_ctx=baseline_ctx,
                min_hits=int(getattr(args, "persistence_min_hits", 2)),
                min_windows=int(getattr(args, "persistence_min_windows", 2)),
                logger=logger,
            )

        if logger:
            logger.start_sweep(
                sweep_seq,
                baseline_id=baseline_ctx.id,
                baseline_span_hz=[baseline_ctx.freq_start_hz, baseline_ctx.freq_stop_hz],
                bin_hz=bin_hz,
                params=self._sweep_params(),
            )

        total_segments = 0
        total_hits = 0
        total_new_signals = 0
        total_promoted = 0
        total_revisits = 0
        total_revisit_confirmed = 0
        total_revisit_false = 0
        window_count = 0
        sweep_start_time = time.perf_counter()

        try:
            _log.info(
                "begin sweep baseline=%d range=%.3f-%.3fMHz step=%.3f samp_rate=%.3f fft=%d avg=%d",
                baseline_ctx.id,
                args.start / 1e6,
                args.stop / 1e6,
                args.step / 1e6,
                args.samp_rate / 1e6,
                args.fft,
                args.avg,
            )
            for window in scheduler:
                center = window.center_hz
                window_idx = window.index
                window_count = window_idx + 1
                src.tune(center)
                nsamps = int(args.fft * args.avg)
                _ = src.read(int(args.fft))
                samples = src.read(nsamps)
                # Calculate dwell time: samples / sample_rate = seconds, * 1000 = ms
                window_dwell_ms = (float(nsamps) / float(args.samp_rate)) * 1000.0
                baseband_f, psd_db = compute_psd_db(samples, args.samp_rate, args.fft, args.avg)
                rf_freqs = baseband_f + center

                segs, occ_mask_cfar, noise_per_bin_db = detect_segments(
                    rf_freqs,
                    psd_db,
                    thresh_db=args.threshold_db,
                    guard_bins=args.guard_bins,
                    min_width_bins=args.min_width_bins,
                    cfar_mode=args.cfar,
                    cfar_train=args.cfar_train,
                    cfar_guard=args.cfar_guard,
                    cfar_quantile=args.cfar_quantile,
                    cfar_alpha_db=args.cfar_alpha_db,
                    abs_power_floor_db=getattr(args, "abs_power_floor_db", None),
                    **segment_shape_kwargs,
                )

                if logger:
                    widths = np.array([max(float(seg.bandwidth_hz), 0.0) for seg in segs], dtype=float)
                    float(np.mean(widths)) if widths.size else None
                    min_bw = float(np.min(widths)) if widths.size else None
                    median_bw = float(np.median(widths)) if widths.size else None
                    max_bw = float(np.max(widths)) if widths.size else None
                    strongest_snr = max((seg.snr_db for seg in segs), default=None)
                    logger.log(
                        "segment_inventory",
                        window_idx=window_idx,
                        center_hz=float(center),
                        num_segments=len(segs),
                        min_bandwidth_hz=min_bw,
                        median_bandwidth_hz=median_bw,
                        max_bandwidth_hz=max_bw,
                        strongest_snr_db=strongest_snr,
                    )

                mean_psd_db = float(np.mean(psd_db))
                p90_psd_db = float(np.percentile(psd_db, 90.0))
                is_anom, _ema_power_db, _delta_db = power_monitor.update(mean_psd_db)
                accepted_hits = 0
                spur_ignored = 0
                promoted = 0
                new_signals = 0

                if is_anom:
                    if detection_engine:
                        accepted_hits, spur_ignored, promoted, new_signals = detection_engine.ingest(window_idx, [])
                else:
                    noise_db = robust_noise_floor_db(psd_db)
                    dynamic = noise_db + args.threshold_db
                    occupied_mask = np.asarray(
                        occ_mask_cfar if (args.cfar and args.cfar != "off") else (psd_db > dynamic),
                        dtype=bool,
                    )
                    stats_updater.update_window(rf_freqs, psd_db, noise_per_bin_db, occupied_mask, dwell_ms=window_dwell_ms)

                    if spur_tracker is not None:
                        spur_tracker.observe(segs)
                    if detection_engine:
                        accepted_hits, spur_ignored, promoted, new_signals = detection_engine.ingest(window_idx, segs)
                total_segments += len(segs)
                total_hits += accepted_hits
                total_promoted += promoted
                total_new_signals += new_signals

                _log.info(
                    "[scan] window center_hz=%.1f det_count=%d mean_db=%.1f p90_db=%.1f anomalous=%d accepted=%d promoted=%d new_sig=%d spur_masked=%d",
                    center,
                    len(segs),
                    mean_psd_db,
                    p90_psd_db,
                    1 if is_anom else 0,
                    accepted_hits,
                    promoted,
                    new_signals,
                    spur_ignored,
                )

            revisit_tags: list[RevisitTag] = []
            if detection_engine:
                revisit_tags = detection_engine.finalize_coarse_pass()
            if detection_engine and getattr(args, "two_pass", False) and revisit_tags:
                max_bands = int(getattr(args, "revisit_max_bands", 0) or 0)
                if max_bands > 0:
                    revisit_tags = revisit_tags[:max_bands]
                revisit_stats = _run_revisit_pass(
                    args,
                    src,
                    detection_engine,
                    revisit_tags,
                    logger,
                    segment_shape_kwargs=segment_shape_kwargs,
                )
                total_revisits += revisit_stats.get("total", 0)
                total_revisit_confirmed += revisit_stats.get("confirmed", 0)
                total_revisit_false += revisit_stats.get("false_positive", 0)

            if getattr(args, "capture_iq", False) and detection_engine is not None:
                self._run_recording_pass(args)

        finally:
            if detection_engine:
                flushed, new_flush = detection_engine.flush()
                if flushed:
                    total_promoted += flushed
                    total_new_signals += new_flush
                    _log.debug("sweep baseline=%d flushed pending detections=%d", baseline_ctx.id, flushed)
            if args.spur_calibration and spur_tracker is not None:
                spur_tracker.persist(store, window_count)
            stats_updater.update_span((min(args.start, args.stop), max(args.start, args.stop)))
            sweep_duration_ms = (time.perf_counter() - sweep_start_time) * 1000.0
            event_writer.record_scan_summary(
                hits=total_hits,
                segments=total_segments,
                promoted=total_promoted,
                new_signals=total_new_signals,
                revisits_total=total_revisits,
                revisits_confirmed=total_revisit_confirmed,
                revisits_false_positive=total_revisit_false,
                duration_ms=sweep_duration_ms,
            )
            try:
                band_summary_cfg = BandSummaryConfig.from_env()
                store.refresh_band_summary(baseline_ctx, config=band_summary_cfg)
            except Exception as exc:
                _log.exception("band summary refresh failed")
                if logger:
                    logger.emit_error("band_summary", str(exc), exc_info=exc, baseline_id=baseline_ctx.id)
            _log.info(
                "end sweep baseline=%d hits=%d promoted=%d new=%d",
                baseline_ctx.id,
                total_hits,
                total_promoted,
                total_new_signals,
            )


    def _run_recording_pass(self, args) -> None:
        _log.info("recording pass: capturing IQ for detected signals")

        import os

        capture_dir = getattr(args, "capture_dir", "./captures")
        duration_s = getattr(args, "capture_duration", 10.0)
        max_signals = getattr(args, "record_max_signals", 10)
        samp_rate = getattr(args, "samp_rate", 2.4e6)
        baseline_id = int(self.baseline_ctx.id)

        # Load sweep detections + queued recordings as recording targets
        targets: list = []

        try:
            detections = self.store.load_baseline_detections(baseline_id)
        except Exception:
            _log.warning("failed to load detections for recording pass", exc_info=True)
            detections = []

        # Also pick up any queued recordings that need to be captured
        queued: list = []
        try:
            queued_rows = self.store.con.execute(
                "SELECT id AS detection_id, f_center_hz FROM recordings "
                "WHERE status = 'queued' AND baseline_id = ? ORDER BY created_utc ASC LIMIT ?",
                (baseline_id, max_signals),
            ).fetchall()
            for q in queued_rows:
                queued.append(q)
        except Exception:
            _log.debug("could not load queued recordings", exc_info=True)

        # Merge sweep detections and queued recordings
        seen_freqs: set = set()
        for det in detections:
            f_center = int(det.f_center_hz)
            if f_center == 0:
                continue
            if self.store.is_frequency_ignored(baseline_id, f_center):
                _log.debug("skipping ignored freq %d Hz", f_center)
                continue
            seen_freqs.add(f_center)
            targets.append(det)

        for q in queued:
            qt = _QueuedTarget(q)
            if qt.f_center_hz in seen_freqs:
                continue  # already going to record this via sweep detection
            if self.store.is_frequency_ignored(baseline_id, qt.f_center_hz):
                _log.debug("skipping ignored queued freq %d Hz", qt.f_center_hz)
                continue
            seen_freqs.add(qt.f_center_hz)
            targets.append(qt)

        if not targets:
            _log.info("nothing to record")
            return

        # Weakest signals first (sweep detections have SNR; queued targets get default 0)
        def _priority(t):
            return -max(getattr(t, "snr_db", 0) or 0, 0)

        targets.sort(key=_priority)
        targets = targets[:max_signals]

        _log.info("recording %d/%d target(s)", len(targets), len(targets))

        recorder = IQRecorder(self.store, capture_dir=capture_dir)
        src = self.src

        # Lock radio settings before recording pass — disable AGC for stable captures
        if hasattr(src, "set_fixed_gain_mode"):
            try:
                src.set_fixed_gain_mode(gain_db=20.0)
            except Exception:
                _log.debug("could not set fixed gain mode for recording", exc_info=True)

        for det in targets:
            f_center = int(det.f_center_hz)
            det_id = int(det.id)

            rec_id, rec_path = recorder.record(
                src=src,
                f_center_hz=f_center,
                samp_rate=samp_rate,
                duration_s=duration_s,
                baseline_id=baseline_id,
                detection_id=det_id,
            )

            if rec_id is None:
                _log.warning("failed to record freq %d Hz", f_center)
                continue

            # If this was a queued recording, mark it as captured so it won't be re-queued
            if isinstance(det, _QueuedTarget):
                try:
                    self.store.con.execute(
                        "UPDATE recordings SET status = 'completed' WHERE id = ?",
                        (det.queued_id,),
                    )
                    self.store.con.commit()
                except Exception:
                    _log.debug("could not update queued recording status", exc_info=True)

            # Run modulation classifier on the captured IQ (advisory — user can override)
            modulation: str | None = None
            try:
                if rec_path and os.path.exists(rec_path):
                    samples = np.fromfile(rec_path, dtype=np.complex64)
                    from sdrwatch.recording.classifier import classify_modulation
                    bw = max(int(det.f_high_hz - det.f_low_hz), 0)
                    modulation = classify_modulation(
                        samples[:int(samp_rate * 1.0)], samp_rate, f_center, float(bw)
                    )
            except Exception:
                pass

            # Store recording with modulation suggestion (no auto-demod — user tries mods in review)
            try:
                self.store.update_recording_status(
                    rec_id,
                    "raw",
                    modulation=modulation,
                )
            except Exception as e:
                _log.debug("status update error: %s", e)

        try:
            quota_gb = getattr(args, "record_quota_gb", 1)
            ttl_days = getattr(args, "record_ttl_days", 7)
            enforce_retention(self.store, capture_dir, ttl_days=ttl_days, quota_gb=quota_gb)
        except NotImplementedError:
            _log.debug("retention enforcement not yet implemented")
        except Exception as e:
            _log.error("retention enforcement failed: %s", e)

        _log.info("recording pass complete")


def run_sweep(
    args,
    store: Store,
    bandplan: Bandplan,
    src,
    baseline_ctx: BaselineContext,
    sweep_seq: int,
    logger: ScanLogger | None = None,
) -> None:
    """Backwards-compatible helper that instantiates a Sweeper and runs it."""

    Sweeper(args, store, bandplan, baseline_ctx, logger).run(src, sweep_seq)
