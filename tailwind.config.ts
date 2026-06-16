import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#20211f",
        paper: "#faf8f2",
        moss: "#526247",
        clay: "#a05b43",
        tide: "#3d7280"
      }
    }
  },
  plugins: []
};

export default config;

