import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Schema } from "effect"
import { Post, PostPatch, Retag } from "./schemas.js"
import { CreatedTodoList, TodoList } from "./todos/lists.js"

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

/**
 * Todo-lists and who belongs to them. The caller names its own `publicKey`
 * and nothing proves it here, so no endpoint may reveal what grants access:
 * listing a key's lists gives names, never invite codes. Creating or joining
 * only ever adds that key, and writing to a store still takes the key's
 * secret, which the sync server checks.
 */
export class ListsApi extends HttpApiGroup.make("lists")
  .add(
    HttpApiEndpoint.get("lists", "/", {
      query: { publicKey: Schema.String },
      success: Schema.Array(TodoList)
    }),
    HttpApiEndpoint.post("createList", "/", {
      payload: Schema.Struct({ name: Schema.String, publicKey: Schema.String }),
      success: CreatedTodoList
    }),
    HttpApiEndpoint.post("joinList", "/join", {
      payload: Schema.Struct({ inviteCode: Schema.String, publicKey: Schema.String }),
      success: TodoList,
      error: NotFoundError
    })
  )
  .prefix("/lists")
{}

export class Api extends HttpApi.make("api").add(PostsApi).add(ListsApi) {}
