<script setup lang="ts">
import { computed } from "vue"
import { RouterView } from "vue-router"
import { navigation } from "./router.js"

/**
 * Le menu est dérivé des routes, pas écrit en double : ajouter une slice sous
 * `features/` et son entrée dans `router.ts` la fait apparaître ici.
 *
 * Le plugin détecte `vue-router` et rend chaque `to` en `RouterLink`, état actif
 * compris — ce que faisaient les sélecteurs `.router-link-active` à la main.
 */
const items = computed(() =>
  navigation.map((route) => ({ label: String(route.meta?.title ?? route.name), to: route.path }))
)
</script>

<template>
  <!-- `UApp` porte le contexte des Toast, Tooltip et overlays programmatiques. -->
  <UApp>
    <!-- `toggle: false` : deux liens tiennent dans l'en-tête à toutes les
         largeurs, le menu burger n'aurait rien à ouvrir. -->
    <UHeader title="effect_lab" :toggle="false">
      <template #right>
        <UNavigationMenu :items="items" />
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <UContainer class="py-8">
        <RouterView />
      </UContainer>
    </UMain>
  </UApp>
</template>
