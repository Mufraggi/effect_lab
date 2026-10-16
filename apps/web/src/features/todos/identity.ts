import { Effect } from "effect"
import { EventLog, EventLogEncryption } from "effect/eventlog"

/**
 * This browser's identity for one panel, generated on first use and kept in
 * `localStorage`. Nothing secret ships in the bundle any more: the secret is
 * born here, and the server binds the public key to it on first contact.
 *
 * Synchronous on purpose, so a client can be built without waiting. Clearing
 * site data loses the identity, and with it the lists it belonged to.
 */
export const loadIdentity = (slot: string): EventLog.Identity["Service"] => {
  const key = `eventlog-identity-${slot}`
  const stored = localStorage.getItem(key)
  if (stored !== null) return EventLog.decodeIdentityString(stored)
  const identity = Effect.runSync(EventLog.makeIdentity.pipe(Effect.provide(EventLogEncryption.layerSubtle)))
  localStorage.setItem(key, EventLog.encodeIdentityString(identity))
  return identity
}
