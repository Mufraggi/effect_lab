import { Redacted } from "effect"
import { EventLog } from "effect/eventlog"

/**
 * An `EventLog.Identity` is not an asymmetric key pair: it is a public id plus
 * a 32-byte secret, from which the signing key is derived. Real clients would
 * generate one with `EventLog.makeIdentity`; for the demo they are fixed, so
 * the server can allow exactly these two public keys.
 */
const identity = (publicKey: string, seed: number): EventLog.Identity["Service"] => ({
  publicKey,
  privateKey: Redacted.make(new Uint8Array(32).fill(seed))
})

export const Alice = identity("alice", 1)
export const Bob = identity("bob", 2)
