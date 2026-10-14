/**
 * Two clients, Alice and Bob, against the sync server — each with its own
 * identity, its own journal and its own registry, as two browser tabs would be.
 *
 * EventLog has no online/offline switch. "Online" here is a live `Scope`
 * holding the remote layer (and its WebSocket); going offline closes that
 * scope, coming back builds the layer again. What was written in between sits
 * in the local journal and is pushed on reconnect.
 *
 * The three scenarios end on assertions: both clients must converge.
 *
 * Start the server first (`pnpm --filter @effect_lab/exemple eventlog:server`),
 * then run `pnpm --filter @effect_lab/exemple eventlog:scenario`.
 */
import { NodeRuntime, NodeSocket } from "@effect/platform-node"
import { Console, Context, Effect, Exit, Layer, Schedule, Scope, SubscriptionRef } from "effect"
import { EventJournal, EventLog, EventLogRemote } from "effect/eventlog"
import { StoreId } from "effect/eventlog/EventLogMessage"
import { RpcClient, RpcSerialization } from "effect/rpc"
import assert from "node:assert/strict"
import { Alice, Bob, ConflictLog, ConflictLogLive, type TodoStateShape, TodoHandlersClient, TodoSchema, TodoState, TodoStateLive } from "@effect_lab/shared"
import { PORT } from "./port.js"

const RemoteLive = EventLogRemote.layerUnencrypted.pipe(
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
  Layer.provide([NodeSocket.layerWebSocket(`ws://localhost:${PORT}`), RpcSerialization.layerSchemaBinary()])
)

// The server is in memory and outlives a run: a fresh store id per run keeps
// this run's todos from meeting the tombstones of the previous one.
const storeId = StoreId.make(`run-${Date.now()}`)

// In the browser: EventJournal.layerIndexedDb({ database: name }), and
// Socket.layerWebSocket(url) + Socket.layerWebSocketConstructorGlobal.
const ClientLive = (identity: EventLog.Identity["Service"]) =>
  EventLog.layer(TodoSchema, TodoHandlersClient).pipe(
    Layer.provideMerge([TodoStateLive, ConflictLogLive]),
    Layer.provide([
      EventJournal.layerMemory,
      Layer.succeed(EventLog.Identity, identity),
      Layer.succeed(EventLog.CurrentStoreId, storeId)
    ])
  )

const makeClient = Effect.fnUntraced(function*(name: string, identity: EventLog.Identity["Service"]) {
  const context = yield* Layer.build(ClientLive(identity))
  const write = yield* EventLog.makeClient(TodoSchema).pipe(Effect.provideContext(context))
  const state = Context.get(context, TodoState)
  const conflicts = Context.get(context, ConflictLog)

  // Children of the client's scope, so the end of the program closes the last
  // connection too; otherwise the open socket keeps the process alive.
  const clientScope = yield* Effect.scope
  let online: Scope.Closeable | undefined
  const goOnline = Effect.gen(function*() {
    const scope = yield* Scope.fork(clientScope)
    // The remote registers itself with the EventLog's Registry, hence `context`.
    yield* Layer.buildWithScope(RemoteLive, scope).pipe(Effect.provideContext(context))
    online = scope
    yield* Console.log(`  ${name} : en ligne`)
  })
  const goOffline = Effect.suspend(() => {
    const scope = online
    online = undefined
    return scope === undefined ? Effect.void : Scope.close(scope, Exit.void)
  }).pipe(Effect.andThen(Console.log(`  ${name} : hors ligne`)))

  return { name, write, goOnline, goOffline, state: SubscriptionRef.get(state), conflicts: SubscriptionRef.get(conflicts) }
})

type Client = Effect.Success<ReturnType<typeof makeClient>>

const show = (s: TodoStateShape) =>
  [...s.todos.values()].map((t) => `${t.id}:"${t.title}"${t.done ? " ✓" : ""}`).join(", ") || "(vide)"

/** Waits until `predicate` holds for both clients — sync is asynchronous. */
const settle = (alice: Client, bob: Client, predicate: (s: TodoStateShape) => boolean) =>
  Effect.gen(function*() {
    const a = yield* alice.state
    const b = yield* bob.state
    if (!predicate(a) || !predicate(b)) return yield* Effect.fail("pas encore")
  }).pipe(
    Effect.retry(Schedule.spaced("50 millis")),
    Effect.timeout("10 seconds"),
    Effect.andThen(Effect.all([alice.state, bob.state])),
    Effect.tap(([a, b]) => Console.log(`  Alice : ${show(a)}\n  Bob   : ${show(b)}`))
  )

// Entry ids are UUIDv7: millisecond timestamps from the writer's clock. A short
// pause keeps the "who wrote last" of each scenario unambiguous.
const tick = Effect.sleep("20 millis")

const program = Effect.gen(function*() {
  const alice = yield* makeClient("Alice", Alice)
  const bob = yield* makeClient("Bob", Bob)
  yield* alice.goOnline
  yield* bob.goOnline

  yield* Console.log("\n1. Alice (hors ligne) et Bob ajoutent chacun une todo")
  yield* alice.goOffline
  yield* alice.write("TodoAdded", { id: "t1", title: "Pain" })
  yield* bob.write("TodoAdded", { id: "t2", title: "Lait" })
  yield* alice.goOnline
  yield* settle(alice, bob, (s) => s.todos.has("t1") && s.todos.has("t2"))

  yield* Console.log("\n2. Alice (hors ligne) renomme t1, puis Bob renomme t1 — Bob écrit en dernier")
  yield* alice.goOffline
  yield* alice.write("TodoRenamed", { id: "t1", title: "Pain complet" })
  yield* tick
  yield* bob.write("TodoRenamed", { id: "t1", title: "Baguette" })
  yield* tick
  yield* alice.goOnline // Alice se reconnecte en dernier, mais son écriture est la plus ancienne
  const [a2] = yield* settle(alice, bob, (s) => s.todos.get("t1")?.title === "Baguette")
  assert.equal(a2.todos.get("t1")?.title, "Baguette")

  yield* Console.log("\n3. Alice (hors ligne) coche t2, Bob supprime t2")
  yield* alice.goOffline
  yield* alice.write("TodoToggled", { id: "t2", done: true })
  yield* tick
  yield* bob.write("TodoDeleted", { id: "t2" })
  yield* tick
  yield* alice.goOnline
  yield* settle(alice, bob, (s) => !s.todos.has("t2") && s.deleted.has("t2"))

  yield* Console.log("\nJournal des conflits")
  for (const client of [alice, bob]) {
    const lines = yield* client.conflicts
    yield* Console.log(`  ${client.name} :${lines.length === 0 ? " (rien)" : ""}`)
    for (const line of lines) yield* Console.log(`    - ${line}`)
  }

  const [a, b] = yield* Effect.all([alice.state, bob.state])
  assert.deepEqual([...a.todos.values()], [...b.todos.values()])
  yield* Console.log("\nOK : Alice et Bob ont convergé.")
})

program.pipe(Effect.scoped, NodeRuntime.runMain)
