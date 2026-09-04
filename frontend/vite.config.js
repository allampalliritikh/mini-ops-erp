import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Environment-based configuration: VITE_API_URL controls which backend the
// frontend talks to (see .env.example). No hardcoded hosting assumptions.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
