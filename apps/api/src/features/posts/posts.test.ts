/**
 * In-memory tests for the posts API — no socket, no vitest.
 *
 * `HttpApiTest.groups` wires a typed client straight to the handlers, using the
 * same request encoding, routing and response decoding as a real server.
 *
 * Run with `pnpm --filter @effect_lab/api test`.
 */
import assert from "node:assert/strict"
import { Cause, Effect, Exit, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { Api } from "@effect_lab/shared"
import { PostsHandlersNoDeps } from "./handlers.js"
import { PostsRepo } from "./repo.js"

const TestLayer = Layer.mergeAll(PostsHandlersNoDeps.pipe(Layer.provide(PostsRepo.layer)), HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["posts"])

type Client = Effect.Success<typeof makeClient>
type Test = (client: Client) => Effect.Effect<void, unknown>

// biome-ignore format: la table se lit comme de la prose, un tuple ["ce que ça prouve", () => { … }] par entrée. Le formatteur éclate chaque tuple sur cinq lignes et noie l'énoncé ; aucune option ne garde la forme compacte.
const tests: Array<[string, Test]> = [
  ["GET /posts returns the seeded posts", (client) =>
    Effect.gen(function*() {
      const posts = yield* client.posts.posts()
      assert.equal(posts.length, 3)
      assert.equal(posts[0].title, "Effect, une intro")
    })],

  ["a PATCH is actually persisted — re-reading shows the new value", (client) =>
    Effect.gen(function*() {
      const patched = yield* client.posts.updatePost({
        params: { id: 1 },
        payload: { title: "PATCHED" }
      })
      assert.equal(patched.title, "PATCHED", "the response should carry the patch")

      // The regression that mattered: the old handler returned the patched post
      // but never wrote it back, so this second read returned the old title.
      const reread = yield* client.posts.post({ params: { id: 1 } })
      assert.equal(reread.title, "PATCHED", "the patch must survive a re-read")
    })],

  ["a PATCH touches only the fields it carries, and only the target post", (client) =>
    Effect.gen(function*() {
      yield* client.posts.updatePost({
        params: { id: 1 },
        payload: { author: { name: "Someone Else" } }
      })

      const target = yield* client.posts.post({ params: { id: 1 } })
      assert.equal(target.author.name, "Someone Else")
      assert.equal(target.title, "Effect, une intro", "title was not patched")
      assert.equal(target.author.email, "hugo@example.com", "email was not patched")

      const other = yield* client.posts.post({ params: { id: 2 } })
      assert.equal(other.author.name, "Hugo", "post 2 must be untouched")
    })],

  ["an unknown id fails with NotFound", (client) =>
    Effect.gen(function*() {
      const error = yield* client.posts.post({ params: { id: 404 } }).pipe(Effect.flip)
      assert.equal(error._tag, "NotFound")

      const patchError = yield* client.posts.updatePost({
        params: { id: 404 },
        payload: { title: "nope" }
      }).pipe(Effect.flip)
      assert.equal(patchError._tag, "NotFound")
    })],

  ["retag rewrites the tag on every post that has it, and no other", (client) =>
    Effect.gen(function*() {
      const after = yield* client.posts.retag({ payload: { from: "effect", to: "effect-4" } })

      assert.deepEqual(after.map((p) => p.tags), [
        ["effect-4", "typescript"],
        ["effect-4", "http"],
        ["optics"]
      ])

      // and it persisted
      const reread = yield* client.posts.posts()
      assert.deepEqual(reread[0].tags, ["effect-4", "typescript"])
    })],

  ["patching tags replaces the whole array", (client) =>
    Effect.gen(function*() {
      const patched = yield* client.posts.updatePost({
        params: { id: 3 },
        payload: { tags: ["only-this"] }
      })
      assert.deepEqual(patched.tags, ["only-this"])
    })],

  ["publishing a draft adds publishedAt, unpublishing drops the key", (client) =>
    Effect.gen(function*() {
      const before = yield* client.posts.post({ params: { id: 3 } })
      assert.equal(before.meta.visibility, "draft")
      assert.equal("publishedAt" in before.meta, false)

      const published = yield* client.posts.updatePost({
        params: { id: 3 },
        payload: { visibility: "public" }
      })
      assert.equal(published.meta.visibility, "public")
      assert.equal(typeof published.meta.publishedAt, "string", "a public post carries a date")

      const drafted = yield* client.posts.updatePost({
        params: { id: 1 },
        payload: { visibility: "draft" }
      })
      assert.equal("publishedAt" in drafted.meta, false, "the key is removed, not blanked")
    })]
]

// Each test gets a freshly built layer, so the Ref never leaks between them.
const runOne = (name: string, test: Test) =>
  Effect.gen(function* () {
    const client = yield* makeClient
    yield* test(client)
  }).pipe(
    Effect.scoped,
    Effect.provide(TestLayer),
    // `exit` rather than `match`: a failed assertion throws, which lands in the
    // cause as a defect and would otherwise abort the whole run.
    Effect.exit,
    Effect.map((exit) => {
      if (Exit.isSuccess(exit)) {
        console.log(`  ok  ${name}`)
        return true
      }
      console.error(`FAIL  ${name}`)
      for (const line of Cause.pretty(exit.cause).split("\n").slice(0, 3)) {
        console.error(`      ${line}`)
      }
      return false
    })
  )

const main = Effect.gen(function* () {
  const results: Array<boolean> = []
  for (const [name, test] of tests) {
    results.push(yield* runOne(name, test))
  }
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  if (passed !== results.length) {
    return yield* Effect.fail(new Error(`${results.length - passed} test(s) failed`))
  }
})

Effect.runPromise(main).catch((error) => {
  console.error(String(error?.message ?? error))
  process.exit(1)
})
