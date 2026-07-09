// Recordings
export interface Recording {
  id: number;
  baseline_id: number;
  detection_id: number | null;
  f_center_hz: number;
  bandwidth_hz: number;
  started_utc: string;
  duration_ms: number;
  sample_rate_hz: number;
  raw_path: string | null;
  raw_bytes: number | null;
  modulation: string | null;
  ogg_path: string | null;
  ogg_bytes: number | null;
  raw_deleted: boolean;
  status: string;
  error: string | null;
  created_utc: string;
  f_mhz?: number;
  raw_size_display?: string;
  ogg_size_display?: string;
  ogg_exists?: boolean;
}

// Baselines
export interface Baseline {
  id: number;
  name: string;
  created_at: string;
  freq_start_hz?: number;
  freq_stop_hz?: number;
  bin_hz?: number;
  total_windows: number;
  stats_min_hz?: number;
  stats_max_hz?: number;
  location_lat?: number | null;
  location_lon?: number | null;
  notes?: string | null;
}

// Signals
export interface Signal {
  id: number;
  signal_id: string;
  baseline_id: number;
  f_center_hz: number;
  f_low_hz: number;
  f_high_hz: number;
  bandwidth_hz: number | null;
  bandwidth_hz_display: number | null;
  user_bw_hz: number | null;
  first_seen_utc: string;
  last_seen_utc: string;
  total_hits: number;
  total_windows: number;
  confidence: number;
  label: string | null;
  classification: 'friendly' | 'ambient' | 'hostile' | 'unknown';
  notes: string | null;
  selected: boolean;
  peak_db?: number | null;
  noise_db?: number | null;
  snr_db?: number | null;
  service?: string | null;
  region?: string | null;
  bandplan_notes?: string | null;
  near_spur?: boolean;
  missing_since_utc?: string | null;
}

// Jobs
export interface Job {
  id: string;
  status: string;
  label?: string;
  device_key?: string;
  baseline_id?: number;
  params?: Record<string, unknown>;
  created_ts?: number;
  cmd?: string[];
  exit_code?: number | null;
}

// Snapshot data (from /api/baseline/<id>/tactical)
export interface TacticalSnapshot {
  snapshot?: {
    persistent_detections?: number;
    recent_new_signals?: number;
    total_windows?: number;
    last_detection_utc?: string;
    last_update?: string;
  };
  band_summary?: BandSummary[];
  active_signals?: Signal[];
  active_window_minutes?: number;
}

export interface BandSummary {
  band_index: number;
  f_low_hz: number;
  f_high_hz: number;
  persistent_signals: number;
  recent_new_signals: number;
  occupied_fraction: number;
}

// Chart data
export interface TimelineData {
  buckets: TimelineBucket[];
  det_max: number;
  scan_max: number;
  snr_max: number;
}

export interface TimelineBucket {
  label: string;
  time_utc: string;
  det_count: number;
  scan_count: number;
  snr_avg: number | null;
}

export interface HeatmapData {
  rows: HeatmapRow[];
  bin_labels: string[];
  f_start_mhz: number | null;
  f_stop_mhz: number | null;
  bin_width_mhz: number | null;
  max_count: number;
}

export interface HeatmapRow {
  label: string;
  bins: number[];
}

export interface FreqBinsData {
  bins: FreqBin[];
  latest: FreqMeta | null;
  freq_max: number;
  avg_start_mhz: number;
  avg_stop_mhz: number;
  avg_max: number;
}

export interface FreqBin {
  label: string;
  power: number;
  center: number;
  count?: number;
  avg?: number;
}

export interface FreqMeta {
  time_utc: string;
  scan_id: number;
}

export interface SNRHistogramData {
  bins: SNRBin[];
  stats: SNRStats | null;
}

export interface SNRBin {
  low: number;
  high: number;
  count: number;
}

export interface SNRStats {
  mean: number;
  median: number;
  p1: number;
  p5: number;
  p95: number;
  p99: number;
}

// Change events
export interface ChangeEvent {
  type: string;
  time_utc?: string;
  f_center_hz?: number;
  bandwidth_hz?: number;
  confidence?: number;
  details?: string;
  delta_db?: number;
  time_label?: string;
}

export interface ChangePayload {
  events: ChangeEvent[];
  total_events: number;
  window_minutes: number;
  generated_at: string;
}

// Live windows
export interface LiveWindow {
  center_hz: number;
  center_mhz: number;
  det_count: number;
  mean_db: number;
  p90_db: number;
  anomalous: boolean;
}

// Devices
export interface Device {
  key: string;
  kind: string;
  label: string;
  extra?: Record<string, unknown>;
}

// Profiles
export interface Profile {
  name: string;
  f_low_hz: number;
  f_high_hz: number;
  samp_rate: number;
  fft: number;
  avg: number;
  gain_db: number;
  threshold_db: number;
  step_hz?: number;
  guard_bins?: number;
  min_width_bins?: number;
  cfar_train?: number;
  cfar_guard?: number;
  cfar_quantile?: number;
  persistence_hit_ratio?: number;
  persistence_min_seconds?: number;
  persistence_min_hits?: number;
  persistence_min_windows?: number;
  cluster_merge_hz?: number;
  max_detection_width_ratio?: number;
  max_detection_width_hz?: number;
  revisit_fft?: number;
  revisit_avg?: number;
  revisit_margin_hz?: number;
  revisit_span_limit_hz?: number;
  revisit_max_bands?: number;
  revisit_floor_threshold_db?: number;
  two_pass?: boolean;
}

// Ignore rules
export interface IgnoreRule {
  id: number;
  baseline_id: number;
  f_center_hz: number;
  tolerance_hz: number;
  label: string | null;
  created_utc: string;
}

// Signal detail (extended response from GET /api/signals/<id>)
export interface SignalDetail extends Signal {
  f_center_mhz: number;
  baseline_name?: string;
  hit_ratio: number;
  threat_score: number;
  threat_level: 'low' | 'medium' | 'high';
  threat_label: string;
  threat_factors: string[];
  near_spur: boolean;
  spur_info?: { bin_hz: number; mean_power_db: number; hits: number };
  realtime_available: boolean;
  scan_activity?: { recent_scans: number; latest_scan: string };
  baseline_noise?: { noise_floor_ema: number; power_ema: number };
  baseline_occupancy?: {
    duty_cycle: number;
    occupied_ms: number;
    observed_ms: number;
    occ_ratio: number;
    occ_count: number;
    baseline_windows: number;
  };
  missing_since_utc?: string | null;
}

export interface CollectionContext {
  sdr_serial?: string;
  antenna?: string;
  location_lat?: number;
  location_lon?: number;
  freq_start_hz: number;
  freq_stop_hz: number;
  bin_hz: number;
  bandplan_path?: string;
  baseline_notes?: string;
}
