import { Effect, Layer } from "effect"
import { EventJournal, EventLog, EventLogRemote } from "effect/eventlog"
import { StoreId } from "effect/eventlog/EventLogMessage"
import { Atom } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { type TodoEvent, TodoSchema } from "@effect_lab/shared"
import { TodoHandlersClient } from "./handlers.js"
import { ConflictLog, ConflictLogLive, TodoState, TodoStateLive } from "./state.js"

/** Proxied by Vite to the sync server (`apps/api`, port 3001). */
const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/eventlog`

/**
 * JSON is not an option here: the protocol carries `Uint8Array`s and the
 * handshake fails with `Expected Uint8Array`. Binary on both ends.
 */
const RemoteLive = EventLogRemote.layerUnencrypted.pipe(
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
  Layer.provide([Socket.layerWebSocket(url), RpcSerialization.layerSchemaBinary()]),
  Layer.provide(Socket.layerWebSocketConstructorGlobal)
)

/** Both users write to the same store: that is what makes the list shared. */
const storeId = StoreId.make("demo")

const ClientLive = (database: string, identity: EventLog.Identity["Service"]) =>
  EventLog.layer(TodoSchema, TodoHandlersClient).pipe(
    Layer.provideMerge([TodoStateLive, ConflictLogLive]),
    Layer.provide([
      // Its own IndexedDB database: the events survive a page reload.
      EventJournal.layerIndexedDb({ database }),
      Layer.succeed(EventLog.Identity, identity),
      Layer.succeed(EventLog.CurrentStoreId, storeId)
    ])
  )

export type Connection = "online" | "offline"

/**
 * One user's client, as atoms.
 *
 * Each user gets its own runtime factory, hence its own `MemoMap`. With the
 * shared `Atom.runtime`, the module-level layers inside `EventLog.layer` (the
 * registry, the log itself) would be built once and shared by Alice and Bob —
 * one client wearing two identities.
 */
export const makeTodoClient = (database: string, identity: EventLog.Identity["Service"]) => {
  const runtime = Atom.context({ memoMap: Layer.makeMemoMapUnsafe() })(ClientLive(database, identity))

  /** What the "hors ligne" button flips. */
  const online = Atom.make(true).pipe(Atom.keepAlive)

  /**
   * EventLog has no online/offline switch. Being online is having the remote
   * layer alive: this atom builds it in its own scope. When `online` flips,
   * the atom re-runs and the previous scope closes — socket and all.
   */
  const connection = runtime.atom((get) =>
    get(online)
      ? Layer.build(RemoteLive).pipe(Effect.as<Connection>("online"))
      : Effect.succeed<Connection>("offline")
  )

  const todos = runtime.subscriptionRef(TodoState.use(Effect.succeed))
  const conflicts = runtime.subscriptionRef(ConflictLog.use(Effect.succeed))

  const write = runtime.fn((event: TodoEvent) =>
    Effect.flatMap(EventLog.makeClient(TodoSchema), (write) =>
      // The union of tags and payloads is too wide for the typed client;
      // each member of `TodoEvent` is a valid pair.
      write(event._tag, event.payload as never))
  )

  return { online, connection, todos, conflicts, write }
}

export type TodoClient = ReturnType<typeof makeTodoClient>
