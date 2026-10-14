<script setup lang="ts">
import { Alice, Bob } from "@effect_lab/shared"
import { makeTodoClient } from "./todoClient.js"
import TodoPanel from "./TodoPanel.vue"

// Two complete clients in one page: identity, IndexedDB journal, socket.
const alice = makeTodoClient("todos-alice", Alice)
const bob = makeTodoClient("todos-bob", Bob)
</script>

<template>
  <section class="page">
    <header>
      <h1>Todos</h1>
      <p class="lead">
        Une liste partagée par deux clients EventLog. Passez l'un hors ligne,
        modifiez des deux côtés, puis reconnectez : le renommage écrit en
        dernier gagne, et une todo supprimée le reste.
      </p>
    </header>

    <div class="panels">
      <TodoPanel name="Alice" :client="alice" />
      <TodoPanel name="Bob" :client="bob" />
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1.5rem;
}
h1 {
  margin: 0;
}
.lead {
  color: #555;
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}
.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}
</style>
