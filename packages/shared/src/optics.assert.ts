/**
 * Executable assertions for the optics in `optics.ts`.
 *
 * These exist because the article's central claim — "the original is never
 * mutated" — is worth asserting rather than stating in a comment. Run with
 * `pnpm --filter @effect_lab/shared test`.
 */
import { Optic } from "effect"
import {
  _draftVisibility,
  _everyTags,
  _postById,
  _publishedAt,
  _titleById,
  _title,
  applyPatch
} from "./optics.js"
import type { Post } from "./schemas.js"

// A local assert, so this package needs no Node type definitions.
const show = (u: unknown) => JSON.stringify(u)

const assert = {
  equal: (actual: unknown, expected: unknown, note?: string) => {
    if (actual !== expected) {
      throw new Error(`expected ${show(expected)}, got ${show(actual)}${note ? ` — ${note}` : ""}`)
    }
  },
  deepEqual: (actual: unknown, expected: unknown, note?: string) => {
    if (show(actual) !== show(expected)) {
      throw new Error(`expected ${show(expected)}, got ${show(actual)}${note ? ` — ${note}` : ""}`)
    }
  }
}

const posts: ReadonlyArray<Post> = [
  {
    id: 1,
    title: "A",
    body: "ba",
    author: { name: "Hugo", email: "h@x.com" },
    tags: ["effect", "ts"],
    meta: { visibility: "draft" }
  },
  {
    id: 2,
    title: "B",
    body: "bb",
    author: { name: "Ana", email: "a@x.com" },
    tags: ["optics"],
    meta: { visibility: "public", publishedAt: "2026-01-01" }
  }
]

const tests: Array<[string, () => void]> = [
  ["refine filters: an id that matches nothing focuses nothing", () => {
    assert.deepEqual(Optic.getAll(_titleById(2))(posts), ["B"])
    assert.equal(Optic.getAll(_postById(99))(posts).length, 0)
  }],

  ["a write by id touches that post and no other", () => {
    const next = _titleById(2).modifyAll(() => "B2")(posts)
    assert.deepEqual(next.map((p) => p.title), ["A", "B2"])
  }],

  ["the original is never mutated (the article's claim)", () => {
    _titleById(2).modifyAll(() => "B2")(posts)
    _title.replace("mutated?", posts[0]!)
    applyPatch(posts[0]!, { title: "mutated?", tags: ["gone"] })
    assert.deepEqual(posts.map((p) => p.title), ["A", "B"])
    assert.deepEqual(posts[0]!.tags, ["effect", "ts"])
  }],

  ["a traversal rewrites tags across every post in one expression", () => {
    const next = _everyTags.modifyAll((tags) => tags.map((t) => (t === "effect" ? "effect-4" : t)))(posts)
    assert.deepEqual(next.map((p) => p.tags), [["effect-4", "ts"], ["optics"]])
  }],

  ["a filter in the path reads only drafts, yet still writes", () => {
    assert.deepEqual(Optic.getAll(_draftVisibility)(posts), ["draft"])
    const next = _draftVisibility.modifyAll(() => "public" as const)(posts)
    assert.deepEqual(next.map((p) => p.meta.visibility), ["public", "public"])
  }],

  ["optionalKey removes the key rather than setting it to undefined", () => {
    const unpublished = _publishedAt.replace(undefined, posts[1]!)
    assert.equal("publishedAt" in unpublished.meta, false)
    assert.deepEqual(unpublished.meta, { visibility: "public" })
  }],

  ["publishing a draft adds publishedAt", () => {
    const published = applyPatch(posts[0]!, { visibility: "public" }, () => "2026-10-10")
    assert.equal(published.meta.visibility, "public")
    assert.equal(published.meta.publishedAt, "2026-10-10")
  }],

  ["unpublishing removes the publishedAt key entirely, not just its value", () => {
    const drafted = applyPatch(posts[1]!, { visibility: "draft" })
    assert.equal("publishedAt" in drafted.meta, false)
    assert.deepEqual(drafted.meta, { visibility: "draft" })
  }],

  ["republishing an already-public post keeps its original date", () => {
    const again = applyPatch(posts[1]!, { title: "unrelated" }, () => "2099-01-01")
    assert.equal(again.meta.publishedAt, "2026-01-01")
  }],

  ["the patch table applies only the fields the patch carries", () => {
    const patched = applyPatch(posts[0]!, { title: "A2", visibility: "public" })
    assert.equal(patched.title, "A2")
    assert.equal(patched.meta.visibility, "public")
    assert.equal(patched.body, "ba", "body was not in the patch, so it must be untouched")
    assert.deepEqual(patched.tags, ["effect", "ts"])
  }]
]

let failed = 0
for (const [name, run] of tests) {
  try {
    run()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(`      ${(error as Error).message.split("\n")[0]}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) {
  throw new Error(`${failed} optics assertion(s) failed`)
}
