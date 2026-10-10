import { Effect, Schema } from "effect"

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  field: Schema.String,
  message: Schema.String
}) {}

const DecodedPost = Schema.Struct({
  title: Schema.String,
  body: Schema.String
})

export type DecodedPost = typeof DecodedPost.Type

export const decodePost = (input: unknown): Effect.Effect<DecodedPost, ValidationError> =>
  Schema.decodeUnknownEffect(DecodedPost)(input).pipe(
    Effect.mapError(
      (error) =>
        new ValidationError({
          field: "post",
          message: String(error)
        })
    )
  )

export const program = Effect.gen(function* () {
  const post = yield* decodePost({
    title: "Mon premier exemple Effect",
    body: "Un pipeline minimal : decode + mapError."
  })
  yield* Effect.log(`Post décodé : ${post.title}`)
  return post
})
