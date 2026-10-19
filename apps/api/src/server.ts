import { HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"
import { Api } from "@effect_lab/shared"
import { PostsHandlers } from "./features/posts/handlers.js"
import { ListsHandlers } from "./features/lists/handlers.js"
import { TodoLists } from "./features/lists/repo.js"
import { EventLogLive } from "./features/todos/eventlog.js"
import { SqlLive } from "./db.js"

/** The HttpApi, one handler group per feature. */
const ApiLive = HttpApiBuilder.layer(Api).pipe(Layer.provide([PostsHandlers, ListsHandlers]))

/** One `TodoLists` for both: the API creates lists, the sync server checks them. */
const AppLive = Layer.mergeAll(ApiLive, EventLogLive).pipe(Layer.provide(TodoLists.layer), Layer.provide(SqlLive))

HttpRouter.serve(AppLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  Layer.launch,
  NodeRuntime.runMain
)
