/**
 * Time, for last-write-wins.
 *
 * An entry id is a UUIDv7 taken from the writer's `Date.now()`, so a device an
 * hour ahead used to win every conflict for an hour, even against edits made
 * after seeing its own. Two guards fix that:
 *
 *   - clients stamp edits with a hybrid logical clock: the wall clock, but
 *     never behind the latest stamp they have seen. An edit made after another
 *     always carries a later stamp, whatever the two wall clocks say.
 *   - the server refuses entries stamped too far in its future, so one wrong
 *     clock cannot drag every other client's clock forward with it.
 */
import { Effect, Schema } from "effect"
import { EventJournal } from "effect/eventlog"
import { type TodoEvent, TodoEvents } from "./events.js"

/** How far ahead of the server a stamp may be. Beyond, the write is refused. */
export const MaxClockSkewMillis = 60_000

/**
 * `TodoEvents.events` is a record keyed by string, so the link between a tag
 * and its payload type is lost on lookup. EventLog casts the same way when it
 * decodes entries for its own handlers. Unknown tags decode to `undefined`:
 * a newer client may write events this one does not know.
 */
export const decodeTodoEntry = Effect.fnUntraced(function*(entry: EventJournal.Entry) {
  const event = TodoEvents.events[entry.event]
  if (event === undefined) return undefined
  const payload = yield* Schema.decodeUnknownEffect(event.payloadSchemaBinary)(entry.payload)
  return { _tag: entry.event, payload } as TodoEvent
})

/** The stamp an event is compared on: its `at`, or its entry id's time. */
export const stampMillis = (event: TodoEvent, entryId: EventJournal.EntryId): number =>
  "at" in event.payload && event.payload.at !== undefined
    ? event.payload.at
    : EventJournal.entryIdMillis(entryId)
