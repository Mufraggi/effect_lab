import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import ui from "@nuxt/ui/vite"

export default defineConfig({
  plugins: [
    vue(),
    // `ui()` embarque déjà @tailwindcss/vite, unplugin-auto-import et
    // unplugin-vue-components : ajouter `tailwindcss()` à côté ferait lever le
    // plugin sur un double enregistrement.
    ui({
      ui: { colors: { primary: "indigo", neutral: "zinc" } },
      // Les icônes utilisées sont scannées et embarquées dans le bundle. Sans
      // ça, @iconify/vue irait les chercher sur l'API Iconify au runtime — et
      // la page Todos, dont tout l'intérêt est de fonctionner hors ligne,
      // s'afficherait sans ses icônes dès la première coupure.
      icon: { clientBundle: { scan: true } }
    })
  ],
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
