import { NavLink } from 'react-router-dom'

interface NavLinkItem {
  to: string
  label: string
  debug?: boolean
}

const navLinks: NavLinkItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/control', label: 'Control' },
  { to: '/signals', label: 'Signals' },
  { to: '/changes', label: 'Changes' },
  { to: '/recordings', label: 'Recordings' },
  { to: '/spur-map', label: 'Spur Map' },
  { to: '/live', label: 'Live' },
  { to: '/debug', label: 'Debug', debug: true },
]

export default function NavBar() {
  return (
    <nav className="flex items-center gap-4 text-sm">
      {navLinks.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
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
    </nav>
  )
}
