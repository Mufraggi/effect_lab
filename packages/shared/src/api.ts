import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Schema } from "effect"
import { Post, PostPatch, Retag } from "./schemas.js"

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

/**
 * The status-annotated schema, declared once and shared by every endpoint that
 * can 404. (It cannot be baked into the class itself — piping the
 * `TaggedError` base makes it reference itself as a base type.)
 */
const NotFoundError = NotFound.pipe(HttpApiSchema.status(404))

export class PostsApi extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("posts", "/", {
      success: Schema.Array(Post)
    }),
    HttpApiEndpoint.get("post", "/:id", {
      params: {
        // Path params are coerced from their string form automatically,
        // so `Schema.Number` is correct here.
        id: Schema.Number
      },
      success: Post,
      error: NotFoundError
    }),
    HttpApiEndpoint.patch("updatePost", "/:id", {
      params: {
        id: Schema.Number
      },
      payload: PostPatch,
      success: Post,
      error: NotFoundError
    }),
    // A bulk edit: rename one tag across every post. The handler does it with
    // a single traversal, which is the point of the example.
    HttpApiEndpoint.post("retag", "/retag", {
      payload: Retag,
      success: Schema.Array(Post)
    })
  )
  .prefix("/posts")
{}

export class Api extends HttpApi.make("api").add(PostsApi) {}
