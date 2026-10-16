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
import { StampMillis, type TodoEvent, TodoEvents } from "./events.js"

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

/** The time an entry id was minted, on its writer's wall clock. */
export const entryIdStamp = (entryId: EventJournal.EntryId): StampMillis =>
  StampMillis.make(EventJournal.entryIdMillis(entryId))

/** `event` stamped at `at`. The spread loses the link between tag and payload, hence the cast. */
export const stampEvent = (event: TodoEvent, at: StampMillis): TodoEvent =>
  ({ ...event, payload: { ...event.payload, at } }) as TodoEvent

/**
 * When a write happened: its stamp, or its entry id's time for entries
 * written before stamps existed, and the entry id to break ties, so two
 * writes are never equal.
 */
export interface Stamp {
  readonly at: StampMillis
  readonly entryId: EventJournal.EntryId
}

export const stampOf = (event: TodoEvent, entryId: EventJournal.EntryId): Stamp => ({
  at: event.payload.at ?? entryIdStamp(entryId),
  entryId
})

export const compareStamps = (a: Stamp, b: Stamp): number =>
  a.at !== b.at ? a.at - b.at : EventJournal.EntryIdOrder(a.entryId, b.entryId)
