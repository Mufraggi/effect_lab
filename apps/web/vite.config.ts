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
      // The EventLog sync server (packages/exemple), over WebSocket.
      "/eventlog": {
        target: "ws://localhost:3100",
        ws: true
      }
    }
  }
})
