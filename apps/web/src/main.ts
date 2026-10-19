// La feuille Tailwind + Nuxt UI en premier, pour que les styles du design
// system précèdent tout ce qu'un composant pourrait injecter.
import "./assets/css/main.css"
import { createApp } from "vue"
import ui from "@nuxt/ui/vue-plugin"
import App from "./app/App.vue"
import { router } from "./app/router.js"

createApp(App).use(router).use(ui).mount("#app")
