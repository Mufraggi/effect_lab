/**
 * Executable assertions for `HybridClock`: it follows the wall clock, never
 * steps back, and jumps past any stamp it has seen.
 *
 * Run with `pnpm --filter @effect_lab/web test`.
 */
import { Effect, Layer } from "effect"
import { EventJournal } from "effect/eventlog"
import { HybridClock } from "./state.js"

const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message)
}

const ClockLive = HybridClock.layer.pipe(Layer.provide(EventJournal.layerMemory))
const runClock = <A>(effect: Effect.Effect<A, never, HybridClock>) =>
  Effect.runSync(Effect.provide(effect, ClockLive))

const tests: Array<[string, () => void]> = [
  ["ticks follow the wall clock and never repeat", () => {
    const [a, b] = runClock(Effect.all([HybridClock.use((c) => c.tick), HybridClock.use((c) => c.tick)]))
    const now = Date.now()
    assert(Math.abs(a - now) < 1_000, `first tick ${a} is not the wall clock ${now}`)
    assert(b > a, `second tick ${b} is not after the first ${a}`)
  }],

  ["after seeing a stamp from a clock ahead, the next tick is later", () => {
    const ahead = Date.now() + 3_600_000
    const next = runClock(
      Effect.andThen(HybridClock.use((c) => c.observe(ahead)), HybridClock.use((c) => c.tick))
    )
    assert(next > ahead, `tick ${next} is not after the observed ${ahead}`)
  }],

  ["an older stamp does not pull the clock back", () => {
    const before = runClock(
      Effect.andThen(HybridClock.use((c) => c.observe(1)), HybridClock.use((c) => c.tick))
    )
    assert(before >= Date.now() - 1_000, `tick ${before} went back`)
  }]
]

let failed = 0
for (const [name, test] of tests) {
  try {
    test()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(`      ${(error as Error).message.split("\n")[0]}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) throw new Error(`${failed} test(s) failed`)
