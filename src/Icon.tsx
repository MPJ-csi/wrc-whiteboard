const PATHS: Record<string, { d: string; dash?: string }[]> = {
  move: [{ d: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3' }],
  pen: [{ d: 'M3 17c3-9 5 4 8-3s5 3 10-7' }],
  path: [{ d: 'M3 19c3-8 6 2 9-3s4-5 7-8' }, { d: 'M14 6.500h6v6' }],
  pass: [{ d: 'M4 20L18 6', dash: '3 3.200' }, { d: 'M12.500 5.500h6v6' }],
  pick: [{ d: 'M4 20L16.500 8.500' }, { d: 'M13 4.500l7.500 8' }],
  erase: [{ d: 'M5 15l8-9 6 5.500-6.500 7.500H8.500z' }, { d: 'M4 21h16' }],
  undo: [{ d: 'M8 5L3 10l5 5M3 10h11a5.500 5.500 0 0 1 0 11h-3' }],
  redo: [{ d: 'M16 5l5 5-5 5M21 10H10a5.500 5.500 0 0 0 0 11h3' }],
  clear: [{ d: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13' }],
  reset: [{ d: 'M4 12a8 8 0 1 0 2.500-5.800M4 4v5h5' }],
  prev: [{ d: 'M15 5l-7 7 7 7' }],
  next: [{ d: 'M9 5l7 7-7 7' }],
  add: [{ d: 'M12 5v14M5 12h14' }],
  play: [{ d: 'M7 4.500v15l12-7.500z' }],
  stop: [{ d: 'M6 6h12v12H6z' }],
  court: [{ d: 'M3 6h18v12H3zM12 6v12' }],
  plays: [{ d: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z' }],
}

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((p, i) => (
        <path key={i} d={p.d} strokeDasharray={p.dash} />
      ))}
    </svg>
  )
}
