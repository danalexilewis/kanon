import { createPreset } from "fumadocs-ui/tailwind-plugin";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./node_modules/fumadocs-ui/dist/**/*.js",
    "./src/**/*.{tsx,ts,jsx,js}",
    "./app/**/*.{tsx,ts,jsx,js}",
    "./content/**/*.{md,mdx}",
  ],
  presets: [createPreset()],
};
