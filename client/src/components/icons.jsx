// Small inline SVG icon set (no icon font, no external requests). 24x24, stroke-based.
const paths = {
  plus: 'M12 5v14M5 12h14',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowDownLeft: 'M17 7L7 17M16 17H7V8',
  arrowUpRight: 'M7 17L17 7M8 7h9v9',
  back: 'M15 18l-6-6 6-6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0zM8 21h8',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  check: 'M20 6L9 17l-5-5',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  close: 'M18 6L6 18M6 6l12 12',
  map: 'M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  ticket:
    'M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zM13 5v2M13 11v2M13 17v2',
  thumbUp: 'M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  external: 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4',
  bed: 'M2 20V8M2 14h20v6M22 20v-6a4 4 0 0 0-4-4h-8v4M6 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  train:
    'M6 3h12a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM4 11h16M8 15h.01M16 15h.01M7 18l-2 3M17 18l2 3',
  bus: 'M5 3h14a2 2 0 0 1 2 2v12H3V5a2 2 0 0 1 2-2zM3 11h18M7 17v3M17 17v3M7 14h.01M17 14h.01',
  sparkle:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z',
  // categories
  food: 'M7 2v9a2 2 0 0 0 2 2v9M11 2v7M3 2v7a4 4 0 0 0 4 4M17 22V2c-2.2 0-4 2.7-4 6v5h4',
  groceries: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  travel:
    'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  stay: 'M2 20V8M2 14h20v6M22 20v-6a4 4 0 0 0-4-4h-8v4M6 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  rent: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  utilities: 'M13 2L3 14h9l-1 8 10-12h-9z',
  entertainment: 'M2 7h20v13H2zM17 2l-5 5-5-5',
  shopping: 'M6 6h15l-1.5 9h-12zM6 6L5 2H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  other: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h.01M12 12h.01M16 12h.01',
};

export function Icon({ name, size = 18, className = '', strokeWidth = 2 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] ?? paths.other} />
    </svg>
  );
}

/** Coloured round badge for an expense category. */
export function CategoryIcon({ category, size = 'md' }) {
  return (
    <span className={`cat-icon cat-${category} cat-${size}`} aria-hidden="true">
      <Icon name={paths[category] ? category : 'other'} size={size === 'sm' ? 15 : 19} />
    </span>
  );
}
