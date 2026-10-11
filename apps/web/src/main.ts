import { createApp } from "vue"
import App from "./app/App.vue"
import { router } from "./app/router.js"

createApp(App).use(router).mount("#app")
