import { HttpApiBuilder } from "effect/http-api"
import { Effect, Layer } from "effect"
import { Api } from "@effect_lab/shared"
import { PostsRepo } from "./repo.js"

/**
 * Handlers are thin: every write goes through the repo, so there is no state
 * and no domain logic here. Kept separate from the server so tests can mount
 * them in memory without opening a socket.
 *
 * The repo is yielded once, in the group builder — not inside each handler.
 * Yielding it per handler would turn it into a per-request requirement
 * (`Request<"Requires", PostsRepo>`), which a plain service layer cannot
 * satisfy.
 */
export const PostsHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "posts",
  Effect.fn(function* (handlers) {
    const repo = yield* PostsRepo

    return handlers.handleAll({
      posts: () => repo.all,
      post: ({ params }) => repo.byId(params.id),
      updatePost: ({ params, payload }) => repo.patch(params.id, payload),
      retag: ({ payload }) => repo.retag(payload.from, payload.to)
    })
  })
)

/** The handlers with their store provided. Swap the layer in tests. */
export const PostsHandlers = PostsHandlersNoDeps.pipe(Layer.provide(PostsRepo.layer))
