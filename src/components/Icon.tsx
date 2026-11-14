const paths = {
  rect: <rect x="3.5" y="6" width="17" height="12" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="6.5" />,
  diamond: <path d="M12 3.5L20.5 12L12 20.5L3.5 12Z" />,
  note: <path d="M4 4h12l4 4v12H4zM16 4v4h4" />,
  connect: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8 16L16 8" />
    </>
  ),
  undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-2" />,
  redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h2" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  minus: <path d="M6 12h12" />,
  plus: <path d="M12 6v12M6 12h12" />,
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  grid: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
    </>
  ),
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.5M12 17h.01" />
    </>
  ),
  alignLeft: <path d="M4 4v16M8 7h10v4H8zM8 13h6v4H8z" />,
  alignCenter: <path d="M12 4v16M6 7h12v4H6zM9 13h6v4H9z" />,
  alignRight: <path d="M20 4v16M6 7h10v4H6zM10 13h6v4h-6z" />,
  alignTop: <path d="M4 4h16M7 8h4v10H7zM13 8h4v6h-4z" />,
  alignMiddle: <path d="M4 12h16M7 6h4v12H7zM13 9h4v6h-4z" />,
  alignBottom: <path d="M4 20h16M7 6h4v10H7zM13 10h4v6h-4z" />,
  distributeX: <path d="M4 4v16M20 4v16M9 8h6v8H9z" />,
  distributeY: <path d="M4 4h16M4 20h16M8 9h8v6H8z" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
