import { useData } from '../lib/store'
import { initialsOf } from '../lib/brand'
import { cx } from '../lib/utils'

/** Auto-generated shield crest: club colors + initials + baseball stitches. */
export function Crest({ name, primary, accent, size = 44, className }: { name: string; primary: string; accent: string; size?: number; className?: string }) {
  const initials = initialsOf(name)
  const id = `crest-${initials}-${primary.slice(1)}`
  return (
    <svg viewBox="0 0 100 112" width={size} height={size * 1.12} className={className} role="img" aria-label={`${name} crest`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={primary} />
          <stop offset="1" stopColor={primary} stopOpacity={0.78} />
        </linearGradient>
      </defs>
      <path d="M50 3 L94 16 V54 C94 82 74 100 50 109 C26 100 6 82 6 54 V16 Z" fill={`url(#${id})`} stroke={accent} strokeWidth={5} strokeLinejoin="round" />
      <path d="M50 12 L86 22 V54 C86 77 70 92 50 100 C30 92 14 77 14 54 V22 Z" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.5} />
      {/* baseball stitches */}
      <g stroke={accent} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.9}>
        <path d="M26 24 C34 38 34 70 26 86" />
        <path d="M74 24 C66 38 66 70 74 86" />
        {[34, 44, 54, 64, 74].map((y) => (
          <g key={y}>
            <path d={`M${28 + (y > 54 ? (y - 54) / 6 : (54 - y) / 6)} ${y} l5 -3`} />
            <path d={`M${72 - (y > 54 ? (y - 54) / 6 : (54 - y) / 6)} ${y} l-5 -3`} />
          </g>
        ))}
      </g>
      <text x="50" y={initials.length > 1 ? 66 : 68} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight={900} fontSize={initials.length > 1 ? 30 : 38} fill="#fff" letterSpacing={-1}>
        {initials}
      </text>
    </svg>
  )
}

/** The club's logo if we have one, otherwise its crest. */
export function ClubLogo({ size = 44, className, tile = true }: { size?: number; className?: string; tile?: boolean }) {
  const { settings } = useData()
  if (settings.logo) {
    return (
      <span className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden', tile && 'rounded-2xl bg-white p-1 shadow-lg ring-2 ring-white/20', className)} style={{ width: size, height: size }}>
        <img src={settings.logo} alt={`${settings.name} logo`} className="h-full w-full object-contain" />
      </span>
    )
  }
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <Crest name={settings.name} primary={settings.primaryColor} accent={settings.accentColor} size={size * 0.9} />
    </span>
  )
}
