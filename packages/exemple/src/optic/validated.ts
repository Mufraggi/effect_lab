/**
 * Optics that can fail to focus — the part of `Optic` that is specifically
 * *Effect*, and has no equivalent in Monocle.
 *
 * A `Lens` always finds its target. An `Optional` or a `Prism` may not: the
 * key can be absent, a `check` can reject the value, a `refine` can exclude
 * the variant. The question an article has to answer is *what you get back*
 * when that happens — and the answer is the reason `Optic` lives in Effect:
 *
 *   the failure is a `SchemaIssue.Issue`, the very same value a failed
 *   `Schema` decode produces. One formatter renders both.
 *
 * It also has a trap, demonstrated below: the pleasant-looking half of the API
 * (`get`, `replace`) swallows the failure in silence.
 *
 * Run with `pnpm --filter @effect_lab/exemple test`.
 */
import { Optic, Result, Schema, SchemaIssue } from "effect"
import { decodeResult } from "effect/SchemaParser"

type Server = { readonly host: string; readonly port: number }
type Config = { readonly server: Server; readonly flags: { readonly [k: string]: boolean } }

const config: Config = {
  server: { host: "localhost", port: 8080 },
  flags: { verbose: true }
}

// ---------------------------------------------------------------------------
// The same path, with and without a check.
// ---------------------------------------------------------------------------

/** A `Lens`: reading it always succeeds, so there is nothing to handle. */
const _port = Optic.id<Config>().key("server").key("port")

/**
 * The same path plus a constraint, which makes it an `Optional`. The type is
 * the documentation: `Lens` means "always there", `Optional` means "ask".
 */
const _validPort = _port.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))

/** `at` fails on a missing key, where `key` would have required it to exist. */
const _flag = (name: string) => Optic.id<Config>().key("flags").at(name)

/** On a traversal, the very same `check` behaves as a filter instead. */
const _openPorts = Optic.id<ReadonlyArray<number>>().forEach((port) => port.check(Schema.isGreaterThan(0)))

/** `refine` lets you word the expectation; `check` keeps the schema's own. */
const _loopback = Optic.id<Config>()
  .key("server")
  .refine((server): server is Server => server.host === "localhost", { expected: "a loopback server" })

// The formatter is not optic-specific — it formats any `SchemaIssue.Issue`.
const format = SchemaIssue.makeFormatterDefault()

const reason = (result: Result.Result<unknown, SchemaIssue.Issue>) =>
  Result.isFailure(result) ? format(result.failure) : "(succeeded)"

// ---------------------------------------------------------------------------

const show = (u: unknown) => JSON.stringify(u)
const assertEqual = (actual: unknown, expected: unknown, note: string) => {
  if (show(actual) !== show(expected)) {
    throw new Error(`${note}: expected ${show(expected)}, got ${show(actual)}`)
  }
}

