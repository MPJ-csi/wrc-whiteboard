import type { ReactNode, Ref, SVGProps } from 'react'
import { arrowHead, endDirection, pickBar, smoothPath } from './geometry'
import { BALL_R, COURT, TOKEN_R, viewBox, type Board, type Mark, type View } from './model'

const LINE = '#2b3340'
const STROKE = 0.17

function Court() {
  const { w, h, keyDepth, keyWidth, centreCircle } = COURT
  const keyTop = (h - keyWidth) / 2
  const line = { fill: 'none', stroke: LINE, strokeWidth: 0.08 }
  const cone = (x: number, y: number) => (
    <rect x={x - 0.16} y={y - 0.16} width={0.32} height={0.32} rx={0.05} fill="#f97316" />
  )
  return (
    <g>
      <rect x={-3} y={-3} width={w + 6} height={h + 6} fill="#dfe3e8" />
      <rect x={0} y={0} width={w} height={h} fill="#f6f1e7" />
      <rect x={0} y={keyTop} width={keyDepth} height={keyWidth} fill="#e9dcc3" />
      <rect x={w - keyDepth} y={keyTop} width={keyDepth} height={keyWidth} fill="#e9dcc3" />
      <rect x={0} y={0} width={w} height={h} {...line} strokeWidth={0.12} />
      <line x1={w / 2} y1={0} x2={w / 2} y2={h} {...line} />
      <circle cx={w / 2} cy={h / 2} r={centreCircle} {...line} />
      <rect x={0} y={keyTop} width={keyDepth} height={keyWidth} {...line} />
      <rect x={w - keyDepth} y={keyTop} width={keyDepth} height={keyWidth} {...line} />
      {/* goal lines and cones */}
      <line x1={0} y1={keyTop} x2={0} y2={keyTop + keyWidth} stroke="#f97316" strokeWidth={0.22} />
      <line x1={w} y1={keyTop} x2={w} y2={keyTop + keyWidth} stroke="#f97316" strokeWidth={0.22} />
      {cone(0, keyTop)}
      {cone(0, keyTop + keyWidth)}
      {cone(w, keyTop)}
      {cone(w, keyTop + keyWidth)}
    </g>
  )
}

function MarkShape({ mark }: { mark: Mark }) {
  const { pts, color, kind } = mark
  if (pts.length < 2) return null
  const stroke = {
    fill: 'none',
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const end = pts[pts.length - 1]
  const dir = endDirection(pts)
  let cap: ReactNode = null
  if (dir && (kind === 'path' || kind === 'pass')) {
    cap = <polygon points={arrowHead(end, dir, 0.62)} fill={color} />
  } else if (dir && kind === 'pick') {
    const [p, q] = pickBar(end, dir, 0.65)
    cap = <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} {...stroke} strokeWidth={STROKE * 1.3} />
  }
  return (
    <g>
      <path d={smoothPath(pts)} {...stroke} strokeDasharray={kind === 'pass' ? '0.45 0.4' : undefined} />
      {cap}
    </g>
  )
}

const TEAM = {
  a: { fill: '#c8102e', text: '#ffffff' },
  b: { fill: '#1f2a44', text: '#ffffff' },
}

interface Props extends SVGProps<SVGSVGElement> {
  board: Board
  view: View
  activeId?: string | null
  svgRef?: Ref<SVGSVGElement>
}

/** Pure picture of a board. Used for the live board and for playbook thumbnails. */
export function BoardSvg({ board, view, activeId, svgRef, ...rest }: Props) {
  const [x, y, w, h] = viewBox(view)
  const clip = `clip-${view}`
  return (
    <svg ref={svgRef} viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" {...rest}>
      {/* Clip to the framed area so half court shows only its half, whatever the screen shape. */}
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
      <Court />
      {board.marks.map((m) => (
        <MarkShape key={m.id} mark={m} />
      ))}
      {board.tokens.map((t) =>
        t.team === 'ball' ? (
          <circle
            key={t.id}
            cx={t.x}
            cy={t.y}
            r={BALL_R * (activeId === t.id ? 1.25 : 1)}
            fill="#facc15"
            stroke="#713f12"
            strokeWidth={0.09}
          />
        ) : (
          <g key={t.id} transform={`translate(${t.x} ${t.y})`}>
            {activeId === t.id && <circle r={TOKEN_R + 0.28} fill="none" stroke="#f59e0b" strokeWidth={0.14} />}
            <circle r={TOKEN_R} fill={TEAM[t.team].fill} stroke="#ffffff" strokeWidth={0.09} />
            <text
              y={0.02}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={0.74}
              fontWeight={700}
              fill={TEAM[t.team].text}
            >
              {t.label}
            </text>
          </g>
        ),
      )}
      </g>
    </svg>
  )
}
