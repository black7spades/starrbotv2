/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Semantic tokens only. The raw C64 palette lives in styles/themes.css and
      // is mapped to these by each theme, so components never hardcode a hue.
      colors: {
        surface: "var(--surface)",
        "surface-strong": "var(--surface-strong)",
        "surface-hover": "var(--surface-hover)",
        "surface-solid": "var(--surface-solid)",
        line: "var(--border)",
        "line-strong": "var(--border-strong)",
        ink: "var(--text)",
        "ink-muted": "var(--text-muted)",
        "ink-faint": "var(--text-faint)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-contrast": "var(--accent-contrast)",
        status: {
          running: "var(--status-running)",
          error: "var(--status-error)",
          starting: "var(--status-starting)",
          stopped: "var(--status-stopped)",
        },
        // Compatibility shim. Screens written against the old Discord-coloured
        // palette keep working and pick up the C64 themes for free, so pages can
        // move to the glass components one at a time instead of in a flag day.
        // New code should use the semantic names above.
        discord: {
          bg: "var(--bg-base)",
          card: "var(--surface)",
          accent: "var(--accent)",
          green: "var(--status-running)",
          red: "var(--status-error)",
          text: "var(--text)",
          muted: "var(--text-muted)",
          input: "var(--surface-strong)",
          border: "var(--border)",
        },
      },
      borderRadius: {
        glass: "var(--radius)",
        "glass-lg": "var(--radius-lg)",
        "glass-sm": "var(--radius-sm)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      fontFamily: {
        display: [
          "ui-monospace",
          "SFMono-Regular",
          "Cascadia Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
