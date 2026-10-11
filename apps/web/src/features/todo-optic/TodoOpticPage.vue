<script setup lang="ts">
import { useTodos } from "./useTodos.js"

const {
  board,
  progress,
  checkAll,
  checkUrgent,
  clearAll,
  rename,
  toggleStep,
  togglePriority,
  reset
} = useTodos()
</script>

<template>
  <section class="page">
    <header>
      <h1>Todo — optics purs</h1>
      <p class="lead">
        État strictement local, aucun serveur. Chaque action est
        <code>board = &lt;un optic&gt;(board)</code> : les optics font tout le
        travail de structure, à deux niveaux de tableau imbriqué.
      </p>
    </header>

    <div class="toolbar">
      <strong>{{ progress.done }} / {{ progress.total }}</strong>
      <span class="sep">·</span>
      <!-- One traversal, every step of every todo. -->
      <button @click="checkAll()">Tout cocher</button>
      <!-- The filter lives in the path: low-priority todos cannot be touched. -->
      <button @click="checkUrgent()">Cocher les prioritaires</button>
      <button @click="clearAll()">Tout décocher</button>
      <button class="ghost" @click="reset()">Réinitialiser</button>
    </div>

    <ul class="todos">
      <li v-for="todo in board.todos" :key="todo.id" :class="todo.priority">
        <div class="head">
          <input
            :value="todo.label"
            :aria-label="`libellé du todo ${todo.id}`"
            @change="rename(todo.id, ($event.target as HTMLInputElement).value)"
          />
          <button
            class="badge"
            :class="todo.priority"
            :title="'Basculer la priorité'"
            @click="togglePriority(todo.id)"
          >
            {{ todo.priority }}
          </button>
        </div>

        <ul class="steps">
          <li v-for="step in todo.steps" :key="step.id">
            <label>
              <input
                type="checkbox"
                :checked="step.done"
                @change="toggleStep(todo.id, step.id)"
              />
              <span :class="{ done: step.done }">{{ step.label }}</span>
            </label>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1.25rem;
}
h1 {
  margin: 0;
}
.lead {
  color: #555;
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.sep {
  color: #bbb;
}
.ghost {
  margin-left: auto;
  opacity: 0.7;
}
.todos {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.todos > li {
  border: 1px solid #ddd;
  border-left: 3px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
}
.todos > li.high {
  border-left-color: #b35c00;
}
.head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.head input {
  flex: 1;
  font-size: 1rem;
}
.badge {
  font-size: 0.75rem;
  border-radius: 3px;
  border: 1px solid #ccc;
  background: #f6f6f6;
  cursor: pointer;
}
.badge.high {
  color: #b35c00;
  border-color: #b35c00;
}
.steps {
  list-style: none;
  padding: 0 0 0 0.5rem;
  margin: 0.5rem 0 0;
  display: grid;
  gap: 0.25rem;
}
.steps label {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.9rem;
}
.done {
  text-decoration: line-through;
  color: #999;
}
</style>
