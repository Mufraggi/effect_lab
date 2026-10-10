import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Schema } from "effect"
import { Post, PostPatch } from "./schemas.js"

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

export class PostsApi extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("posts", "/", {
      success: Schema.Array(Post)
    })
  )
  .add(
    HttpApiEndpoint.get("post", "/:id", {
      params: {
        id: Schema.Number
      },
      success: Post,
      error: NotFound.pipe(HttpApiSchema.status(404))
    })
  )
  .add(
    HttpApiEndpoint.patch("updatePost", "/:id", {
      params: {
        id: Schema.Number
      },
      payload: PostPatch,
      success: Post,
      error: NotFound.pipe(HttpApiSchema.status(404))
    })
  )
  .prefix("/posts")
{}

export class Api extends HttpApi.make("api").add(PostsApi) {}
