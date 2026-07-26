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
          bg: "#1a1a2e",
          card: "#16213e",
          accent: "#5865f2",
          green: "#57f287",
          red: "#ed4245",
          text: "#dcddde",
          muted: "#72767d",
          input: "#2f3136",
          border: "#202225",
        },
      },
    },
  },
  plugins: [],
};