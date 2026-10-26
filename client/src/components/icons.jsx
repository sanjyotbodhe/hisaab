// Small inline SVG icon set (no icon font, no external requests). 24x24, stroke-based.
const paths = {
  plus: 'M12 5v14M5 12h14',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
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
