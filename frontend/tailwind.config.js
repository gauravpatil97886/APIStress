/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#FF5A1F", dark: "#E0341A", light: "#FF7A2A" },
        ink:   { DEFAULT: "#e7e9ee", muted: "#8a90a2", dim: "#5b6076" },
        bg:    { DEFAULT: "#0e0f13", panel: "#161821", card: "#1c1f2b", border: "#252836" },
        good:  "#22c55e",
        warn:  "#f59e0b",
        bad:   "#ef4444",
        cool:  "#a855f7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      animation: {
        "fade-in":   "fadeIn .25s ease-out",
        "slide-up":  "slideUp .3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "shimmer":   "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn:   { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp:  { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        pulseSoft:{ "0%,100%": { opacity: 1 }, "50%": { opacity: .6 } },
        shimmer:  { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
    },
  },
  plugins: [],
};
