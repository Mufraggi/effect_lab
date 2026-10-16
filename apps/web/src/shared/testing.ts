/**
 * The tiny harness behind the `*.assert.ts` files: a local assert, so this app
 * needs no Node type definitions, and a runner that prints one line per test
 * and throws if any failed.
 */
const show = (u: unknown) => JSON.stringify(u)

const fail = (expected: unknown, actual: unknown, note?: string): never => {
  throw new Error(`expected ${show(expected)}, got ${show(actual)}${note ? ` — ${note}` : ""}`)
}

export const assert = {
  equal: (actual: unknown, expected: unknown, note?: string) => {
    if (actual !== expected) fail(expected, actual, note)
  },
  deepEqual: (actual: unknown, expected: unknown, note?: string) => {
    if (show(actual) !== show(expected)) fail(expected, actual, note)
  },
  ok: (condition: boolean, note: string) => {
    if (!condition) throw new Error(note)
  }
}

export type Test = readonly [name: string, run: () => void]

export const runTests = (tests: ReadonlyArray<Test>) => {
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
  if (failed > 0) throw new Error(`${failed} test(s) failed`)
}
