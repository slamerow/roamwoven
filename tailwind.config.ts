import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#201c16",
        paper: "#f4efe4",
        canvas: "#fffaf0",
        flax: "#d8c7a8",
        moss: "#596449",
        clay: "#9b5f43",
        tide: "#2f6870",
        brass: "#a87f3f"
      }
    }
  },
  plugins: []
};

export default config;
