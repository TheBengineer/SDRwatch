import { useState } from 'react'

export interface DashboardFilters {
  service: string
  minSnr: string
  lookbackHours: string
  freqLow: string
  freqHigh: string
}

interface FilterBarProps {
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [local, setLocal] = useState<DashboardFilters>(filters)

  const update = (patch: Partial<DashboardFilters>) => {
    const next = { ...local, ...patch }
    setLocal(next)
  }

  const apply = () => {
    onChange(local)
  }

  const reset = () => {
    const defaults: DashboardFilters = { service: '', minSnr: '', lookbackHours: '168', freqLow: '', freqHigh: '' }
    setLocal(defaults)
    onChange(defaults)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Service</label>
        <input
          className="px-2 py-1 rounded-lg border border-white/18 bg-white/8 text-slate-100 w-28 text-xs"
          placeholder="FM, ISM..."
          value={local.service}
          onChange={e => update({ service: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Min SNR</label>
        <input
          className="px-2 py-1 rounded-lg border border-white/18 bg-white/8 text-slate-100 w-20 text-xs"
          placeholder="dB"
          type="number"
          value={local.minSnr}
          onChange={e => update({ minSnr: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Lookback</label>
        <select
          className="px-2 py-1 rounded-lg border border-white/18 bg-white/8 text-slate-100 w-24 text-xs"
          value={local.lookbackHours}
          onChange={e => update({ lookbackHours: e.target.value })}
        >
          <option value="1">1 hour</option>
          <option value="6">6 hours</option>
          <option value="24">24 hours</option>
          <option value="72">3 days</option>
          <option value="168">7 days</option>
          <option value="720">30 days</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Freq low</label>
        <input
          className="px-2 py-1 rounded-lg border border-white/18 bg-white/8 text-slate-100 w-24 text-xs"
          placeholder="MHz"
          type="number"
          value={local.freqLow}
          onChange={e => update({ freqLow: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Freq high</label>
        <input
          className="px-2 py-1 rounded-lg border border-white/18 bg-white/8 text-slate-100 w-24 text-xs"
          placeholder="MHz"
          type="number"
          value={local.freqHigh}
          onChange={e => update({ freqHigh: e.target.value })}
        />
      </div>
      <button
        onClick={apply}
        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs"
      >
        Apply
      </button>
      <button
        onClick={reset}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs"
      >
        Reset
      </button>
    </div>
  )
}
