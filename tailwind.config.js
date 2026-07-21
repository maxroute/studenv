/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        border: "var(--border)",
        amber: "var(--amber)",
        text: "var(--text)",
        muted: "var(--muted)",
      },
      fontFamily: {
        body: ["var(--font-dm-sans)"],
        mono: ["var(--font-dm-mono)"],
        display: ["var(--font-fraunces)"],
      },
    },
  },
  plugins: [],
};
