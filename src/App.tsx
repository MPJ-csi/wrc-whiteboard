import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { advance, ease, makeTween } from './animate'
import { Board } from './Board'
import { BoardSvg } from './BoardSvg'
import { Icon } from './Icon'
import {
  CLASSES,
  INK,
  defaultTokens,
  loadPlays,
  loadSession,
  newBoard,
  savePlays,
  saveSession,
  uid,
  type Board as BoardData,
  type Play,
  type Tool,
  type View,
} from './model'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'move', label: 'Move' },
  { id: 'pen', label: 'Pen' },
  { id: 'path', label: 'Push' },
  { id: 'pass', label: 'Pass' },
  { id: 'pick', label: 'Pick' },
  { id: 'erase', label: 'Erase' },
]

/** The play being edited: its steps and which one is on screen. */
interface Doc {
  steps: BoardData[]
  index: number
}

interface History {
  past: Doc[]
  present: Doc
  future: Doc[]
}

const MOVE_MS = 1800
const HOLD_MS = 550

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const newDoc = (view: View): Doc => ({ steps: [newBoard(view)], index: 0 })

export default function App() {
  const session = useMemo(loadSession, [])
  const [view, setView] = useState<View>(session?.view ?? 'full')
  const [hist, setHist] = useState<History>({
    past: [],
    present: session ? { steps: session.steps, index: session.index } : newDoc('full'),
    future: [],
  })
  const [tool, setTool] = useState<Tool>('move')
  const [color, setColor] = useState(INK[0].value)
  const [plays, setPlays] = useState<Play[]>(loadPlays)
  const [playId, setPlayId] = useState<string | null>(session?.playId ?? null)
  const [playName, setPlayName] = useState(session?.playName ?? '')
  const [panel, setPanel] = useState<null | 'plays' | 'name'>(null)
  const [labelFor, setLabelFor] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | { message: string; action: () => void }>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  // Playback: `frame` is the in-between picture shown while players are moving.
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState<BoardData | null>(null)
  const raf = useRef(0)
  const holdTimer = useRef(0)

  const doc = hist.present
  const { steps, index } = doc
  const board = steps[index]
  const last = steps.length - 1

  useEffect(() => {
    saveSession({ steps, index, view, playId, playName })
  }, [steps, index, view, playId, playName])

  const flash = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1800)
  }

  const commitDoc = (d: Doc) =>
    setHist((h) => ({ past: [...h.past.slice(-99), h.present], present: d, future: [] }))
  const commit = (b: BoardData) => commitDoc({ steps: steps.map((s, i) => (i === index ? b : s)), index })
  const reset = (d: Doc) => setHist({ past: [], present: d, future: [] })
  /** Moving between steps is navigation, not an edit, so it does not go on the undo stack. */
  const goTo = (i: number) => setHist((h) => ({ ...h, present: { ...h.present, index: i } }))
  const undo = () =>
    setHist((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
        : h,
    )
  const redo = () =>
    setHist((h) =>
      h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h,
    )

  // ---- Playback ----

  const stop = () => {
    cancelAnimationFrame(raf.current)
    window.clearTimeout(holdTimer.current)
    setFrame(null)
    setPlaying(false)
  }
  useEffect(() => stop, [])

  /** Animate from step `from` to the next one, and keep going to the end if `all`. */
  const run = (from: number, all: boolean) => {
    const tween = makeTween(steps[from], steps[from + 1])
    const started = performance.now()
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / MOVE_MS)
      if (t < 1) {
        setFrame(tween(ease(t)))
        raf.current = requestAnimationFrame(tick)
        return
      }
      setFrame(null)
      goTo(from + 1)
      if (all && from + 1 < last) holdTimer.current = window.setTimeout(() => run(from + 1, true), HOLD_MS)
      else setPlaying(false)
    }
    setPlaying(true)
    raf.current = requestAnimationFrame(tick)
  }

  const playAll = () => {
    if (index < last) return run(index, true)
    // Already at the end: show the first step for a moment, then run the whole play.
    goTo(0)
    setPlaying(true)
    holdTimer.current = window.setTimeout(() => run(0, true), HOLD_MS)
  }

  // ---- Steps ----

  const addStep = () => {
    const next = advance(board)
    commitDoc({ steps: [...steps.slice(0, index + 1), next, ...steps.slice(index + 1)], index: index + 1 })
    setTool('move')
    flash(same(next.tokens, board.tokens) ? `Step ${index + 2} added` : `Step ${index + 2}: players moved to their arrows`)
  }

  const removeStep = () => {
    if (steps.length < 2) return
    commitDoc({ steps: steps.filter((_, i) => i !== index), index: Math.max(0, index - 1) })
  }

  // ---- Plays ----

  const saved = plays.find((p) => p.id === playId)
  const dirty = saved
    ? saved.view !== view || !same(saved.steps, steps)
    : steps.length > 1 || board.marks.length > 0 || !same(board.tokens, defaultTokens(view))

  /** Run `action` straight away, or after a confirmation if it would throw away unsaved work. */
  const guard = (message: string, action: () => void) => {
    if (dirty) setConfirm({ message, action })
    else action()
  }

  const startNew = () => {
    reset(newDoc(view))
    setPlayId(null)
    setPlayName('')
    setTool('move')
    setPanel(null)
  }

  const openPlay = (p: Play) => {
    reset({ steps: p.steps, index: 0 })
    setView(p.view)
    setPlayId(p.id)
    setPlayName(p.name)
    setTool('move')
    setPanel(null)
  }

  const persist = (name: string, asCopy = false) => {
    const id = asCopy || !playId ? uid() : playId
    const play: Play = { id, name, view, steps, updatedAt: Date.now() }
    const next = [play, ...plays.filter((p) => p.id !== id)]
    if (!savePlays(next)) {
      flash('Could not save: device storage is full')
      return
    }
    setPlays(next)
    setPlayId(id)
    setPlayName(name)
    setPanel(null)
    flash('Saved')
  }

  const deletePlay = (id: string) => {
    const next = plays.filter((p) => p.id !== id)
    if (!savePlays(next)) return
    setPlays(next)
    if (id === playId) {
      setPlayId(null)
      setPlayName('')
    }
  }

  const toggleView = () => {
    const next: View = view === 'full' ? 'half' : 'full'
    // An untouched board just re-forms for the new framing; anything else is left exactly as drawn.
    if (!playId && !dirty) reset(newDoc(next))
    setView(next)
  }

  const resetPositions = () => {
    const labels = new Map(board.tokens.map((t) => [t.id, t.label]))
    commit({
      ...board,
      tokens: defaultTokens(view).map((t) => ({ ...t, label: labels.get(t.id) ?? t.label })),
    })
  }

  /** A player's classification belongs to the player, so it changes on every step. */
  const setLabel = (id: string, label: string) =>
    commitDoc({
      steps: steps.map((s) => ({ ...s, tokens: s.tokens.map((t) => (t.id === id ? { ...t, label } : t)) })),
      index,
    })

  const labelToken = board.tokens.find((t) => t.id === labelFor)

  return (
    <div className="app">
      <header className="bar top">
        <button className="btn" onClick={() => setPanel('plays')} disabled={playing}>
          <Icon name="plays" />
          <span>Plays</span>
        </button>
        <button className="title" onClick={() => setPanel('name')} disabled={playing} aria-label="Name this play">
          <span className="title-name">{playName || 'Untitled play'}</span>
          {dirty && <span className="title-dirty">Not saved</span>}
        </button>

        <div className="group" role="group" aria-label="Steps">
          <button className="btn" onClick={() => goTo(index - 1)} disabled={playing || index === 0}>
            <Icon name="prev" />
            <span>Back</span>
          </button>
          <div className="step-count" aria-live="polite">
            <small>Step</small>
            <b>
              {index + 1} / {steps.length}
            </b>
          </div>
          <button className="btn" onClick={() => run(index, false)} disabled={playing || index === last}>
            <Icon name="next" />
            <span>Next</span>
          </button>
          <button className="btn" onClick={addStep} disabled={playing}>
            <Icon name="add" />
            <span>Add step</span>
          </button>
          <button className="btn" onClick={removeStep} disabled={playing || steps.length < 2}>
            <Icon name="clear" />
            <span>Del step</span>
          </button>
          {playing ? (
            <button className="btn on" onClick={stop}>
              <Icon name="stop" />
              <span>Stop</span>
            </button>
          ) : (
            <button className="btn play-btn" onClick={playAll} disabled={steps.length < 2}>
              <Icon name="play" />
              <span>Play</span>
            </button>
          )}
        </div>

        <button className={`btn ${view === 'half' ? 'on' : ''}`} aria-pressed={view === 'half'} onClick={toggleView} disabled={playing}>
          <Icon name="court" />
          <span>Half court</span>
        </button>
        <button
          className="btn wide primary"
          onClick={() => (playId ? persist(playName) : setPanel('name'))}
          disabled={playing || (!dirty && !!playId)}
        >
          Save
        </button>
      </header>

      <main className="stage">
        <Board
          board={frame ?? board}
          view={view}
          tool={tool}
          color={color}
          locked={playing}
          onCommit={commit}
          onTokenTap={setLabelFor}
        />
      </main>

      <footer className={`bar bottom ${playing ? 'dim' : ''}`}>
        <div className="group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn ${tool === t.id ? 'on' : ''}`}
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
              disabled={playing}
            >
              <Icon name={t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="group">
          {INK.map((c) => (
            <button
              key={c.value}
              className={`swatch ${color === c.value ? 'on' : ''}`}
              aria-label={`${c.name} ink`}
              aria-pressed={color === c.value}
              disabled={playing}
              onClick={() => {
                setColor(c.value)
                if (tool === 'move' || tool === 'erase') setTool('pen')
              }}
            >
              <i style={{ background: c.value }} />
            </button>
          ))}
        </div>
        <div className="group">
          <button className="btn" onClick={undo} disabled={playing || !hist.past.length}>
            <Icon name="undo" />
            <span>Undo</span>
          </button>
          <button className="btn" onClick={redo} disabled={playing || !hist.future.length}>
            <Icon name="redo" />
            <span>Redo</span>
          </button>
          <button className="btn" onClick={() => commit({ ...board, marks: [] })} disabled={playing || !board.marks.length}>
            <Icon name="clear" />
            <span>Clear ink</span>
          </button>
          <button className="btn" onClick={resetPositions} disabled={playing}>
            <Icon name="reset" />
            <span>Reset</span>
          </button>
        </div>
      </footer>

      {panel === 'plays' && (
        <PlaysPanel
          plays={plays}
          currentId={playId}
          onClose={() => setPanel(null)}
          onNew={() => guard('Start a new play?', startNew)}
          onOpen={(p) => guard(`Open "${p.name}"?`, () => openPlay(p))}
          onDelete={deletePlay}
        />
      )}

      {panel === 'name' && (
        <NameDialog initial={playName} canCopy={!!playId} onSave={persist} onClose={() => setPanel(null)} />
      )}

      {labelToken && (
        <div className="overlay" onClick={() => setLabelFor(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Player classification</h2>
            <div className="classes">
              {CLASSES.map((c) => (
                <button
                  key={c}
                  className={`btn big ${labelToken.label === c ? 'on' : ''}`}
                  onClick={() => {
                    setLabel(labelToken.id, c)
                    setLabelFor(null)
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <button className="btn wide" onClick={() => setLabelFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{confirm.message}</h2>
            <p>Changes to the current play have not been saved and will be lost.</p>
            <div className="row">
              <button className="btn wide" onClick={() => setConfirm(null)}>
                Keep working
              </button>
              <button
                className="btn wide danger"
                onClick={() => {
                  confirm.action()
                  setConfirm(null)
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function NameDialog(props: {
  initial: string
  canCopy: boolean
  onSave: (name: string, asCopy?: boolean) => void
  onClose: () => void
}) {
  const [name, setName] = useState(props.initial)
  const trimmed = name.trim()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (trimmed) props.onSave(trimmed)
  }
  return (
    <div className="overlay" onClick={props.onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Name this play</h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Key defence vs. inbound"
          maxLength={60}
        />
        <div className="row">
          <button type="button" className="btn wide" onClick={props.onClose}>
            Cancel
          </button>
          {props.canCopy && (
            <button type="button" className="btn wide" disabled={!trimmed} onClick={() => props.onSave(trimmed, true)}>
              Save as copy
            </button>
          )}
          <button type="submit" className="btn wide primary" disabled={!trimmed}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function PlaysPanel(props: {
  plays: Play[]
  currentId: string | null
  onOpen: (p: Play) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [armed, setArmed] = useState<string | null>(null)
  return (
    <div className="overlay left" onClick={props.onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Plays</h2>
          <button className="btn wide" onClick={props.onClose}>
            Close
          </button>
        </div>
        <button className="btn wide primary" onClick={props.onNew}>
          New play
        </button>
        {props.plays.length === 0 && (
          <p className="empty">No saved plays yet. Set up the board, then tap Save.</p>
        )}
        <ul className="plays">
          {props.plays.map((p) => (
            <li key={p.id} className={p.id === props.currentId ? 'current' : ''}>
              <button className="play" onClick={() => props.onOpen(p)}>
                <BoardSvg board={p.steps[0]} view={p.view} className="thumb" />
                <span className="play-name">{p.name}</span>
                <span className="play-meta">
                  {p.steps.length} {p.steps.length === 1 ? 'step' : 'steps'} · {p.view === 'full' ? 'Full court' : 'Half court'} ·{' '}
                  {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </button>
              <button
                className={`btn wide ${armed === p.id ? 'danger' : ''}`}
                onClick={() => {
                  if (armed === p.id) {
                    props.onDelete(p.id)
                    setArmed(null)
                  } else setArmed(p.id)
                }}
              >
                {armed === p.id ? 'Tap again to delete' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
