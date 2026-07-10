import { useState } from 'react'
import { Button } from './primitives'

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
        <label className="form-label !text-[10px] uppercase tracking-wide">Service</label>
        <input
          className="input w-28 text-xs"
          placeholder="FM, ISM..."
          value={local.service}
          onChange={e => update({ service: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label !text-[10px] uppercase tracking-wide">Min SNR</label>
        <input
          className="input w-20 text-xs"
          placeholder="dB"
          type="number"
          value={local.minSnr}
          onChange={e => update({ minSnr: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label !text-[10px] uppercase tracking-wide">Lookback</label>
        <select
          className="input w-24 text-xs"
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
        <label className="form-label !text-[10px] uppercase tracking-wide">Freq low</label>
        <input
          className="input w-24 text-xs"
          placeholder="MHz"
          type="number"
          value={local.freqLow}
          onChange={e => update({ freqLow: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label !text-[10px] uppercase tracking-wide">Freq high</label>
        <input
          className="input w-24 text-xs"
          placeholder="MHz"
          type="number"
          value={local.freqHigh}
          onChange={e => update({ freqHigh: e.target.value })}
        />
      </div>
      <button
        onClick={apply}
        className="btn text-xs"
      >
        Apply
      </button>
      <Button variant="secondary" size="sm" onClick={reset}>
        Reset
      </Button>
    </div>
  )
}
