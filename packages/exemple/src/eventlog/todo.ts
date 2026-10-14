/**
 * The shared domain of the collaborative todo-list: the events, and the
 * handlers that fold them into the state each client displays.
 *
 * Two kinds of conflict, two mechanisms:
 *
 *   - same tag, same primary key (rename vs rename): EventLog reports it in
 *     `conflicts` when it replays a remote entry. An entry there is a *newer*
 *     one already in the journal, so ignoring the incoming entry is
 *     last-write-wins on the writer's clock.
 *   - different tags (toggle vs delete): never reported in `conflicts`. The
 *     handlers settle it themselves with a tombstone, which only works because
 *     `TodoToggled` carries the target value rather than a flip.
 *
 * `conflicts` is always empty on a local write: it only fills on replay.
 */
import { Context, Effect, Layer, Ref, Schema, SubscriptionRef } from "effect"
import { EventGroup, EventLog } from "effect/eventlog"

const TodoId = Schema.Struct({ id: Schema.String })
const TodoTitle = Schema.Struct({ id: Schema.String, title: Schema.String })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: TodoId })

export const TodoSchema = EventLog.schema(TodoEvents)

// ---------------------------------------------------------------------------
// Client-side projection
// ---------------------------------------------------------------------------

export interface Todo {
  readonly id: string
  readonly title: string
  readonly done: boolean
}

export interface TodoStateShape {
  readonly todos: ReadonlyMap<string, Todo>
  /** Tombstones: a deleted id stays deleted, whatever arrives after. */
  readonly deleted: ReadonlySet<string>
}

export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()(
  "effect_lab/eventlog/TodoState"
) {}

export const TodoStateLive = Layer.effect(
  TodoState,
  SubscriptionRef.make<TodoStateShape>({ todos: new Map(), deleted: new Set() })
)

/** What each client decided to drop, and why — the material for the article. */
export class ConflictLog extends Context.Service<ConflictLog, Ref.Ref<ReadonlyArray<string>>>()(
  "effect_lab/eventlog/ConflictLog"
) {}

export const ConflictLogLive = Layer.effect(ConflictLog, Ref.make<ReadonlyArray<string>>([]))

const record = (line: string) => ConflictLog.use((log) => Ref.update(log, (lines) => [...lines, line]))

const update = (f: (s: TodoStateShape) => TodoStateShape) =>
  TodoState.use((ref) => SubscriptionRef.update(ref, f))

/** Applies `f` to a live todo; a missing or deleted one is left alone. */
const updateTodo = (id: string, f: (t: Todo) => Todo) =>
  update((s) => {
    const todo = s.todos.get(id)
    if (todo === undefined || s.deleted.has(id)) return s
    return { ...s, todos: new Map(s.todos).set(id, f(todo)) }
  })

const isDeleted = (id: string) => TodoState.use((ref) => Effect.map(SubscriptionRef.get(ref), (s) => s.deleted.has(id)))

export const TodoHandlersClient = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) =>
      update((s) =>
        s.deleted.has(payload.id) || s.todos.has(payload.id)
          ? s
          : { ...s, todos: new Map(s.todos).set(payload.id, { ...payload, done: false }) }
      ))
    .handle("TodoRenamed", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          const newer = conflicts.map((c) => `"${c.payload.title}"`).join(", ")
          return yield* record(`TodoRenamed(${payload.id}) "${payload.title}" ignoré : plus ancien que ${newer}`)
        }
        yield* updateTodo(payload.id, (t) => ({ ...t, title: payload.title }))
      }))
    .handle("TodoToggled", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : bascule plus récente`)
        }
        if (yield* isDeleted(payload.id)) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : la todo est supprimée`)
        }
        yield* updateTodo(payload.id, (t) => ({ ...t, done: payload.done }))
      }))
    .handle("TodoDeleted", ({ payload }) =>
      update((s) => {
        const todos = new Map(s.todos)
        todos.delete(payload.id)
        return { todos, deleted: new Set(s.deleted).add(payload.id) }
      }))
)

// ---------------------------------------------------------------------------
// Server-side handlers
// ---------------------------------------------------------------------------

/**
 * `EventLogServerUnencrypted.layer` requires a handler for every event. They
 * must not fail: a failing server handler rejects the whole batch, and the
 * client retries it forever. These only log what the server sees.
 */
export const TodoHandlersServer = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) => Effect.log(`TodoAdded ${payload.id}`))
    .handle("TodoRenamed", ({ payload, conflicts }) =>
      Effect.log(`TodoRenamed ${payload.id} "${payload.title}" — conflits : ${conflicts.length}`))
    .handle("TodoToggled", ({ payload, conflicts }) =>
      Effect.log(`TodoToggled ${payload.id} done=${payload.done} — conflits : ${conflicts.length}`))
    .handle("TodoDeleted", ({ payload }) => Effect.log(`TodoDeleted ${payload.id}`))
)
