import { useRef, useState, type PointerEvent } from 'react'
import { BoardSvg } from './BoardSvg'
import { dist, distToPolyline, pathLength, type Pt } from './geometry'
import { BALL_R, TOKEN_R, uid, viewBox, type Board as BoardData, type Mark, type Tool, type View } from './model'

type Gesture =
  | { kind: 'token'; pointerId: number; id: string; start: Pt; offset: Pt; moved: boolean }
  | { kind: 'mark'; pointerId: number; mark: Mark }
  | { kind: 'erase'; pointerId: number }

interface Props {
  board: BoardData
  view: View
  tool: Tool
  color: string
  /** True while a play is animating: the board shows the motion and ignores touches. */
  locked?: boolean
  onCommit: (board: BoardData) => void
  onTokenTap: (id: string) => void
}

// Generous hit areas: a touch only has to land near a token or line, not on it.
const TOKEN_HIT = 1.4
const ERASE_HIT = 0.9
const TAP_SLOP = 0.3

/**
 * The live board. Every interaction is a single touch: press, drag, lift.
 * Extra touches (a resting hand, a second finger) are ignored rather than
 * interpreted as gestures, so nothing here needs fine motor control.
 */
export function Board({ board, view, tool, color, locked, onCommit, onTokenTap }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef(board)
  latest.current = board
  const draftRef = useRef<BoardData | null>(null)
  const [draft, setDraftState] = useState<BoardData | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const setDraft = (b: BoardData | null) => {
    draftRef.current = b
    setDraftState(b)
  }

  const commit = (b: BoardData) => {
    latest.current = b
    onCommit(b)
  }

  const toCourt = (e: PointerEvent): Pt => {
    const m = svgRef.current?.getScreenCTM()
    if (!m) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, p.y]
  }

  const clamp = (p: Pt, r: number): Pt => {
    const [x, y, w, h] = viewBox(view)
    return [Math.min(x + w - r, Math.max(x + r, p[0])), Math.min(y + h - r, Math.max(y + r, p[1]))]
  }

  const tokenAt = (p: Pt) => {
    const tokens = latest.current.tokens
    const ball = tokens.find((t) => t.team === 'ball')
    if (ball && dist(p, [ball.x, ball.y]) <= BALL_R + 0.3) return ball
    let best = null
    let bestD = TOKEN_HIT
    for (const t of tokens) {
      const d = dist(p, [t.x, t.y])
      if (d < bestD) {
        best = t
        bestD = d
      }
    }
    return best
  }

  const eraseAt = (p: Pt) => {
    const b = latest.current
    let hit: Mark | null = null
    let bestD = ERASE_HIT
    for (const m of b.marks) {
      const d = distToPolyline(p, m.pts)
      if (d < bestD) {
        hit = m
        bestD = d
      }
    }
    if (hit) commit({ ...b, marks: b.marks.filter((m) => m !== hit) })
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (gesture.current || locked) return
    const p = toCourt(e)
    if (tool === 'move') {
      const t = tokenAt(p)
      if (!t) return
      gesture.current = {
        kind: 'token',
        pointerId: e.pointerId,
        id: t.id,
        start: p,
        offset: [t.x - p[0], t.y - p[1]],
        moved: false,
      }
      setActiveId(t.id)
    } else if (tool === 'erase') {
      gesture.current = { kind: 'erase', pointerId: e.pointerId }
      eraseAt(p)
    } else {
      gesture.current = { kind: 'mark', pointerId: e.pointerId, mark: { id: uid(), kind: tool, color, pts: [p] } }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    const p = toCourt(e)
    if (g.kind === 'erase') {
      eraseAt(p)
    } else if (g.kind === 'token') {
      if (!g.moved && dist(p, g.start) < TAP_SLOP) return
      g.moved = true
      const b = latest.current
      const token = b.tokens.find((t) => t.id === g.id)
      if (!token) return
      const [x, y] = clamp([p[0] + g.offset[0], p[1] + g.offset[1]], token.team === 'ball' ? BALL_R : TOKEN_R)
      setDraft({ ...b, tokens: b.tokens.map((t) => (t.id === g.id ? { ...t, x, y } : t)) })
    } else {
      const pts = g.mark.pts
      if (g.mark.kind === 'pen' || g.mark.kind === 'path') {
        if (dist(p, pts[pts.length - 1]) < 0.12) return
        g.mark = { ...g.mark, pts: [...pts, p] }
      } else {
        g.mark = { ...g.mark, pts: [pts[0], p] }
      }
      const b = latest.current
      setDraft({ ...b, marks: [...b.marks, g.mark] })
    }
  }

  const finish = (e: PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    const d = draftRef.current
    setDraft(null)
    setActiveId(null)
    if (cancelled) return
    if (g.kind === 'token') {
      if (g.moved && d) commit(d)
      else if (!g.moved && g.id !== 'ball') onTokenTap(g.id)
    } else if (g.kind === 'mark') {
      if (d && pathLength(g.mark.pts) > 0.5) commit(d)
    }
  }

  return (
    <BoardSvg
      svgRef={svgRef}
      board={draft ?? board}
      view={view}
      activeId={activeId}
      className={`board ${locked ? 'locked' : `tool-${tool}`}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
    />
  )
}
