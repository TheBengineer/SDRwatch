import { useState, useEffect, useRef, useCallback } from 'react'
import { CollapsibleSection, Button, Card } from '../components/primitives'
import { useBaseline } from '../context/BaselineContext'
import type { Device, Profile, Job } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface PresetDef {
  start: string
  stop: string
  step: string
  extra?: (f: FormValues) => FormValues
}

const FREQ_PRESETS: Record<string, PresetDef> = {
  FULL: { start: '24e6', stop: '1766e6', step: '2.4e6' },
  FM: {
    start: '88e6', stop: '108e6', step: '1.2e6',
    extra: (f) => ({
      ...f,
      threshold_db: '6', guard_bins: '3', min_width_bins: '5',
      cluster_merge_hz: '12000', max_detection_width_ratio: '2.5',
      max_detection_width_hz: '270000',
      cfar: 'os', cfar_train: '32', cfar_guard: '6', cfar_quantile: '0.6',
      persistence_mode: 'hits', persistence_hit_ratio: '0.25',
      persistence_min_seconds: '2.0', persistence_min_hits: '1',
      persistence_min_windows: '1',
      two_pass: true, revisit_fft: '32768', revisit_avg: '4',
      revisit_margin_hz: '200000', revisit_span_limit_hz: '420000',
      revisit_max_bands: '40', revisit_floor_threshold_db: '6.0',
      fft: '8192', avg: '10',
    }),
  },
  VHF_AIR: { start: '118e6', stop: '137e6', step: '500e3' },
  UHF_MILAIR: { start: '225e6', stop: '400e6', step: '2.4e6' },
  '2m': { start: '144e6', stop: '146e6', step: '1.2e6' },
  '70cm': { start: '430e6', stop: '440e6', step: '2.4e6' },
  MARINE: { start: '156e6', stop: '162.6e6', step: '1.2e6' },
  NOAA: { start: '162.4e6', stop: '162.55e6', step: '100e3' },
  AIS: { start: '161.975e6', stop: '162.025e6', step: '200e3' },
  ADSB: { start: '1089e6', stop: '1091e6', step: '2.4e6' },
  PMR446: { start: '446.0e6', stop: '446.2e6', step: '200e3' },
  TETRA: { start: '390e6', stop: '430e6', step: '2.4e6' },
  LTE800: { start: '791e6', stop: '821e6', step: '2.4e6' },
}

