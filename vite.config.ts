import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative assets work for both user sites and project sites on GitHub Pages.
  base: "./",
  plugins: [react()],
});
