import { dist, type Pt } from './geometry'
import { TOKEN_R, type Board, type Mark, type Token } from './model'

// How close a line has to start to a player (or the ball) to count as "theirs".
const GRAB = 1.5
const BALL_GRAB = 2.1
// How close the ball has to be to a player to count as being carried by them.
const HOLD = 1.8
const BALL_OFFSET: Pt = [0.85, -0.85]

const pos = (t: Token): Pt => [t.x, t.y]
const end = (m: Mark): Pt => m.pts[m.pts.length - 1]

/** Where a player following this line finishes. A pick stops a chair-length short, at the bar, not on top of the opponent. */
function finish(m: Mark): Pt {
  const e = end(m)
  if (m.kind !== 'pick') return e
  const s = m.pts[0]
  const d = dist(s, e)
  const back = Math.min(TOKEN_R, d)
  return d === 0 ? e : [e[0] - ((e[0] - s[0]) / d) * back, e[1] - ((e[1] - s[1]) / d) * back]
}
const isRoute = (m: Mark) => m.kind === 'path' || m.kind === 'pick'

function nearest<T>(items: T[], to: Pt, at: (item: T) => Pt, within: number): T | null {
  let best: T | null = null
  let bestD = within
  for (const item of items) {
    const d = dist(at(item), to)
    if (d < bestD) {
      best = item
      bestD = d
    }
  }
  return best
}

/**
 * Build the next step from the current one: every player with a push or pick
 * line drawn from them moves to the end of that line, and the ball follows a
 * pass line or stays with whoever is carrying it. The ink is not carried over.
 */
export function advance(board: Board): Board {
  const players = board.tokens.filter((t) => t.team !== 'ball')
  const ball = board.tokens.find((t) => t.team === 'ball')
  const moved = new Map<string, Pt>()

  for (const m of board.marks.filter(isRoute)) {
    const free = players.filter((p) => !moved.has(p.id))
    const p = nearest(free, m.pts[0], pos, GRAB)
    if (p) moved.set(p.id, finish(m))
  }
  const after = (p: Token): Pt => moved.get(p.id) ?? pos(p)

  let ballTo: Pt | null = null
  if (ball) {
    const carrier = nearest(players, pos(ball), pos, HOLD)
    const passes = board.marks.filter((m) => m.kind === 'pass')
    const pass =
      nearest(passes, pos(ball), (m) => m.pts[0], BALL_GRAB) ??
      (carrier ? nearest(passes, pos(carrier), (m) => m.pts[0], GRAB) : null)
    if (pass) {
      // Hand the ball to whoever the pass was aimed at, wherever they end up.
      const target = end(pass)
      const receiver = nearest(players, target, pos, GRAB) ?? nearest(players, target, after, GRAB)
      const to = receiver ? after(receiver) : null
      ballTo = to ? [to[0] + BALL_OFFSET[0], to[1] + BALL_OFFSET[1]] : target
    } else if (carrier && moved.has(carrier.id)) {
      const to = after(carrier)
      ballTo = [to[0] + ball.x - carrier.x, to[1] + ball.y - carrier.y]
    }
  }

  return {
    marks: [],
    tokens: board.tokens.map((t) => {
      const to = t.team === 'ball' ? ballTo : moved.get(t.id)
      return to ? { ...t, x: to[0], y: to[1] } : t
    }),
  }
}

/** Point a fraction `t` of the way along a polyline, by distance travelled. */
function along(route: Pt[], t: number): Pt {
  const lengths = route.slice(1).map((p, i) => dist(route[i], p))
  const total = lengths.reduce((a, b) => a + b, 0)
  if (total === 0) return route[0]
  let remaining = t * total
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const f = lengths[i] === 0 ? 0 : remaining / lengths[i]
      return [route[i][0] + (route[i + 1][0] - route[i][0]) * f, route[i][1] + (route[i + 1][1] - route[i][1]) * f]
    }
    remaining -= lengths[i]
  }
  return route[route.length - 1]
}

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/**
 * Returns a function giving the board at any moment (0..1) of the move from
 * step `a` to step `b`. A player follows a line drawn in `a` if it runs from
 * where they start to where they finish; otherwise they travel straight. The
 * ink from `a` stays visible during the move.
 */
export function makeTween(a: Board, b: Board): (t: number) => Board {
  const target = new Map(b.tokens.map((t) => [t.id, pos(t)]))
  const route = (t: Token, kinds: (m: Mark) => boolean, grab: number): Pt[] => {
    const from = pos(t)
    const to = target.get(t.id) ?? from
    const candidates = a.marks.filter((m) => kinds(m) && dist(finish(m), to) < grab)
    const m = nearest(candidates, from, (c) => c.pts[0], grab)
    if (!m) return [from, to]
    // Straight lines (pass, pick) go directly to the finish; freehand pushes follow the drawn curve.
    if (m.kind !== 'path') return [from, to]
    // Skip the part of the stroke drawn on top of the player, so they set off without a wobble.
    const firstClear = m.pts.findIndex((p) => dist(p, from) > TOKEN_R)
    return [from, ...(firstClear < 0 ? [] : m.pts.slice(firstClear)), to]
  }

  const players = a.tokens.filter((t) => t.team !== 'ball')
  const routes = new Map(players.map((p) => [p.id, route(p, isRoute, GRAB)]))
  const ball = a.tokens.find((t) => t.team === 'ball')
  let ballRoute: Pt[] | null = null
  let carrier: Token | null = null
  if (ball) {
    const passed = route(ball, (m) => m.kind === 'pass', BALL_GRAB)
    const ballTo = target.get(ball.id) ?? pos(ball)
    const held = nearest(players, pos(ball), pos, HOLD)
    const heldTo = held ? target.get(held.id) : undefined
    if (passed.length > 2) ballRoute = passed
    else if (held && heldTo && dist(heldTo, ballTo) < HOLD) carrier = held
    else ballRoute = passed
  }

  return (t) => ({
    marks: a.marks,
    tokens: a.tokens.map((tok) => {
      let p: Pt
      if (tok.team !== 'ball') {
        p = along(routes.get(tok.id)!, t)
      } else if (carrier) {
        // Carried: ride along with the carrier, easing between the start and end offsets.
        const c = along(routes.get(carrier.id)!, t)
        const cTo = target.get(carrier.id)!
        const bTo = target.get(tok.id)!
        const ox = (tok.x - carrier.x) * (1 - t) + (bTo[0] - cTo[0]) * t
        const oy = (tok.y - carrier.y) * (1 - t) + (bTo[1] - cTo[1]) * t
        p = [c[0] + ox, c[1] + oy]
      } else {
        p = along(ballRoute!, t)
      }
      return { ...tok, x: p[0], y: p[1] }
    }),
  })
}