const SCAN_PRESETS: Record<string, Partial<FormValues>> = {
  FAST: { fft: '1024', avg: '2', step: '2.4e6', samp_rate: '2.4e6', threshold_db: '10', guard_bins: '1', min_width_bins: '2' },
  BALANCED: { fft: '4096', avg: '8', step: '1.2e6', samp_rate: '2.4e6', threshold_db: '8', guard_bins: '1', min_width_bins: '2' },
  FIDELITY: { fft: '16384', avg: '32', step: '600e3', samp_rate: '2.4e6', threshold_db: '6', guard_bins: '1', min_width_bins: '2' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultForm(): FormValues {
  return {
    device_key: '', driver: 'rtlsdr', gain: 'auto', samp_rate: '2.4e6',
    bandplan: '', profile: '', scan_mode: 'normal',
    start: '88e6', stop: '108e6', step: '2.4e6',
    fft: '4096', avg: '8', sleep_between_sweeps: '0',
    threshold_db: '8', guard_bins: '1', min_width_bins: '2',
    new_ema_occ: '0.02',
    cluster_merge_hz: '', max_detection_width_ratio: '3', max_detection_width_hz: '',
    two_pass: false,
    revisit_fft: '', revisit_avg: '', revisit_margin_hz: '150000',
    revisit_span_limit_hz: '', revisit_max_bands: '40', revisit_floor_threshold_db: '',
    persistence_mode: 'hits', persistence_hit_ratio: '0.6',
    persistence_min_seconds: '10', persistence_min_hits: '2', persistence_min_windows: '2',
    cfar: 'os', cfar_train: '24', cfar_guard: '4', cfar_quantile: '0.75', cfar_alpha_db: '',
    capture_iq: '', continuous_capture: '', capture_duration: '10',
    record_max_signals: '10', record_ttl_days: '7', record_quota_gb: '1',
    db: '', jsonl: '', notify: false,
    mode: 'single', repeat: '', duration: '',
  }
}

interface FormValues {
  device_key: string; driver: string; gain: string; samp_rate: string;
  bandplan: string; profile: string; scan_mode: string;
  start: string; stop: string; step: string;
  fft: string; avg: string; sleep_between_sweeps: string;
  threshold_db: string; guard_bins: string; min_width_bins: string;
  new_ema_occ: string;
  cluster_merge_hz: string; max_detection_width_ratio: string; max_detection_width_hz: string;
  two_pass: boolean;
  revisit_fft: string; revisit_avg: string; revisit_margin_hz: string;
  revisit_span_limit_hz: string; revisit_max_bands: string; revisit_floor_threshold_db: string;
  persistence_mode: string; persistence_hit_ratio: string;
  persistence_min_seconds: string; persistence_min_hits: string; persistence_min_windows: string;
  cfar: string; cfar_train: string; cfar_guard: string; cfar_quantile: string; cfar_alpha_db: string;
  capture_iq: string; continuous_capture: string; capture_duration: string;
  record_max_signals: string; record_ttl_days: string; record_quota_gb: string;
  db: string; jsonl: string; notify: boolean;
  mode: string; repeat: string; duration: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({
  label, hint, children, labelTitle,
}: {
  label: string; hint?: string; children: React.ReactNode; labelTitle?: string
}) {
  return (
    <div className="field">
      <label className="block text-sm font-medium text-slate-300 mb-1" title={labelTitle}>{label}</label>
      {children}
      {hint && <div className="hint mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, inputMode, step,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: string; step?: string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode as 'numeric' | 'decimal' | undefined}
      step={step}
      className="input w-full text-sm"
    />
  )
}

function SelectInput({
  value, onChange, options, disabled, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean; placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="input w-full text-sm appearance-none cursor-pointer disabled:opacity-50"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value} className="bg-[var(--input-option-bg)] text-[var(--input-option-text)]">{o.label}</option>
      ))}
    </select>
  )
}

