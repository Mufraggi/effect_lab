/**
 * The sync server: an unencrypted EventLog server over WebSocket, in memory.
 *
 * Alice and Bob share the todo-list because the `StoreMapping` ignores the
 * public key: a store id names one list, whoever asks for it. (The provided
 * `layerStoreMappingStatic` does the same, but for a single store id; this one
 * accepts any, so each scenario run gets a fresh list on a long-lived server.)
 * Authorization is ours to write: no layer is provided.
 *
 * Run with `pnpm --filter @effect_lab/exemple eventlog:server`.
 */
import { NodeRuntime, NodeSocketServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { EventLogServerUnencrypted as Server } from "effect/eventlog"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Alice, Bob, TodoHandlersServer, TodoSchema } from "@effect_lab/shared"
import { PORT } from "./port.js"

const allowed = new Set([Alice.publicKey, Bob.publicKey])

const check = ({ publicKey }: { readonly publicKey: string }) =>
  allowed.has(publicKey)
    ? Effect.void
    : Effect.fail(new Server.EventLogServerAuthError({ reason: "Forbidden", publicKey }))

const AuthorizationLive = Layer.succeed(Server.EventLogServerAuthorization, {
  authorizeIdentity: check,
  authorizeRead: check,
  authorizeWrite: check
})

const SharedStoresLive = Layer.succeed(Server.StoreMapping, {
  resolve: ({ storeId }) => Effect.succeed(storeId),
  hasStore: () => Effect.succeed(true)
})

const ServerLive = Server.layer(TodoSchema, TodoHandlersServer).pipe(
  Layer.provide([
    Server.layerStorageMemory,
    SharedStoresLive,
    AuthorizationLive
  ]),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide([NodeSocketServer.layerWebSocket({ port: PORT }), RpcSerialization.layerSchemaBinary()])
)

Effect.log(`EventLog server on ws://localhost:${PORT}`).pipe(
  Effect.andThen(Layer.launch(ServerLive)),
  NodeRuntime.runMain
)
