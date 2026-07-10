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

interface UnifiedFilterBarProps<TValues extends Record<keyof TValues, string>> {
  fields: FilterField[]
  values: TValues
  onChange: (key: string, value: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UnifiedFilterBar<
  TValues extends Record<keyof TValues, string> = Record<string, string>
>({ fields, values, onChange }: UnifiedFilterBarProps<TValues>) {
  const _values = values as Record<string, string>

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
    </div>
  )
}