function CheckboxInput({
  checked, onChange, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-white/18 bg-white/8 text-sky-500 focus:ring-sky-500"
      />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ControlPage() {
  const { baselineId, baselines } = useBaseline()

  // Devices & profiles
  const [devices, setDevices] = useState<Device[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [devicesError, setDevicesError] = useState('')

  // Form state
  const [f, setF] = useState<FormValues>(defaultForm)

  // Job state
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [jobError, setJobError] = useState('')
  const [logText, setLogText] = useState('')

  // Sweep status indicator
  const [lastSweepMinutes, setLastSweepMinutes] = useState<number | null>(null)
  const [signalCount, setSignalCount] = useState<number | null>(null)
  const [creatingBaseline, setCreatingBaseline] = useState(false)
  const [baselineFormStatus, setBaselineFormStatus] = useState('')

  // Baseline create form
  const [blName, setBlName] = useState('')
  const [blLat, setBlLat] = useState('')
  const [blLon, setBlLon] = useState('')
  const [blSerial, setBlSerial] = useState('')
  const [blAntenna, setBlAntenna] = useState('')
  const [blNotes, setBlNotes] = useState('')

  const logRef = useRef<HTMLPreElement>(null)
  const userScrollingRef = useRef(false)
  const logPollInterval = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    try {
      const r = await fetch('/ctl/devices')
      const data = await r.json()
      if (!Array.isArray(data)) {
        setDevicesError(data?.error ?? 'controller_error')
        setDevices([])
        return
      }
      setDevices(data as Device[])
      setDevicesError('')
    } catch {
      setDevicesError('failed to load devices')
    }
  }, [])

  // Fetch profiles (from controller API)
  const fetchProfiles = useCallback(async () => {
    try {
      const r = await fetch('/api/jobs/profiles')
      if (r.ok) {
        const body = await r.json()
        const list = body?.profiles ?? body
        if (Array.isArray(list)) {
          setProfiles(list as Profile[])
          return
        }
      }
      // Fallback: try /profiles (legacy controller endpoint)
      const r2 = await fetch('/profiles')
      if (r2.ok) {
        const body = await r2.json()
        const list = body?.profiles ?? body
        if (Array.isArray(list)) {
          setProfiles(list as Profile[])
        }
      }
    } catch {
      // profiles unavailable
    }
  }, [])

  // Fetch active job state
  const fetchActiveJob = useCallback(async () => {
    try {
      const r = await fetch('/api/jobs/active')
      if (r.ok) {
        const data = await r.json()
        if (data?.job) {
          setActiveJob(data.job)
        } else {
          setActiveJob(null)
        }
      }
    } catch {
      setActiveJob(null)
    }
  }, [])

  // Load devices & profiles on mount
  useEffect(() => {
    fetchDevices()
    fetchProfiles()
    fetchActiveJob()
  }, [fetchDevices, fetchProfiles, fetchActiveJob])

  // Apply profile defaults when profile changes
  useEffect(() => {
    if (!f.profile) return
    const prof = profiles.find(p => p.name === f.profile)
    if (!prof) return

    const overrides: Partial<FormValues> = {
      start: String(prof.f_low_hz ?? ''),
      stop: String(prof.f_high_hz ?? ''),
      step: String(prof.step_hz ?? f.step),
      samp_rate: String(prof.samp_rate ?? f.samp_rate),
      fft: String(prof.fft ?? f.fft),
      avg: String(prof.avg ?? f.avg),
      gain: String(prof.gain_db ?? f.gain),
      threshold_db: String(prof.threshold_db ?? f.threshold_db),
    }
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === 'string' && v !== '') {
        cleaned[k] = v
      }
    }
    setF(prev => ({ ...prev, ...cleaned as Partial<FormValues> }))
  }, [f.profile, profiles])

  // Poll sweep status (elapsed time + signal count)
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/jobs/active')
        if (r.ok) {
          const data = await r.json()
          if (data?.job?.created_ts) {
            const elapsed = Math.floor((Date.now() / 1000 - data.job.created_ts) / 60)
            setLastSweepMinutes(elapsed)
          } else {
            setLastSweepMinutes(null)
          }
        } else {
          setLastSweepMinutes(null)
        }
      } catch {
        setLastSweepMinutes(null)
      }

      // Get signal count from baseline summaries
      if (baselineId) {
        try {
          const r = await fetch('/api/baselines')
          if (r.ok) {
            const data = await r.json()
            if (data?.summaries?.[baselineId]?.persistent_detections != null) {
              setSignalCount(data.summaries[baselineId].persistent_detections)
            } else {
              setSignalCount(null)
            }
          }
        } catch {
          // ignore
        }
      }
    }

    poll()
    const id = setInterval(poll, 15000)
    return () => clearInterval(id)
  }, [baselineId])

  // Log auto-scroll
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    if (!userScrollingRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [logText])

  // Log polling
  useEffect(() => {
    const jobId = activeJob?.id
    if (!jobId) {
      if (logPollInterval.current) {
        clearTimeout(logPollInterval.current)
        logPollInterval.current = null
      }
      return
    }

    const pollLogs = async () => {
      try {
        const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/logs?tail=500`)
        if (r.ok) {
          const text = await r.text()
          if (text) setLogText(text)
        }
      } catch {
        // ignore
      }
      logPollInterval.current = setTimeout(pollLogs, 2000)
    }

    pollLogs()

    return () => {
      if (logPollInterval.current) {
        clearTimeout(logPollInterval.current)
        logPollInterval.current = null
      }
    }
  }, [activeJob?.id])

  // Log scroll handler
  const handleLogScroll = useCallback(() => {
    const el = logRef.current
    if (!el) return
    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24
    userScrollingRef.current = !nearBottom
  }, [])

  // Update a single field
  const setField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setF(prev => ({ ...prev, [key]: value }))
  }, [])

  // Apply a frequency preset
  const applyPreset = useCallback((key: string) => {
    const preset = FREQ_PRESETS[key]
    if (!preset) return
    setF(prev => {
      let next: FormValues = {
        ...prev,
        start: preset.start,
        stop: preset.stop,
        step: preset.step,
        samp_rate: '2.4e6',
        fft: '4096',
        avg: '8',
        gain: prev.gain || 'auto',
      }
      if (preset.extra) {
        next = preset.extra(next)
      }
      return next
    })
  }, [])

  // Apply a scan preset
  const applyScanPreset = useCallback((key: string) => {
    const preset = SCAN_PRESETS[key]
    if (!preset) return
    setF(prev => ({ ...prev, ...preset }))
  }, [])

  // Submit job
  const handleStartJob = useCallback(async () => {
    if (!baselineId) {
      setJobError('Select a baseline before starting a scan.')
      return
    }

    setJobError('')

    // Build params from form values
    const numericFields = [
      'start', 'stop', 'step', 'samp_rate', 'fft', 'avg',
      'threshold_db', 'guard_bins', 'min_width_bins',
      'cfar_train', 'cfar_guard', 'cfar_quantile', 'cfar_alpha_db',
      'new_ema_occ', 'sleep_between_sweeps', 'repeat',
      'persistence_hit_ratio', 'persistence_min_seconds',
      'persistence_min_hits', 'persistence_min_windows',
      'cluster_merge_hz', 'max_detection_width_ratio', 'max_detection_width_hz',
      'revisit_fft', 'revisit_avg', 'revisit_margin_hz',
      'revisit_span_limit_hz', 'revisit_max_bands', 'revisit_floor_threshold_db',
    ] as const

    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(f)) {
      if (k === 'device_key' || k === 'profile' || k === 'scan_mode' ||
          k === 'two_pass' || k === 'notify' || k === 'mode' ||
          k === 'repeat' || k === 'duration' || k === 'label') continue

      // Skip empty optionals
      if (typeof v === 'string' && v === '') continue

      if (numericFields.includes(k as typeof numericFields[number])) {
        const num = Number(v)
        if (Number.isFinite(num)) {
          body[k] = num
        }
        // skip if not a valid number
      } else if (typeof v === 'boolean') {
        body[k] = v
      } else {
        body[k] = v
      }
    }

    // Convert mode -> loop/repeat
    if (f.mode === 'loop') body.loop = true
    if (f.mode === 'repeat' && f.repeat) {
      body.repeat = Number(f.repeat) || 1
    }
    if (f.mode === 'duration' && f.duration) {
      body.duration = f.duration
    }

    // Scan mode -> spur calibration
    if (f.scan_mode === 'spur') {
      body.spur_calibration = true
    }

    // Two-pass
    if (f.two_pass) body.two_pass = true

    // Profile
    if (f.profile) body.profile = f.profile

    // Capture / IQ recording
    if (f.capture_iq === 'true') body.capture_iq = true
    if (f.continuous_capture === 'true') body.continuous_capture = true
    if (f.capture_duration) body.capture_duration = Number(f.capture_duration)
    if (f.record_max_signals) body.record_max_signals = Number(f.record_max_signals)
    if (f.record_ttl_days) body.record_ttl_days = Number(f.record_ttl_days)
    if (f.record_quota_gb) body.record_quota_gb = Number(f.record_quota_gb)

    // Notifications
    if (f.notify) body.notify = true

    const deviceKey = f.device_key
    if (!deviceKey) {
      setJobError('Select a device before starting a scan.')
      return
    }

    const payload = {
      device_key: deviceKey,
      label: 'web',
      baseline_id: baselineId,
      params: body,
    }

    try {
      const r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'start failed')

      if (data?.job) {
        setActiveJob(data.job)
      } else {
        setActiveJob(data as unknown as Job)
      }
      setLogText('')
    } catch (err) {
      setJobError(`Failed to start scan: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [f, baselineId])

  // Stop job
  const handleStopJob = useCallback(async () => {
    const jobId = activeJob?.id
    if (!jobId) return
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error('stop failed')
      setActiveJob(null)
      setJobError('')
    } catch (err) {
      setJobError(`Failed to stop: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [activeJob])

  // Create baseline
  const handleCreateBaseline = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blName.trim()) return
    setCreatingBaseline(true)
    setBaselineFormStatus('Creating baseline...')

    const payload: Record<string, unknown> = { name: blName.trim() }
    if (blLat) payload.location_lat = Number(blLat)
    if (blLon) payload.location_lon = Number(blLon)
    if (blSerial) payload.sdr_serial = blSerial.trim()
    if (blAntenna) payload.antenna = blAntenna.trim()
    if (blNotes) payload.notes = blNotes.trim()

    try {
      const r = await fetch('/api/baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || data?.detail || 'create failed')

      setBlName(''); setBlLat(''); setBlLon('')
      setBlSerial(''); setBlAntenna(''); setBlNotes('')
      setBaselineFormStatus('Baseline created.')
    } catch (err) {
      setBaselineFormStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCreatingBaseline(false)
    }
  }, [blName, blLat, blLon, blSerial, blAntenna, blNotes])

  const isRunning = activeJob?.status === 'running'
  const stateLabel = isRunning ? 'Running' : 'Idle'
  const stateClass = isRunning ? 'text-emerald-400' : 'text-slate-500'

  // Devices selector options
  const deviceOptions = devices.map(d => ({
    value: d.key,
    label: `${d.label} [${d.kind}]`,
  }))

  // Profile selector options
  const profileOptions = profiles.map(p => ({
    value: p.name,
    label: p.name,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Main form column */}
      <div className="lg:col-span-2">
        <Card variant="bordered">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">SDRwatch Control</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">State:</span>
              <span className={`font-mono text-sm font-semibold ${stateClass}`}>{stateLabel}</span>
            </div>
          </div>

          {lastSweepMinutes != null && signalCount != null && (
            <div className="text-xs text-slate-500 mb-3">
              Last sweep: {lastSweepMinutes}m ago, {signalCount} signals
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); handleStartJob() }} className="space-y-4">

            {/* Frequency Presets — always visible */}
            <div>
              <div className="section-title font-semibold mb-2">Frequency Presets</div>
              <p className="text-xs text-slate-500 mb-2">Select a frequency band to auto-fill range and recommended detection params.</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(FREQ_PRESETS).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-medium transition-colors"
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.keys(SCAN_PRESETS).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyScanPreset(key)}
                    className="px-3 py-1.5 rounded-xl bg-amber-900/30 hover:bg-amber-800/40 text-amber-300 text-xs font-medium transition-colors"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {/* Baseline info */}
            <div>
              <div className="section-title font-semibold mb-2" title="Your spectrum reference. SDRWatch compares new sweeps against it to detect changes in the RF environment.">Baseline</div>
              <div className="subgrid grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow label="Active baseline" labelTitle="Your spectrum reference. SDRWatch compares new sweeps against it to detect changes in the RF environment." hint="Select a baseline to tie scans to persistent history.">
                  <select
                    value={baselineId ?? ''}
                    disabled
                    className="input w-full text-sm opacity-60 cursor-not-allowed"
                  >
                    {baselines.map(b => (
                      <option key={b.id} value={b.id}>{b.name} (#{b.id})</option>
                    ))}
                  </select>
                </FieldRow>
                <FieldRow label="Baseline info">
                  <div className="text-sm border border-slate-700/60 rounded-xl p-3 bg-slate-900/40">
                    {baselineId
                      ? `Baseline #${baselineId} selected — jobs will include this baseline_id.`
                      : 'Select a baseline from the header selector, or create a new one on the right.'}
                  </div>
                </FieldRow>
              </div>
            </div>

            {/* Device */}
            <div>
              <div className="section-title font-semibold mb-2">Device</div>
              <div className="subgrid grid grid-cols-2 gap-4">
                <FieldRow label="Select SDR">
                  <SelectInput
                    value={f.device_key}
                    onChange={v => setField('device_key', v)}
                    options={deviceOptions}
                    placeholder={devicesError || '(select device)'}
                  />
                </FieldRow>
                <FieldRow label="Driver (hint)">
                  <TextInput value={f.driver} onChange={v => setField('driver', v)} />
                </FieldRow>
                <FieldRow label="Gain (dB or auto)">
                  <TextInput value={f.gain} onChange={v => setField('gain', v)} placeholder="auto or number" />
                </FieldRow>
                <FieldRow label="Bandplan CSV (optional)">
                  <TextInput value={f.bandplan} onChange={v => setField('bandplan', v)} placeholder="bandplan.csv" />
                </FieldRow>
              </div>
              <div className="flex justify-between mt-2">
                <div className="text-xs text-slate-500">Devices enumerated from the controller.</div>
                <button type="button" onClick={fetchDevices}
                  className="text-xs text-sky-400 hover:text-sky-300 underline">
                  ↺ Refresh devices
                </button>
              </div>
            </div>

            {/* Profile & Modes */}
            <div>
              <div className="section-title font-semibold mb-2">Profile &amp; Modes</div>
              <div className="subgrid grid grid-cols-2 gap-4">
                <FieldRow label="Profile" hint="Select a profile to preview its range and defaults.">
                  <SelectInput
                    value={f.profile}
                    onChange={v => setField('profile', v)}
                    options={profileOptions}
                    placeholder="(manual selection)"
                  />
                </FieldRow>
                <FieldRow label="Scan mode" labelTitle="Known SDR self-interference frequencies to exclude from detection." hint="Spur calibration populates the spur map.">
                  <SelectInput
                    value={f.scan_mode}
                    onChange={v => setField('scan_mode', v)}
                    options={[
                      { value: 'normal', label: 'Normal scan' },
                      { value: 'spur', label: 'Spur calibration' },
                    ]}
                  />
                </FieldRow>
              </div>
            </div>

            {/* Sweep Parameters */}
            <CollapsibleSection title="Sweep Parameters" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Sample rate (Hz)">
                  <TextInput value={f.samp_rate} onChange={v => setField('samp_rate', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Start frequency (Hz)">
                  <TextInput value={f.start} onChange={v => setField('start', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Stop frequency (Hz)">
                  <TextInput value={f.stop} onChange={v => setField('stop', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Step (Hz)">
                  <TextInput value={f.step} onChange={v => setField('step', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="FFT bins">
                  <TextInput value={f.fft} onChange={v => setField('fft', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Averaging (frames)">
                  <TextInput value={f.avg} onChange={v => setField('avg', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Sleep between sweeps (s)">
                  <TextInput value={f.sleep_between_sweeps} onChange={v => setField('sleep_between_sweeps', v)} inputMode="numeric" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* Detection Settings */}
            <CollapsibleSection title="Detection Settings" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Threshold (dB above noise)">
                  <TextInput value={f.threshold_db} onChange={v => setField('threshold_db', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Guard bins">
                  <TextInput value={f.guard_bins} onChange={v => setField('guard_bins', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Min width (bins)">
                  <TextInput value={f.min_width_bins} onChange={v => setField('min_width_bins', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="New EMA occ (0–1)" labelTitle="Exponential Moving Average of frequency occupancy, on a 0–1 scale.">
                  <TextInput value={f.new_ema_occ} onChange={v => setField('new_ema_occ', v)} inputMode="decimal" step="0.01" />
                </FieldRow>
                <FieldRow label="Cluster merge span (Hz)" hint="Overrides merge distance; blank keeps scanner default.">
                  <TextInput value={f.cluster_merge_hz} onChange={v => setField('cluster_merge_hz', v)} inputMode="numeric" placeholder="(auto)" />
                </FieldRow>
                <FieldRow label="Max width ratio" hint="Rejects merges wider than ratio × persisted width.">
                  <TextInput value={f.max_detection_width_ratio} onChange={v => setField('max_detection_width_ratio', v)} inputMode="decimal" step="0.1" />
                </FieldRow>
                <FieldRow label="Max detection width (Hz)" hint="Optional hard cap for persistent bandwidth.">
                  <TextInput value={f.max_detection_width_hz} onChange={v => setField('max_detection_width_hz', v)} inputMode="numeric" placeholder="(unbounded)" />
                </FieldRow>
                <FieldRow label="Persistence mode" hint="How clusters become persistent.">
                  <SelectInput
                    value={f.persistence_mode}
                    onChange={v => setField('persistence_mode', v)}
                    options={[
                      { value: 'hits', label: 'Hits / window ratio' },
                      { value: 'duration', label: 'Wall-clock duration' },
                      { value: 'both', label: 'Both' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Hit ratio (0–1)" hint="Min coverage of occupied windows.">
                  <TextInput value={f.persistence_hit_ratio} onChange={v => setField('persistence_hit_ratio', v)} inputMode="decimal" step="0.05" />
                </FieldRow>
                <FieldRow label="Min duration (s)" hint="For duration-based modes.">
                  <TextInput value={f.persistence_min_seconds} onChange={v => setField('persistence_min_seconds', v)} inputMode="decimal" />
                </FieldRow>
                <FieldRow label="Min hits">
                  <TextInput value={f.persistence_min_hits} onChange={v => setField('persistence_min_hits', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Min windows">
                  <TextInput value={f.persistence_min_windows} onChange={v => setField('persistence_min_windows', v)} inputMode="numeric" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* CFAR Configuration */}
            <CollapsibleSection title="CFAR Configuration" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="CFAR mode" labelTitle="Constant False Alarm Rate — adaptively detects signals above the noise floor while controlling false positives." hint="If off, fixed threshold is used.">
                  <SelectInput
                    value={f.cfar}
                    onChange={v => setField('cfar', v)}
                    options={[
                      { value: 'os', label: 'OS (ordered-statistics)' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Train cells">
                  <TextInput value={f.cfar_train} onChange={v => setField('cfar_train', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Guard cells">
                  <TextInput value={f.cfar_guard} onChange={v => setField('cfar_guard', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Quantile (0–1)">
                  <TextInput value={f.cfar_quantile} onChange={v => setField('cfar_quantile', v)} inputMode="decimal" />
                </FieldRow>
                <FieldRow label="Alpha (dB, optional)">
                  <TextInput value={f.cfar_alpha_db} onChange={v => setField('cfar_alpha_db', v)} inputMode="decimal" placeholder="e.g. 2.5" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* Verification / Two-pass */}
            <CollapsibleSection title="Verification (Two-pass)" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <CheckboxInput
                    checked={f.two_pass}
                    onChange={v => setField('two_pass', v)}
                    label="Enable two-pass revisit — refine bandwidths and reject false positives"
                  />
                </div>
                <FieldRow label="Revisit FFT (bins)">
                  <TextInput value={f.revisit_fft} onChange={v => setField('revisit_fft', v)} inputMode="numeric" placeholder="(auto)" />
                </FieldRow>
                <FieldRow label="Revisit averaging">
                  <TextInput value={f.revisit_avg} onChange={v => setField('revisit_avg', v)} inputMode="numeric" placeholder="(auto)" />
                </FieldRow>
                <FieldRow label="Revisit margin (Hz)">
                  <TextInput value={f.revisit_margin_hz} onChange={v => setField('revisit_margin_hz', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Revisit span limit (Hz)">
                  <TextInput value={f.revisit_span_limit_hz} onChange={v => setField('revisit_span_limit_hz', v)} inputMode="numeric" placeholder="(auto)" />
                </FieldRow>
                <FieldRow label="Max revisit targets">
                  <TextInput value={f.revisit_max_bands} onChange={v => setField('revisit_max_bands', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Revisit threshold (dB)">
                  <TextInput value={f.revisit_floor_threshold_db} onChange={v => setField('revisit_floor_threshold_db', v)} inputMode="decimal" placeholder="(inherit)" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* Continuous Capture (collapsible) */}
            <CollapsibleSection title="Continuous Capture" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Capture IQ" hint="Capture IQ data after each sweep.">
                  <SelectInput
                    value={f.capture_iq}
                    onChange={v => setField('capture_iq', v)}
                    options={[
                      { value: '', label: 'Disabled' },
                      { value: 'true', label: 'Enabled' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Continuous mode" hint="Loop and capture continuously.">
                  <SelectInput
                    value={f.continuous_capture}
                    onChange={v => setField('continuous_capture', v)}
                    options={[
                      { value: '', label: 'Disabled' },
                      { value: 'true', label: 'Enabled' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Duration per signal (s)">
                  <TextInput value={f.capture_duration} onChange={v => setField('capture_duration', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Max signals per pass">
                  <TextInput value={f.record_max_signals} onChange={v => setField('record_max_signals', v)} inputMode="numeric" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* Recording Limits (collapsible) */}
            <CollapsibleSection title="Recording Limits" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Retention (days)">
                  <TextInput value={f.record_ttl_days} onChange={v => setField('record_ttl_days', v)} inputMode="numeric" />
                </FieldRow>
                <FieldRow label="Disk quota (GB)">
                  <TextInput value={f.record_quota_gb} onChange={v => setField('record_quota_gb', v)} inputMode="decimal" step="0.1" />
                </FieldRow>
              </div>
            </CollapsibleSection>

            {/* Notifications &amp; Output (collapsible) */}
            <CollapsibleSection title="Notifications &amp; Output" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Database path">
                  <TextInput value={f.db} onChange={v => setField('db', v)} placeholder="sdrwatch.db" />
                </FieldRow>
                <FieldRow label="JSONL log (optional)">
                  <TextInput value={f.jsonl} onChange={v => setField('jsonl', v)} placeholder="events.jsonl" />
                </FieldRow>
                <div className="col-span-2">
                  <CheckboxInput
                    checked={f.notify}
                    onChange={v => setField('notify', v)}
                    label="Desktop notifications"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Run */}
            <div>
              <div className="section-title font-semibold mb-2">Run</div>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Mode">
                  <SelectInput
                    value={f.mode}
                    onChange={v => setField('mode', v)}
                    options={[
                      { value: 'single', label: 'Single sweep' },
                      { value: 'loop', label: 'Loop' },
                      { value: 'repeat', label: 'Repeat N' },
                      { value: 'duration', label: 'Duration' },
                    ]}
                  />
                </FieldRow>
                {f.mode === 'repeat' && (
                  <FieldRow label="Repeat count">
                    <TextInput value={f.repeat} onChange={v => setField('repeat', v)} inputMode="numeric" placeholder="N" />
                  </FieldRow>
                )}
                {f.mode === 'duration' && (
                  <FieldRow label="Duration">
                    <TextInput value={f.duration} onChange={v => setField('duration', v)} placeholder="e.g. 10m" />
                  </FieldRow>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isRunning || !baselineId}
                variant="primary"
              >
                ▶ Start
              </Button>
              <Button
                type="button"
                onClick={handleStopJob}
                disabled={!isRunning}
                variant="danger"
              >
                ■ Stop
              </Button>
              <Button
                type="button"
                onClick={() => { setF(defaultForm()); setJobError('') }}
                variant="secondary"
              >
                ↺ Reset
              </Button>
              <Button
                type="button"
                onClick={fetchDevices}
                variant="secondary"
              >
                ⟳ Refresh devices
              </Button>
            </div>

            {jobError && (
              <div className="text-sm text-red-400 mt-2">{jobError}</div>
            )}
          </form>

          {/* Log viewer */}
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">
              Live logs {isRunning && <span className="text-emerald-400">· polling</span>}
            </div>
            <pre
              ref={logRef}
              onScroll={handleLogScroll}
              className="h-64 overflow-auto bg-[#0b1220] text-[#c7f9ff] p-3 rounded-xl text-xs font-mono leading-relaxed"
            >
              {logText || 'No logs yet. Start a scan to see output.'}
            </pre>
          </div>
        </Card>
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Create baseline */}
        <Card variant="bordered">
          <h3 className="text-lg font-semibold mb-2">Create baseline</h3>
          <p className="text-sm text-slate-400 mb-3">
            Define the antenna/location pair. The frequency span grows automatically.
          </p>
          <form onSubmit={handleCreateBaseline} className="space-y-3">
            <FieldRow label="Name">
              <TextInput value={blName} onChange={setBlName} placeholder="Roof VHF" />
            </FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Latitude">
                <TextInput value={blLat} onChange={setBlLat} inputMode="decimal" placeholder="41.878" />
              </FieldRow>
              <FieldRow label="Longitude">
                <TextInput value={blLon} onChange={setBlLon} inputMode="decimal" placeholder="-87.629" />
              </FieldRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="SDR serial">
                <TextInput value={blSerial} onChange={setBlSerial} placeholder="rtl0001" />
              </FieldRow>
              <FieldRow label="Antenna">
                <TextInput value={blAntenna} onChange={setBlAntenna} placeholder="Discone" />
              </FieldRow>
            </div>
            <FieldRow label="Notes">
              <textarea
                value={blNotes}
                onChange={e => setBlNotes(e.target.value)}
                rows={2}
                placeholder="Roof mount, 50ft LMR-400."
                className="input w-full text-sm resize-none"
              />
            </FieldRow>
            <Button
              type="submit"
              disabled={creatingBaseline || !blName.trim()}
              variant="primary"
            >
              ＋ Create baseline
            </Button>
            {baselineFormStatus && (
              <div className="text-xs text-slate-400 mt-1">{baselineFormStatus}</div>
            )}
          </form>
        </Card>

      </div>
    </div>
  )
}
