import type { Pt } from './geometry'

// Wheelchair rugby court: a basketball court (28 m x 15 m) with a key area
// 8 m wide and 1.75 m deep at each end. The goal line is the 8 m of baseline inside the key.
export const COURT = { w: 28, h: 15, keyDepth: 1.75, keyWidth: 8, centreCircle: 1.8 }

export const TOKEN_R = 0.8
export const BALL_R = 0.4

export type Tool = 'move' | 'pen' | 'path' | 'pass' | 'pick' | 'erase'
export type MarkKind = Exclude<Tool, 'move' | 'erase'>
export type View = 'full' | 'half'

export interface Token {
  id: string
  team: 'a' | 'b' | 'ball'
  label: string
  x: number
  y: number
}

export interface Mark {
  id: string
  kind: MarkKind
  color: string
  pts: Pt[]
}

export interface Board {
  tokens: Token[]
  marks: Mark[]
}

/** A play is a sequence of steps; each step is a full picture of the board. */
export interface Play {
  id: string
  name: string
  view: View
  steps: Board[]
  updatedAt: number
}

export const CLASSES = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5']

export const INK = [
  { name: 'Black', value: '#111827' },
  { name: 'Red', value: '#d62828' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Green', value: '#15803d' },
]

// crypto.randomUUID is unavailable on plain-http LAN addresses, so use our own.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Visible area of the court for each view, in metres: [x, y, width, height]. */
export function viewBox(view: View): [number, number, number, number] {
  const m = 1.6
  if (view === 'half') return [COURT.w / 2 - 0.8, -m, COURT.w / 2 + 0.8 + m, COURT.h + 2 * m]
  return [-m, -m, COURT.w + 2 * m, COURT.h + 2 * m]
}

const LINEUP = ['3.0', '2.0', '2.0', '1.0']

const FORMATIONS: Record<View, { a: Pt[]; b: Pt[]; ball: Pt }> = {
  full: {
    a: [[11, 7.5], [9.5, 4], [9.5, 11], [7, 7.5]],
    b: [[17, 7.5], [18.5, 4], [18.5, 11], [21, 7.5]],
    ball: [12.1, 6.5],
  },
  half: {
    a: [[19, 7.5], [20.5, 3.5], [20.5, 11.5], [16.5, 7.5]],
    b: [[22.5, 7.5], [25, 5.2], [25, 9.8], [26.6, 7.5]],
    ball: [20.1, 6.5],
  },
}

export function defaultTokens(view: View): Token[] {
  const f = FORMATIONS[view]
  const team = (t: 'a' | 'b', pts: Pt[]): Token[] =>
    pts.map((p, i) => ({ id: `${t}${i + 1}`, team: t, label: LINEUP[i], x: p[0], y: p[1] }))
  return [
    ...team('a', f.a),
    ...team('b', f.b),
    { id: 'ball', team: 'ball', label: '', x: f.ball[0], y: f.ball[1] },
  ]
}

export const newBoard = (view: View): Board => ({ tokens: defaultTokens(view), marks: [] })

// ---- Storage. Everything lives on the device so the board works with no connection. ----

const PLAYS_KEY = 'wrc.plays.v1'
const SESSION_KEY = 'wrc.session.v1'

export interface Session {
  steps: Board[]
  index: number
  view: View
  playId: string | null
  playName: string
}

// Plays saved before steps existed held a single `board`.
type Legacy<T> = Omit<T, 'steps'> & { steps?: Board[]; board?: Board }
const withSteps = <T extends { steps: Board[] }>(item: Legacy<T>): T => {
  const { board, ...rest } = item
  return { ...rest, steps: item.steps?.length ? item.steps : [board ?? newBoard('full')] } as unknown as T
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const loadPlays = (): Play[] => (read<Legacy<Play>[]>(PLAYS_KEY) ?? []).map((p) => withSteps<Play>(p))
export const savePlays = (plays: Play[]) => write(PLAYS_KEY, plays)
export const loadSession = (): Session | null => {
  const raw = read<Legacy<Session>>(SESSION_KEY)
  if (!raw) return null
  const s = withSteps<Session>(raw)
  return { ...s, index: Math.min(Math.max(s.index ?? 0, 0), s.steps.length - 1) }
}
export const saveSession = (s: Session) => write(SESSION_KEY, s)
