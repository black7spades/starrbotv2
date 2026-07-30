/**
 * Monochromatic icon set.
 *
 * Every icon is a stroked path that inherits `currentColor`, so icons take the
 * colour of whatever they sit in and never introduce a hue of their own. This
 * replaces the emoji the UI previously used, which rendered in fixed colours
 * that fought each theme and looked different on every OS.
 */

export type IconName =
  | "dashboard"
  | "playground"
  | "logs"
  | "settings"
  | "logout"
  | "plus"
  | "menu"
  | "close"
  | "chevron-down"
  | "chevron-right"
  | "check"
  | "bot"
  | "sun"
  | "moon"
  | "monitor"
  | "palette"
  | "user"
  | "key"
  | "image"
  | "play"
  | "stop"
  | "trash"
  | "link"
  | "rss"
  | "ticket"
  | "camera"
  | "search"
  | "alert"
  | "spinner";

const PATHS: Record<IconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  playground: (
    <>
      <path d="M5 7h5M5 12h3M5 17h5" />
      <rect x="13" y="4" width="7" height="6" rx="1.5" />
      <rect x="13" y="14" width="7" height="6" rx="1.5" />
      <path d="M10 7h3M8 12h9M10 17h3" />
    </>
  ),
  logs: (
    <>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l-5-5 5-5M5 12h10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  check: <path d="M4 12l5 5L20 6" />,
  bot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 4v4" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.9-.7-1.5-1.5-1.5h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3.3-3.1-6-7-6z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="8.5" r="1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M15.5 12v2.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M3 17l5-4 4 3 3-2 6 5" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  trash: (
    <>
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  rss: (
    <>
      <path d="M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
      <path d="M4 10a10 10 0 0 1 10 10M4 4a16 16 0 0 1 16 16" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M12 8v1M12 12v1M12 16v1" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-2h5L16 7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  spinner: <path d="M12 3a9 9 0 0 1 9 9" />,
};

interface IconProps {
  name: IconName;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  /**
   * Icons are decorative by default and hidden from assistive tech. Pass a
   * label when the icon is the only thing conveying meaning (an icon-only
   * button, say) and it becomes an img role with that name.
   */
  label?: string;
}

export default function Icon({ name, className = "", style, size = 18, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${name === "spinner" ? "animate-spin " : ""}shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
