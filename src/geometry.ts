// All geometry is in court metres. The court is 28 x 15 with (0,0) at the top-left corner.

export type Pt = [number, number]

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function pathLength(pts: Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/** Smooth SVG path through the points (quadratic curves through midpoints). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  const f = (n: number) => n.toFixed(3)
  if (pts.length < 3) return 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
  }
  const last = pts[pts.length - 1]
  return d + ` L${f(last[0])} ${f(last[1])}`
}

/** Unit direction a stroke is travelling at its end, looking back far enough to ignore jitter. */
export function endDirection(pts: Pt[], lookback = 0.9): Pt | null {
  const end = pts[pts.length - 1]
  for (let i = pts.length - 2; i >= 0; i--) {
    const d = dist(pts[i], end)
    if (d >= lookback || i === 0) {
      if (d < 1e-6) return null
      return [(end[0] - pts[i][0]) / d, (end[1] - pts[i][1]) / d]
    }
  }
  return null
}

/** Triangle polygon points for an arrowhead whose base sits at `end`. */
export function arrowHead(end: Pt, dir: Pt, size: number): string {
  const [dx, dy] = dir
  const tip: Pt = [end[0] + dx * size, end[1] + dy * size]
  const w = size * 0.55
  const l: Pt = [end[0] - dy * w, end[1] + dx * w]
  const r: Pt = [end[0] + dy * w, end[1] - dx * w]
  return [tip, l, r].map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
}

/** End points of the flat bar that marks a pick/screen. */
export function pickBar(end: Pt, dir: Pt, half: number): [Pt, Pt] {
  const [dx, dy] = dir
  return [
    [end[0] - dy * half, end[1] + dx * half],
    [end[0] + dy * half, end[1] - dx * half],
  ]
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2))
  return dist(p, [a[0] + t * vx, a[1] + t * vy])
}

export function distToPolyline(p: Pt, pts: Pt[]): number {
  if (pts.length === 1) return dist(p, pts[0])
  let best = Infinity
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]))
  return best
}
