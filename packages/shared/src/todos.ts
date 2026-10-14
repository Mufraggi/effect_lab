/**
 * The collaborative todo-list on EventLog: the events, the projection each
 * client displays, and the handlers that keep it up to date.
 *
 * Two kinds of conflict, two mechanisms:
 *
 *   - same tag, same primary key (rename vs rename): EventLog reports it in
 *     `conflicts` when it replays a remote entry. An entry there is a *newer*
 *     one already in the journal, so ignoring the incoming entry is
 *     last-write-wins on the writer's clock.
 *   - different tags (toggle vs delete): never reported in `conflicts`. The
 *     projection settles it with a tombstone, which only works because
 *     `TodoToggled` carries the target value rather than a flip.
 *
 * `conflicts` is always empty on a local write: it only fills on replay.
 */
import { Context, Effect, Layer, Redacted, Schema, SubscriptionRef } from "effect"
import { type Event, EventGroup, EventJournal, EventLog } from "effect/eventlog"

const TodoTitle = Schema.Struct({ id: Schema.String, title: Schema.String })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String }) })

export const TodoSchema = EventLog.schema(TodoEvents)

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

/**
 * An `EventLog.Identity` is not an asymmetric key pair: it is a public id plus
 * a 32-byte secret, from which the signing key is derived. Real clients would
 * generate one with `EventLog.makeIdentity`; for the demo they are fixed, so
 * the server can allow exactly these two public keys.
 */
const identity = (publicKey: string, seed: number): EventLog.Identity["Service"] => ({
  publicKey,
  privateKey: Redacted.make(new Uint8Array(32).fill(seed))
})

export const Alice = identity("alice", 1)
export const Bob = identity("bob", 2)

// ---------------------------------------------------------------------------
// Projection
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

export const emptyTodoState: TodoStateShape = { todos: new Map(), deleted: new Set() }

const updateTodo = (s: TodoStateShape, id: string, f: (t: Todo) => Todo): TodoStateShape => {
  const todo = s.todos.get(id)
  if (todo === undefined || s.deleted.has(id)) return s
  return { ...s, todos: new Map(s.todos).set(id, f(todo)) }
}

/** The fold. Same-tag conflicts are filtered before it, by the handlers. */
export const applyTodoEvent = (s: TodoStateShape, event: TodoEvent): TodoStateShape => {
  const { payload } = event
  switch (event._tag) {
    case "TodoAdded":
      return s.deleted.has(payload.id) || s.todos.has(payload.id)
        ? s
        : { ...s, todos: new Map(s.todos).set(payload.id, { id: payload.id, title: event.payload.title, done: false }) }
    case "TodoRenamed":
      return updateTodo(s, payload.id, (t) => ({ ...t, title: event.payload.title }))
    case "TodoToggled":
      return updateTodo(s, payload.id, (t) => ({ ...t, done: event.payload.done }))
    case "TodoDeleted": {
      const todos = new Map(s.todos)
      todos.delete(payload.id)
      return { todos, deleted: new Set(s.deleted).add(payload.id) }
    }
  }
}

const decodeEntry = (entry: EventJournal.Entry) => {
  const event = TodoEvents.events[entry.event]
  if (event === undefined) return Effect.succeed(undefined)
  return Schema.decodeUnknownEffect(event.payloadSchemaBinary)(entry.payload).pipe(
    Effect.map((payload) => ({ _tag: entry.event, payload }) as TodoEvent)
  )
}

/**
 * Nothing replays the local journal into the handlers on startup, so after a
 * page reload the projection would be empty. It is rebuilt here instead, by
 * folding the journal in entry-id order — the writers' clock order, which is
 * also what the `conflicts` rule decides by, so the result is the same.
 */
export const replayJournal = Effect.gen(function*() {
  const journal = yield* EventJournal.EventJournal
  const entries = [...(yield* journal.entries)].sort(EventJournal.Entry.Order)
  let state = emptyTodoState
  for (const entry of entries) {
    const event = yield* decodeEntry(entry)
    if (event !== undefined) state = applyTodoEvent(state, event)
  }
  return state
})

export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()(
  "effect_lab/todos/TodoState"
) {}

/** Starts from the local journal: empty in memory, persisted with IndexedDB. */
export const TodoStateLive = Layer.effect(TodoState, Effect.flatMap(replayJournal, SubscriptionRef.make))

/** What this client decided to drop on replay, and why. */
export class ConflictLog extends Context.Service<ConflictLog, SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>>()(
  "effect_lab/todos/ConflictLog"
) {}

export const ConflictLogLive = Layer.effect(ConflictLog, SubscriptionRef.make<ReadonlyArray<string>>([]))

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const record = (line: string) => ConflictLog.use((log) => SubscriptionRef.update(log, (lines) => [...lines, line]))

const apply = (event: TodoEvent) => TodoState.use((ref) => SubscriptionRef.update(ref, (s) => applyTodoEvent(s, event)))

const isDeleted = (id: string) => TodoState.use((ref) => Effect.map(SubscriptionRef.get(ref), (s) => s.deleted.has(id)))

export const TodoHandlersClient = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) => apply({ _tag: "TodoAdded", payload }))
    .handle("TodoRenamed", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          const newer = conflicts.map((c) => `"${c.payload.title}"`).join(", ")
          return yield* record(`TodoRenamed(${payload.id}) "${payload.title}" ignoré : plus ancien que ${newer}`)
        }
        yield* apply({ _tag: "TodoRenamed", payload })
      }))
    .handle("TodoToggled", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : bascule plus récente`)
        }
        if (yield* isDeleted(payload.id)) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : la todo est supprimée`)
        }
        yield* apply({ _tag: "TodoToggled", payload })
      }))
    .handle("TodoDeleted", ({ payload }) => apply({ _tag: "TodoDeleted", payload }))
)

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
