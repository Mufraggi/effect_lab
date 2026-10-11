import { computed, ref } from "vue"
import {
  type Board,
  checkEverything,
  checkUrgent,
  clearEverything,
  countSteps,
  renameTodo,
  seed,
  toggleStep,
  togglePriority
} from "./todo.js"

/**
 * Purely local state — no server, no cache, no invalidation.
 *
 * Every operation is `board.value = <an optic edit>(board.value)`. The optics
 * do all the structural work, so this composable holds no update logic of its
 * own; it only decides *when* to apply one.
 */
export const useTodos = () => {
  const board = ref<Board>(seed)

  const apply = (edit: (b: Board) => Board) => {
    board.value = edit(board.value)
  }

  const progress = computed(() => countSteps(board.value))

  return {
    board,
    progress,
    checkAll: () => apply(checkEverything),
    checkUrgent: () => apply(checkUrgent),
    clearAll: () => apply(clearEverything),
    rename: (id: number, label: string) => apply(renameTodo(id, label)),
    toggleStep: (todoId: number, stepId: number) => apply(toggleStep(todoId, stepId)),
    togglePriority: (id: number) => apply(togglePriority(id)),
    reset: () => {
      board.value = seed
    }
  }
}
