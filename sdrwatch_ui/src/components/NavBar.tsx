import { NavLink } from 'react-router-dom'
import { useBaseline } from '../context/BaselineContext'

interface NavLinkItem {
  to: string
  label: string
  debug?: boolean
}

interface NavSection {
  section: string
  links: NavLinkItem[]
}

const navSections: NavSection[] = [
  {
    section: 'Monitor',
    links: [
      { to: '/', label: 'Dashboard' },
      { to: '/spectrum', label: 'Spectrum' },
      { to: '/changes', label: 'Changes' },
    ],
  },
  {
    section: 'Manage',
    links: [
      { to: '/signals', label: 'Signals' },
      { to: '/recordings', label: 'Recordings' },
      { to: '/spur-map', label: 'Spur Map' },
    ],
  },
  {
    section: 'Configure',
    links: [
      { to: '/control', label: 'Control' },
      { to: '/live', label: 'Live' },
    ],
  },
  {
    section: 'System',
    links: [
      { to: '/debug', label: 'Debug', debug: true },
    ],
  },
]

export default function NavBar() {
  const { baselineId } = useBaseline()

  function linkTo(pathname: string) {
    if (!baselineId) return pathname
    return { pathname, search: `?baseline_id=${baselineId}` } as const
  }

  return (
    <nav
      className="flex items-center gap-6 text-sm px-3 py-1.5 rounded-xl"
      style={{
        background: 'var(--card-bordered-bg)',
        border: '1px solid var(--card-bordered-border)',
      }}
    >
      {navSections.map(section => (
        <div key={section.section} className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500 select-none">
            {section.section}
          </span>
          {section.links.map(link => (
            <NavLink
              key={link.to}
              to={linkTo(link.to)}
              end={link.to === '/'}
              className={({ isActive }) => {
                const base = 'underline transition-colors'
                if (link.debug) {
                  return isActive
                    ? `${base} text-amber-300`
                    : `${base} text-amber-400 hover:text-amber-300`
                }
                return isActive
                  ? `${base} text-sky-400`
                  : `${base} text-slate-300 hover:text-sky-400`
              }}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
