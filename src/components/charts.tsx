// Lightweight SVG charts. Specs: 2px lines, <=24px bars with 4px rounded data-ends,
// hairline recessive grid, hover tooltips, text in ink tokens (never series color).
import { useMemo, useRef, useState, type ReactNode } from 'react'

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const GRID = '#e8e8e4'
const INK_2 = '#52514e'
const INK_3 = '#8a8984'

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
const fmtTick = (v: number, money: boolean) => {
  const s = v >= 10000 ? `${Math.round(v / 1000)}K` : v.toLocaleString()
  return money ? `$${s}` : s
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Single-series area/line over time with crosshair + tooltip. */
export function TrendChart({ points, height = 180, money = false, label }: { points: { label: string; value: number }[]; height?: number; money?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const pad = { l: 36, r: 12, t: 12, b: 24 }
  const max = niceMax(Math.max(...points.map((p) => p.value), 1))
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('')
  const area = `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const ticks = [0, max / 2, max]
  const last = points.length - 1
  const color = SERIES[0]

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const rel = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * last)
    setHover(Math.max(0, Math.min(last, i)))
  }
  const scale = (ref.current?.getBoundingClientRect().width ?? W) / W

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK_3}>{fmtTick(t, money)}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === last ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize={11} fill={INK_3}>{p.label}</text>
          ) : null,
        )}
        <path d={area} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke={INK_3} strokeWidth={1} />}
        <circle cx={x(hover ?? last)} cy={y(points[hover ?? last]?.value ?? 0)} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
      </svg>
      {hover != null && (
        <Tooltip x={x(hover) * scale} y={y(points[hover].value) * scale}>
          <span className="text-slate-300">{points[hover].label}</span> · <b>{money ? `$${points[hover].value.toLocaleString()}` : points[hover].value}</b>
        </Tooltip>
      )}
    </div>
  )
}

/** Horizontal bars; one or more stacked segments per row with 2px surface gaps. */
export function BarList({ rows, series, money = false }: { rows: { label: ReactNode; key: string; values: number[]; sub?: ReactNode }[]; series: { label: string; color: string }[]; money?: boolean }) {
  const [hover, setHover] = useState<{ row: string; seg: number } | null>(null)
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0))), [rows])
  const fmt = (v: number) => (money ? `$${Math.round(v).toLocaleString()}` : v.toLocaleString())
  return (
    <div className="space-y-3">
      {series.length > 1 && <Legend items={series} />}
      {rows.map((r) => {
        const total = r.values.reduce((a, b) => a + b, 0)
        return (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800">{r.label}</span>
              <span className="text-xs text-slate-500 tabular-nums">{r.sub ?? fmt(total)}</span>
            </div>
            <div className="relative flex h-5 items-stretch gap-[2px]" onMouseLeave={() => setHover(null)}>
              {r.values.map((v, i) =>
                v > 0 ? (
                  <div
                    key={i}
                    className="relative transition-[filter] first:rounded-l-[2px] last:rounded-r-[4px] hover:brightness-110"
                    style={{ width: `${(v / max) * 100}%`, background: series[i].color, minWidth: 3 }}
                    onMouseEnter={() => setHover({ row: r.key, seg: i })}
                  >
                    {hover?.row === r.key && hover.seg === i && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg">
                        {series[i].label}: <b>{fmt(v)}</b>
                      </div>
                    )}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Vertical columns, single series, value on the cap. */
export function ColumnChart({ data, height = 170, color = SERIES[0], label }: { data: { label: string; value: number; sub?: string }[]; height?: number; color?: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)))
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 40)
        return (
          <div key={d.label} className="relative flex flex-1 flex-col items-center justify-end gap-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="text-xs font-bold text-slate-700 tabular-nums">{d.value}</span>
            <div className="w-full max-w-6 rounded-t-[4px] transition-all" style={{ height: Math.max(2, h), background: color, filter: hover === i ? 'brightness(1.1)' : undefined }} />
            <span className="w-full truncate text-center text-[11px] text-slate-500">{d.label}</span>
            {hover === i && d.sub && (
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg">{d.sub}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { INK_2 }
