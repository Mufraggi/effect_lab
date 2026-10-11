import { HttpRouter } from "effect/http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./handlers.js"

HttpRouter.serve(ApiLive).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  Layer.launch,
  NodeRuntime.runMain
)
