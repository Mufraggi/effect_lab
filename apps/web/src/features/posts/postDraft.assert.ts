/**
 * Executable assertions for `rebaseDraft`.
 *
 * These exist because the rule they cover is not obvious and was wrong once:
 * the form used to measure `dirty` against the *live* prop, which comes from
 * the optimistic cache. A write anywhere in the app moved that prop, so a field
 * nobody had touched reported itself as edited, the form showed a stale value,
 * and saving pushed it back — silently reverting the edit that moved the cache.
 *
 * Run with `pnpm --filter @effect_lab/web test`.
 */
import { _authorName, _tags, _title, _visibility, applyPatch, type Post } from "@effect_lab/shared"
import { _tagsAsText, draftPatch, patchFields, rebaseDraft, rebaseFields } from "./postDraft.js"
import { assert, runTests, type Test } from "../../shared/testing.js"

const post: Post = {
  id: 1,
  title: "A",
  body: "ba",
  author: { name: "Hugo", email: "h@x.com" },
  tags: ["effect"],
  meta: { visibility: "draft" }
}

/** The form opened on `post`, so the draft and its seed are the same value. */
const untouched = { edited: post, from: post }

// biome-ignore format: la table se lit comme de la prose, un tuple ["ce que ça prouve", () => { … }] par entrée. Le formatteur éclate chaque tuple sur cinq lignes et noie l'énoncé ; aucune option ne garde la forme compacte.
const tests: ReadonlyArray<Test> = [
  ["a field nobody touched takes the incoming value", () => {
    const next = { ...post, title: "FROM THE LIST" }
    const out = rebaseDraft(next, untouched.edited, untouched.from)
    assert.equal(out.title, "FROM THE LIST")
    // The bug, stated as an assertion: saving this draft must not revert the
    // edit that moved the server.
    assert.equal(_title.get(out), _title.get(next), "the draft agrees with the server")
  }],

  ["a field the user edited keeps the draft value", () => {
    const edited = _title.replace("MY EDIT", post)
    const out = rebaseDraft({ ...post, title: "FROM THE LIST" }, edited, post)
    assert.equal(out.title, "MY EDIT", "typing is never overwritten")
  }],

  ["the fields are independent: one edited, one not", () => {
    const edited = _title.replace("MY EDIT", post)
    const out = rebaseDraft(
      { ...post, title: "FROM THE LIST", body: "SERVER BODY" },
      edited,
      post
    )
    assert.equal(out.title, "MY EDIT")
    assert.equal(out.body, "SERVER BODY")
  }],

  ["a nested field is rebased by the same rule, and its siblings are left alone", () => {
    const edited = _authorName.replace("Ana", post)
    const out = rebaseDraft(
      { ...post, author: { name: "Server", email: "h@x.com" } },
      edited,
      post
    )
    assert.equal(out.author.name, "Ana")
    assert.equal(out.author.email, "h@x.com", "the key the optic does not address is untouched")
  }],

  ["tags compare through the Iso, not by reference", () => {
    const fromServer = { ...post, tags: ["effect", "optics"] }

    // The trivial case: the draft is still the seed.
    assert.deepEqual(
      rebaseDraft(fromServer, untouched.edited, untouched.from).tags,
      ["effect", "optics"]
    )

    // The case that actually distinguishes the two implementations: the user
    // typed in the tags box and landed back on the same text, so the draft now
    // holds a *different array with equal content*. Comparing the arrays would
    // call that edited and drop the server's tags on the floor; comparing the
    // string the Iso produces does not.
    const retyped = _tagsAsText.replace(_tagsAsText.get(post), post)
    assert.equal(_tags.get(retyped) === _tags.get(post), false, "really is a new reference")
    assert.deepEqual(_tags.get(retyped), _tags.get(post), "…with equal content")
    assert.deepEqual(
      rebaseDraft(fromServer, retyped, post).tags,
      ["effect", "optics"],
      "reference inequality must not read as dirty"
    )
  }],

  ["an edited tag list wins over the incoming one", () => {
    const edited = _tagsAsText.replace("mine, only", post)
    const out = rebaseDraft({ ...post, tags: ["effect", "optics"] }, edited, post)
    assert.deepEqual(out.tags, ["mine", "only"])
  }],

  ["every editable field is covered on both directions", () => {
    // A field present in the form but missing from `rebaseFields` would
    // silently stop being rebased — exactly how the original bug behaved — and
    // one missing from `patchFields` would silently stop being saved.
    assert.equal(rebaseFields.length, 5)
    assert.equal(patchFields.length, rebaseFields.length, "in and out must agree")
  }],

  // -------------------------------------------------------------------------
  // draftPatch — the outgoing direction.
  // -------------------------------------------------------------------------

  ["an untouched draft produces an empty patch", () => {
    assert.deepEqual(draftPatch(post, post), {}, "nothing edited, nothing to send")
  }],

  ["the patch carries the edited field and NOTHING else", () => {
    const draft = _title.replace("A2", post)
    assert.deepEqual(draftPatch(draft, post), { title: "A2" })
  }],

  ["a nested edit is reshaped into the patch's own shape", () => {
    // `PostPatch` is not a `Post`: the name sits under a partial `author`.
    const draft = _authorName.replace("Ana", post)
    assert.deepEqual(draftPatch(draft, post), { author: { name: "Ana" } })
  }],

  ["tags are compared as text but sent as an array", () => {
    const draft = _tagsAsText.replace("effect, optics", post)
    assert.deepEqual(draftPatch(draft, post), { tags: ["effect", "optics"] })

    // Re-typing the same list is not an edit, so it must not be sent.
    const retyped = _tagsAsText.replace(_tagsAsText.get(post), post)
    assert.deepEqual(draftPatch(retyped, post), {}, "equal content, new array")
  }],

  ["two edits produce one patch with two keys", () => {
    const draft = _visibility.replace("public", _title.replace("A2", post))
    assert.deepEqual(draftPatch(draft, post), { title: "A2", visibility: "public" })
  }],

  ["round trip: what the form sends, the server applies — and only that", () => {
    // `applyPatch` is the server's rule, imported from the shared package. This
    // is the whole point of the monorepo: one definition, both ends.
    const draft = _authorName.replace("Ana", post)
    const applied = applyPatch(post, draftPatch(draft, post))

    assert.equal(applied.author.name, "Ana", "the edit arrived")
    assert.equal(applied.title, post.title, "an unedited field is not overwritten")
    assert.equal(applied.body, post.body)
    assert.deepEqual(applied.tags, post.tags)
    assert.equal(applied.author.email, post.author.email, "a key nobody addresses survives")
  }],

  ["round trip: an empty patch is a no-op on the server", () => {
    const applied = applyPatch(post, draftPatch(post, post))
    assert.deepEqual(applied, post, "saving an untouched form changes nothing")
  }],

  ["nothing is mutated — not the incoming value, not the draft, not the seed", () => {
    const edited = _title.replace("MY EDIT", post)
    const next = { ...post, title: "FROM THE LIST" }
    rebaseDraft(next, edited, post)
    assert.equal(next.title, "FROM THE LIST")
    assert.equal(edited.title, "MY EDIT")
    assert.equal(post.title, "A")
    assert.deepEqual(post.tags, ["effect"])
  }],

  ["rebasing an unchanged server value is the identity", () => {
    const edited = _title.replace("MY EDIT", post)
    const out = rebaseDraft(post, edited, post)
    assert.deepEqual(out, edited, "no server movement, so the draft is returned as it stands")
  }]
]

runTests(tests)
