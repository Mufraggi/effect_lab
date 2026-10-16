import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      // The EventLog sync server (apps/api), over WebSocket. No rewrite: the route is `/eventlog`.
      "/eventlog": {
        target: "ws://localhost:3001",
        ws: true
      }
    }
  }
})
