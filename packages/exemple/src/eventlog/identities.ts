/**
 * The two users. An `EventLog.Identity` is not an asymmetric key pair: it is a
 * public id plus a 32-byte secret, from which the signing key is derived.
 *
 * Real clients would generate one with `EventLog.makeIdentity` and keep it with
 * `EventLog.encodeIdentityString`. For the prototype they are fixed, so the
 * server can allow exactly these two public keys.
 */
import { Redacted } from "effect"
import type { EventLog } from "effect/eventlog"

const identity = (publicKey: string, seed: number): EventLog.Identity["Service"] => ({
  publicKey,
  privateKey: Redacted.make(new Uint8Array(32).fill(seed))
})

export const Alice = identity("alice", 1)
export const Bob = identity("bob", 2)

export const PORT = 3100
