/**
 * Executable assertions for `applyTodoEvent`.
 *
 * These exist because the rule they cover was wrong once: the handlers used to
 * trust EventLog's `conflicts`, which never sees two entries of the same remote
 * batch against each other. Two renames of one todo arriving together were
 * both applied in arrival order, so the older one could win — and a page
 * reload, which replays in entry-id order, then showed the other title.
 *
 * Run with `pnpm --filter @effect_lab/web test`.
 */
import { Result } from "effect"
import { EventJournal } from "effect/eventlog"
import { StampMillis, type TodoEvent, TodoId } from "@effect_lab/shared"
import { applyTodoEvent, emptyTodoState, foldTodoEvents, type Rejection, type TodoStateShape } from "./projection.js"
import { assert, runTests, type Test } from "../../shared/testing.js"

const id = TodoId.make("t1")

/** An event stamped at `msecs` on the writer's clock. */
type Stamped = readonly [TodoEvent, EventJournal.EntryId]
const at = (msecs: number, event: TodoEvent): Stamped => [event, EventJournal.makeEntryIdUnsafe({ msecs })]

const added = at(1, { _tag: "TodoAdded", payload: { id, title: "added" } })
const renamedOld = at(2, { _tag: "TodoRenamed", payload: { id, title: "old" } })
const renamedNew = at(3, { _tag: "TodoRenamed", payload: { id, title: "new" } })
const checked = at(4, { _tag: "TodoToggled", payload: { id, done: true } })
const unchecked = at(5, { _tag: "TodoToggled", payload: { id, done: false } })
const removed = at(6, { _tag: "TodoDeleted", payload: { id } })

const hour = 3_600_000
const stamp = StampMillis.make
/** Alice's device runs an hour ahead: her entry id and her stamp say so. */
const aliceAhead = at(2 + hour, { _tag: "TodoRenamed", payload: { id, title: "alice", at: stamp(2 + hour) } })
const aliceAddsAhead = at(1 + hour, { _tag: "TodoAdded", payload: { id, title: "added", at: stamp(1 + hour) } })
/**
 * Bob renames after receiving Alice's rename. His wall clock is right, so his
 * entry id is older than hers; his hybrid clock has seen her stamp, so his
 * `at` is later.
 */
const bobAfter = at(10, { _tag: "TodoRenamed", payload: { id, title: "bob", at: stamp(3 + hour) } })
const bobWithoutStamp = at(10, { _tag: "TodoRenamed", payload: { id, title: "bob" } })

/** Folds events in the order given, collecting what was rejected. */
const run = (events: ReadonlyArray<Stamped>) => {
  let state: TodoStateShape = emptyTodoState
  const rejected: Array<Rejection["_tag"]> = []
  for (const [event, entryId] of events) {
    const result = applyTodoEvent(state, event, entryId)
    if (Result.isFailure(result)) rejected.push(result.failure._tag)
    else state = result.success
  }
  return { todos: [...state.todos.values()], deleted: [...state.deleted], rejected }
}

const permutations = <A>(xs: ReadonlyArray<A>): Array<Array<A>> =>
  xs.length <= 1
    ? [[...xs]]
    : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]))

// biome-ignore format: la table se lit comme de la prose, un tuple ["ce que ça prouve", () => { … }] par entrée. Le formatteur éclate chaque tuple sur cinq lignes et noie l'énoncé ; aucune option ne garde la forme compacte.
const tests: ReadonlyArray<Test> = [
  ["rename vs rename: the newer title wins, whichever arrives first", () => {
    const inOrder = run([added, renamedOld, renamedNew])
    const reversed = run([added, renamedNew, renamedOld])
    assert.equal(inOrder.todos[0]?.title, "new")
    assert.equal(reversed.todos[0]?.title, "new", "the older rename arrives last and must not win")
    assert.deepEqual(reversed.rejected, ["Stale"], "the dropped rename is reported")
  }],

  ["toggle vs toggle: the newer value wins, whichever arrives first", () => {
    assert.equal(run([added, checked, unchecked]).todos[0]?.done, false)
    assert.equal(run([added, unchecked, checked]).todos[0]?.done, false)
  }],

  ["a rename and a toggle never cancel each other: they touch different fields", () => {
    const state = run([added, checked, renamedOld])
    assert.deepEqual(state.todos[0], { id, title: "old", done: true })
    assert.deepEqual(state.rejected, [])
  }],

  ["delete wins over a toggle or a rename, in any order, and the loser is reported", () => {
    for (const late of [checked, renamedNew]) {
      assert.deepEqual(run([added, late, removed]).todos, [])
      const after = run([added, removed, late])
      assert.deepEqual(after.todos, [])
      assert.deepEqual(after.rejected, ["Deleted"])
    }
  }],

  ["an add arriving after the delete does not bring the todo back", () => {
    const state = run([removed, added])
    assert.deepEqual(state.todos, [])
    assert.deepEqual(state.rejected, ["Deleted"])
  }],

  ["a clock ahead no longer beats an edit made after seeing it", () => {
    assert.equal(run([added, aliceAhead, bobAfter]).todos[0]?.title, "bob")
    assert.equal(run([added, bobAfter, aliceAhead]).todos[0]?.title, "bob", "whichever arrives first")
  }],

  ["without a stamp, the entry id decides, and the clock ahead wins", () => {
    // What happened before `at`, and what still happens for entries written then.
    assert.equal(run([added, aliceAhead, bobWithoutStamp]).todos[0]?.title, "alice")
  }],

  ["a journal replays in stamp order: a rename made after a fast clock's add survives a reload", () => {
    // Bob's rename has the older entry id. In entry-id order it would come
    // first, find no todo, and be dropped.
    for (const order of permutations([aliceAddsAhead, bobAfter])) {
      const state = foldTodoEvents(order.map(([event, entryId]) => ({ event, entryId })))
      assert.equal(state.todos.get(id)?.title, "bob")
    }
  }],

  ["every arrival order of the edits converges to the same todo", () => {
    const edits = [renamedOld, renamedNew, checked, unchecked]
    const expected = { id, title: "new", done: false }
    for (const order of permutations(edits)) {
      assert.deepEqual(run([added, ...order]).todos, [expected])
    }
  }]
]

runTests(tests)