// La table garde sa forme compacte : une entrée `["nom", () => {...}]` par bloc.
// prettier-ignore
const tests: Array<[string, () => void]> = [
  ["a satisfied check reads like any other optic", () => {
    assertEqual(Result.isSuccess(_validPort.getResult(config)), true, "8080 is a valid port")
    assertEqual(_validPort.getResult(config), Result.succeed(8080), "and carries the value")
  }],

  ["a rejected check is a Result failure, not a throw and not a boolean", () => {
    const out = { ...config, server: { ...config.server, port: 99999 } }
    const result = _validPort.getResult(out)
    assertEqual(Result.isFailure(result), true, "99999 is out of range")
    assertEqual(reason(result), "Expected a value between 1 and 65535", "the schema's own wording")
  }],

  // -------------------------------------------------------------------------
  // The trap: the convenient half of the API is the silent half.
  // -------------------------------------------------------------------------

  ["`replace` through a non-focusing optic returns the original, SILENTLY", () => {
    const out = { ...config, server: { ...config.server, port: 99999 } }
    // No throw, no error, no change. The write simply did not happen, and the
    // only way to notice is that the value you get back is the one you passed.
    assertEqual(_validPort.replace(443, out), out, "the write was dropped without a word")
  }],

  ["`replaceResult` is the same write, with the failure made reachable", () => {
    const out = { ...config, server: { ...config.server, port: 99999 } }
    const result = _validPort.replaceResult(443, out)
    assertEqual(Result.isFailure(result), true, "now it is observable")
    assertEqual(reason(result), "Expected a value between 1 and 65535", "and explains itself")
  }],

  ["the write goes through once the check is satisfied", () => {
    assertEqual(
      Result.isSuccess(_validPort.replaceResult(443, config)),
      true,
      "8080 passes the check, so 443 lands"
    )
    assertEqual(_validPort.replace(443, config).server.port, 443, "and the value is written")
  }],

  // -------------------------------------------------------------------------
  // Why this lives in Effect: the failure is a Schema issue.
  // -------------------------------------------------------------------------

  ["an optic failure and a decode failure are the same kind of value", () => {
    // The *same* check, used in two places: inside an optic path, and inside a
    // schema. `isPort` is an ordinary `Schema` check — nothing about it knows
    // that optics exist.
    const isPort = Schema.isBetween({ minimum: 1, maximum: 65535 })

    const fromOptic = Optic.id<Config>().key("server").key("port").check(isPort)
      .getResult({ ...config, server: { ...config.server, port: 99999 } })
    const fromDecode = decodeResult(Schema.Number.check(isPort))(99999)

    assertEqual(Result.isFailure(fromOptic), true, "the optic refused")
    assertEqual(Result.isFailure(fromDecode), true, "the schema refused")

    if (Result.isFailure(fromOptic) && Result.isFailure(fromDecode)) {
      // Both are `SchemaIssue.Issue`, so the same formatter renders both — and
      // here it even produces the same sentence. An optic failure is not a
      // bespoke error type bolted on; it is the library's existing one.
      assertEqual(SchemaIssue.isIssue(fromOptic.failure), true, "optic issue")
      assertEqual(SchemaIssue.isIssue(fromDecode.failure), true, "decode issue")
      assertEqual(
        format(fromOptic.failure),
        format(fromDecode.failure),
        "one check, one message, two completely different call sites"
      )
    }
  }],

  ["the issue carries the path, so a deep failure says WHERE", () => {
    const result = _flag("missing").getResult(config)
    assertEqual(Result.isFailure(result), true, "no such flag")
    // A `Pointer` issue wrapping a `MissingKey`, rendered with its path.
    assertEqual(reason(result).includes("Missing key"), true, "what went wrong")
    assertEqual(reason(result).includes(`["missing"]`), true, "and where")
  }],

  ["an existing key reads fine through the same optic", () => {
    assertEqual(_flag("verbose").getResult(config), Result.succeed(true), "found")
  }],

  ["`refine` can word the expectation, which `check` cannot", () => {
    const remote = { ...config, server: { ...config.server, host: "example.com" } }
    assertEqual(reason(_loopback.getResult(remote)), "Expected a loopback server", "custom wording")
    // For comparison: annotating a `check` does *not* change the message — the
    // schema's own phrasing wins. Worth knowing before you try.
    const annotated = Optic.id<number>().check(
      Schema.isGreaterThan(0, { title: "a positive counter" })
    )
    assertEqual(
      reason(annotated.getResult(-1)),
      "Expected a value greater than 0",
      "the title is ignored by the default formatter"
    )
  }],

  // -------------------------------------------------------------------------
  // The duality worth putting in the article.
  // -------------------------------------------------------------------------

  ["on a single focus a check VALIDATES; on a traversal it FILTERS", () => {
    // Same combinator, two readings. Nothing is rejected here: the elements
    // that fail the check are simply not part of the traversal.
    assertEqual(Optic.getAll(_openPorts)([80, -1, 443, 0]), [80, 443], "only the positive ones")
    assertEqual(
      _openPorts.modifyAll((port) => port + 1)([80, -1, 443, 0]),
      [81, -1, 444, 0],
      "and a write cannot touch what the check excluded"
    )
  }],

  ["the original is never mutated, failure or not", () => {
    _validPort.replace(443, config)
    _validPort.replaceResult(443, config)
    _flag("verbose").replace(false, config)
    assertEqual(config.server.port, 8080, "untouched")
    assertEqual(config.flags, { verbose: true }, "untouched")
  }]
]

let failed = 0
for (const [name, run] of tests) {
  try {
    run()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(`      ${(error as Error).message}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) {
  throw new Error(`${failed} assertion(s) failed`)
}
