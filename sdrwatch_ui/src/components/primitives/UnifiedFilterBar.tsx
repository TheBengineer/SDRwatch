import { useState, useEffect } from 'react'
import Input from './Input'
import Select from './Select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterField {
  key: string
  label: string
  type: 'select' | 'text' | 'number'
  options?: { value: string; label: string }[]
  placeholder?: string
}

// Re-export DashboardFilters for backward compatibility (was in FilterBar.tsx)
export interface DashboardFilters {
  service: string
  minSnr: string
  lookbackHours: string
  freqLow: string
  freqHigh: string
}

interface FilterPreset {
  name: string
  values: Record<string, string>
}

interface UnifiedFilterBarProps<TValues extends Record<keyof TValues, string>> {
  fields: FilterField[]
  values: TValues
  onChange: (key: string, value: string) => void
  /** When provided, enables Save button and Load Preset dropdown scoped to this baseline. */
  baselineId?: string | number
  /** Page key for scoping presets (e.g. "dashboard", "signals", "recordings", "changes"). */
  pageKey?: string
}

const STORAGE_PREFIX = 'filter-preset'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPresets(baselineId: string | number, pageKey: string): FilterPreset[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${baselineId}:${pageKey}`)
    if (!raw) return []
    return JSON.parse(raw) as FilterPreset[]
  } catch {
    return []
  }
}

function persistPresets(
  baselineId: string | number,
  pageKey: string,
  presets: FilterPreset[],
) {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}:${baselineId}:${pageKey}`,
      JSON.stringify(presets),
    )
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UnifiedFilterBar<
  TValues extends Record<keyof TValues, string> = Record<string, string>,
>({ fields, values, onChange, baselineId, pageKey }: UnifiedFilterBarProps<TValues>) {
  const _values = values as Record<string, string>
  const [presets, setPresets] = useState<FilterPreset[]>([])

  // Reload presets when baseline/page changes
  useEffect(() => {
    if (baselineId != null && pageKey) {
      setPresets(loadPresets(baselineId, pageKey))
    } else {
      setPresets([])
    }
  }, [baselineId, pageKey])

  const handleSave = () => {
    const name = prompt('Name this filter preset:')
    if (!name?.trim()) return
    const trimmed = name.trim()
    const updated = [
      ...presets.filter(p => p.name !== trimmed),
      { name: trimmed, values: { ..._values } },
    ]
    setPresets(updated)
    if (baselineId != null && pageKey) {
      persistPresets(baselineId, pageKey, updated)
    }
  }

  const handleLoad = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value
    if (!name) return
    const preset = presets.find(p => p.name === name)
    if (!preset) return
    // Populate every field via onChange so the parent draft state updates
    for (const key of Object.keys(preset.values)) {
      onChange(key, preset.values[key])
    }
  }

  const canSaveLoad = baselineId != null && pageKey != null && pageKey.length > 0

  return (
    <div className="flex flex-wrap items-end gap-3">
      {fields.map(field => {
        const currentValue = _values[field.key] ?? ''
        if (field.type === 'select' && field.options) {
          return (
            <Select
              key={field.key}
              label={field.label}
              value={currentValue}
              onChange={e => onChange(field.key, e.target.value)}
            >
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          )
        }
        return (
          <Input
            key={field.key}
            label={field.label}
            type={field.type}
            placeholder={field.placeholder}
            value={currentValue}
            onChange={e => onChange(field.key, e.target.value)}
          />
        )
      })}

      {canSaveLoad && (
        <>
          <button
            type="button"
            onClick={handleSave}
            className="btn text-xs"
            title="Save current filter values as a preset"
          >
            💾 Save
          </button>
          <select
            value=""
            onChange={handleLoad}
            className="text-xs rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-200"
          >
            <option value="" disabled>
              Load Preset…
            </option>
            {presets.length === 0 && (
              <option value="" disabled>
                (no saved presets)
              </option>
            )}
            {presets.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}
