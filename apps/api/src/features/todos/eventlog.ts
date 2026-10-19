/**
 * The sync server: an unencrypted EventLog server, mounted on the API's HTTP
 * router as a WebSocket route at `/eventlog`.
 *
 * The journal lives in SQL: the storage creates its own tables on startup and
 * keeps the server's remote id, so clients recognise the same server after a
 * restart. It still pushes new entries to subscribers from memory, so only one
 * API instance may run. The `SqlClient` is left to the caller to provide.
 *
 * One store per todo-list: a store exists once `TodoLists` has created the
 * list, and only its members may read or write it. The `TodoLists` service is
 * left to the caller too, since the HTTP API shares it.
 */
import { Clock, Effect, Layer, Result } from "effect"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import { type EventJournal, EventLog, EventLogServerUnencrypted as Server, SqlEventLogServerUnencrypted } from "effect/eventlog"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { decodeTodoEntry, entryIdStamp, MaxClockSkewMillis, stampOf, TodoEvents, TodoSchema } from "@effect_lab/shared"
import { TodoLists } from "../lists/repo.js"

/**
 * `Server.layer` requires a handler for every event. They must not fail: a
 * failing server handler rejects the whole batch, and the client retries it
 * forever. These only log what the server sees.
 */
const TodoHandlersServer = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) => Effect.log(`TodoAdded ${payload.id}`))
    .handle("TodoRenamed", ({ payload, conflicts }) =>
      Effect.log(`TodoRenamed ${payload.id} "${payload.title}" — conflits : ${conflicts.length}`))
    .handle("TodoToggled", ({ payload, conflicts }) =>
      Effect.log(`TodoToggled ${payload.id} done=${payload.done} — conflits : ${conflicts.length}`))
    .handle("TodoDeleted", ({ payload }) => Effect.log(`TodoDeleted ${payload.id}`))
)

/** A store is a todo-list: unknown ids fail as "store not found". */
const StoreMappingLive = Layer.effect(
  Server.StoreMapping,
  Effect.gen(function*() {
    const lists = yield* TodoLists
    return {
      resolve: ({ publicKey, storeId }) =>
        Effect.flatMap(lists.exists(storeId), (exists) =>
          exists
            ? Effect.succeed(storeId)
            : Effect.fail(new Server.EventLogServerStoreError({ reason: "NotFound", publicKey, storeId }))),
      hasStore: ({ storeId }) => lists.exists(storeId)
    }
  })
)

/**
 * Refuses a batch with an entry stamped too far in the server's future: its
 * `at` or its entry id. Stamps are the writer's word, and a client's hybrid
 * clock jumps past every stamp it receives, so one wrong clock would
 * otherwise drag every other client ahead with it. A payload that does not
 * decode is refused too: that is also how a stamp that is not a finite,
 * non-negative number gets refused.
 *
 * Refusing fails the whole batch, and the client retries it, later edits
 * included. Fixing the device's clock is not enough: the refused stamps are
 * in its journal, and its hybrid clock restarts from them. The batch goes
 * through once real time is within the tolerance of those stamps.
 */
const authorizeClock = ({ publicKey, storeId, entries }: {
  readonly publicKey: string
  readonly storeId: StoreId
  readonly entries: ReadonlyArray<EventJournal.Entry>
}) =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const refuse = (entry: EventJournal.Entry, reason: string) =>
      new Server.EventLogServerAuthError({
        reason: "Forbidden",
        publicKey,
        storeId,
        message: `entry ${entry.idString}: ${reason}`
      })
    for (const entry of entries) {
      const decoded = yield* Effect.result(decodeTodoEntry(entry))
      if (Result.isFailure(decoded)) return yield* refuse(entry, "payload does not decode")
      // An unknown tag has no stamp of its own: only its entry id is checked.
      const event = decoded.success
      const stamp = Math.max(entryIdStamp(entry.id), event === undefined ? 0 : stampOf(event, entry.id).at)
      if (stamp - now > MaxClockSkewMillis) return yield* refuse(entry, `stamped ${stamp - now} ms ahead`)
    }
  })

/**
 * Any identity may connect: a `publicKey` is a random id, and the server binds
 * it to its signing key on first contact, so only the holder of the secret
 * can use it afterwards. What a key may touch is decided per store.
 */
const AuthorizationLive = Layer.effect(
  Server.EventLogServerAuthorization,
  Effect.gen(function*() {
    const lists = yield* TodoLists
    const authorizeMember = ({ publicKey, storeId }: { readonly publicKey: string; readonly storeId: StoreId }) =>
      Effect.flatMap(lists.isMember({ publicKey, storeId }), (member) =>
        member
          ? Effect.void
          : Effect.fail(new Server.EventLogServerAuthError({ reason: "Forbidden", publicKey, storeId })))
    return {
      authorizeIdentity: () => Effect.void,
      authorizeRead: authorizeMember,
      authorizeWrite: (request) => Effect.andThen(authorizeMember(request), authorizeClock(request))
    }
  })
)

/**
 * JSON is not an option: the protocol carries `Uint8Array`s, so the client
 * speaks binary too.
 */
export const EventLogLive = Server.layer(TodoSchema, TodoHandlersServer).pipe(
  Layer.provide([
    SqlEventLogServerUnencrypted.layerStorage(),
    StoreMappingLive,
    AuthorizationLive
  ]),
  Layer.provide(RpcServer.layerProtocolWebsocket({ path: "/eventlog" })),
  Layer.provide(RpcSerialization.layerSchemaBinary())
)
