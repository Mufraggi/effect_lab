<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router"
import { navigation } from "./router.js"
</script>

<template>
  <div class="shell">
    <nav>
      <span class="brand">effect_lab</span>
      <RouterLink
        v-for="route in navigation"
        :key="String(route.name)"
        :to="route.path"
      >
        {{ route.meta?.title ?? route.name }}
      </RouterLink>
    </nav>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  font-family: system-ui, sans-serif;
  max-width: 44rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: grid;
  gap: 1.5rem;
}
nav {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  border-bottom: 1px solid #e3e3e3;
  padding-bottom: 0.75rem;
}
.brand {
  font-weight: 600;
  margin-right: auto;
}
nav a {
  color: #555;
  text-decoration: none;
  font-size: 0.9rem;
}
nav a:hover {
  color: #000;
}
nav a.router-link-active {
  color: #000;
  font-weight: 600;
}
</style>
