/**
 * The sync server: an unencrypted EventLog server, in memory, mounted on the
 * API's HTTP router as a WebSocket route at `/eventlog`.
 *
 * Alice and Bob share the todo-list because the server accepts exactly one
 * store, `TodoStoreId`, whoever asks for it; any other store id fails with
 * "store not found". Authorization is ours to write: no layer is provided.
 */
import { Effect, Layer } from "effect"
import { EventLog, EventLogServerUnencrypted as Server } from "effect/eventlog"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Alice, Bob, TodoEvents, TodoSchema, TodoStoreId } from "@effect_lab/shared"

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

const allowed = new Set([Alice.publicKey, Bob.publicKey])

const authorizeKnownKey = ({ publicKey }: { readonly publicKey: string }) =>
  allowed.has(publicKey)
    ? Effect.void
    : Effect.fail(new Server.EventLogServerAuthError({ reason: "Forbidden", publicKey }))

const AuthorizationLive = Layer.succeed(Server.EventLogServerAuthorization, {
  authorizeIdentity: authorizeKnownKey,
  authorizeRead: authorizeKnownKey,
  authorizeWrite: authorizeKnownKey
})

/**
 * JSON is not an option: the protocol carries `Uint8Array`s, so the client
 * speaks binary too.
 */
export const EventLogLive = Server.layer(TodoSchema, TodoHandlersServer).pipe(
  Layer.provide([
    Server.layerStorageMemory,
    Server.layerStoreMappingStatic({ storeId: TodoStoreId }),
    AuthorizationLive
  ]),
  Layer.provide(RpcServer.layerProtocolWebsocket({ path: "/eventlog" })),
  Layer.provide(RpcSerialization.layerSchemaBinary())
)
