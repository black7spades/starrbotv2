/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        discord: {
          bg: "var(--discord-bg)",
          card: "var(--discord-card)",
          accent: "var(--discord-accent)",
          green: "var(--discord-green)",
          red: "var(--discord-red)",
          text: "var(--discord-text)",
          muted: "var(--discord-muted)",
          input: "var(--discord-input)",
          border: "var(--discord-border)",
        },
      },
    },
  },
  plugins: [],
};
