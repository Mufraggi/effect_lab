/**
 * Executable assertions for `HybridClock`: it follows the wall clock, never
 * steps back, and jumps past any stamp it has seen.
 *
 * Run with `pnpm --filter @effect_lab/web test`.
 */
import { Effect, Layer, Schema } from "effect"
import { EventJournal } from "effect/eventlog"
import { StampMillis } from "@effect_lab/shared"
import { HybridClock } from "./state.js"
import { assert, runTests, type Test } from "../../shared/testing.js"

const ClockLive = HybridClock.layer.pipe(Layer.provide(EventJournal.layerMemory))
const runClock = <A>(effect: Effect.Effect<A, never, HybridClock>) => Effect.runSync(Effect.provide(effect, ClockLive))

const tick = HybridClock.use((clock) => clock.tick)
const observe = (at: number) => HybridClock.use((clock) => clock.observe(StampMillis.make(at)))

const tests: ReadonlyArray<Test> = [
  ["ticks follow the wall clock and never repeat", () => {
    const [a, b] = runClock(Effect.all([tick, tick]))
    assert.ok(Math.abs(a - Date.now()) < 1_000, `first tick ${a} is not the wall clock`)
    assert.ok(b > a, `second tick ${b} is not after the first ${a}`)
  }],

  ["after seeing a stamp from a clock ahead, the next tick is later", () => {
    const ahead = Date.now() + 3_600_000
    const next = runClock(Effect.andThen(observe(ahead), tick))
    assert.ok(next > ahead, `tick ${next} is not after the observed ${ahead}`)
  }],

  ["an older stamp does not pull the clock back", () => {
    const next = runClock(Effect.andThen(observe(1), tick))
    assert.ok(next >= Date.now() - 1_000, `tick ${next} went back`)
  }],

  ["a stamp is a finite, non-negative number: NaN cannot poison a clock", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      assert.equal(Schema.is(StampMillis)(bad), false, `${bad} is accepted as a stamp`)
    }
  }]
]

runTests(tests)
