import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "surface": {
          DEFAULT: "rgb(248 250 252)",
          dark: "#18181B",
        },
        "surface-elevated": {
          DEFAULT: "rgb(255 255 255)",
          dark: "#1E1E22",
        },
        "ink": {
          DEFAULT: "rgb(15 23 42)",
          muted: "rgb(71 85 105)",
          subdued: "rgb(100 116 139)",
          dark: "rgb(245 245 244)",
          "dark-muted": "rgb(168 162 158)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
