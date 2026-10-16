import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"
import { Api } from "@effect_lab/shared"

export class ListsHttp extends AtomHttpApi.Service<ListsHttp>()("app/ListsHttp", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}

/** Per key: a mutation invalidates only the lists of the identity that made it. */
export const listsKey = (publicKey: string) => ["lists", publicKey] as const

/** The lists `publicKey` belongs to. */
export const listsQuery = (publicKey: string) =>
  ListsHttp.query("lists", "lists", { query: { publicKey }, reactivityKeys: listsKey(publicKey) })

export const createList = ListsHttp.mutation("lists", "createList")
export const joinList = ListsHttp.mutation("lists", "joinList")
