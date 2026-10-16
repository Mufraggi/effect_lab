import { HttpApiBuilder } from "effect/http-api"
import { Effect } from "effect"
import { Api } from "@effect_lab/shared"
import { TodoLists } from "./repo.js"

/**
 * Thin, like the posts handlers. `TodoLists` is left to the caller: the
 * EventLog server needs the same instance to authorize stores.
 */
export const ListsHandlers = HttpApiBuilder.group(
  Api,
  "lists",
  Effect.fn(function*(handlers) {
    const lists = yield* TodoLists

    return handlers.handleAll({
      lists: ({ query }) => lists.listFor(query.publicKey),
      createList: ({ payload }) => lists.create(payload.name, payload.publicKey),
      joinList: ({ payload }) => lists.join(payload.inviteCode, payload.publicKey)
    })
  })
)
