import { Effect, Layer, Match } from "effect"
import { EventJournal, EventLog, EventLogRemote } from "effect/eventlog"
import { Atom } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import { stampEvent, type TodoEvent, TodoSchema } from "@effect_lab/shared"
import { TodoHandlersClient } from "./handlers.js"
import { ConflictLog, HybridClock, TodoState } from "./state.js"

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

/** Who the client is, which list it syncs, and where it keeps its journal. */
export interface TodoUser {
  /**
   * The IndexedDB database holding this list's journal. One per list: journal
   * entries do not record their store, so two lists must not share one.
   */
  readonly database: string
  readonly identity: EventLog.Identity["Service"]
  readonly storeId: StoreId
}

const ClientLive = ({ database, identity, storeId }: TodoUser) =>
  EventLog.layer(TodoSchema, TodoHandlersClient).pipe(
    Layer.provideMerge([TodoState.layer, ConflictLog.layer, HybridClock.layer]),
    Layer.provide([
      // Its own IndexedDB database: the events survive a page reload.
      EventJournal.layerIndexedDb({ database }),
      Layer.succeed(EventLog.Identity, identity),
      Layer.succeed(EventLog.CurrentStoreId, storeId)
    ])
  )

export type Connection = "online" | "offline"

/**
 * One user's client for one list, as atoms.
 *
 * Each user gets its own runtime factory, hence its own `MemoMap`. With the
 * shared `Atom.runtime`, the module-level layers inside `EventLog.layer` (the
 * registry, the log itself) would be built once and shared by Alice and Bob —
 * one client wearing two identities.
 */
export const makeTodoClient = (user: TodoUser) => {
  const runtime = Atom.context({ memoMap: Layer.makeMemoMapUnsafe() })(ClientLive(user))

  /** What the "hors ligne" button flips. */
  const online = Atom.make(true).pipe(Atom.keepAlive)

  /**
   * EventLog has no online/offline switch. Being online is having the remote
   * layer alive: this atom builds it in its own scope. When `online` flips,
   * the atom re-runs and the previous scope closes — socket and all.
   */
  const connection = runtime.atom((get) =>
    get(online) ? Layer.build(RemoteLive).pipe(Effect.as<Connection>("online")) : Effect.succeed<Connection>("offline")
  )

  const todos = runtime.subscriptionRef(TodoState.use(Effect.succeed))
  const conflicts = runtime.subscriptionRef(ConflictLog.use(Effect.succeed))

  /** Every edit is stamped here, on the hybrid clock: callers never pass `at`. */
  const write = runtime.fn(
    Effect.fnUntraced(function* (event: TodoEvent) {
      const client = yield* EventLog.makeClient(TodoSchema)
      const at = yield* HybridClock.use((clock) => clock.tick)
      return yield* Match.valueTags(stampEvent(event, at), {
        TodoAdded: ({ payload }) => client("TodoAdded", payload),
        TodoRenamed: ({ payload }) => client("TodoRenamed", payload),
        TodoToggled: ({ payload }) => client("TodoToggled", payload),
        TodoDeleted: ({ payload }) => client("TodoDeleted", payload)
      })
    })
  )

  return { online, connection, todos, conflicts, write }
}

export type TodoClient = ReturnType<typeof makeTodoClient>
