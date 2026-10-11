import { Schema } from "effect"

export const Author = Schema.Struct({
  name: Schema.String,
  email: Schema.String
})
export type Author = typeof Author.Type

export const Visibility = Schema.Literals(["draft", "public"])
export type Visibility = typeof Visibility.Type

export const Meta = Schema.Struct({
  visibility: Visibility,
  // optionalKey, not optional: an unpublished post has *no* publishedAt key at
  // all. This is what makes `Optic.optionalKey` demonstrable — writing
  // `undefined` through it removes the key instead of setting it to undefined.
  publishedAt: Schema.optionalKey(Schema.String)
})
export type Meta = typeof Meta.Type

export const Post = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
  author: Author,
  tags: Schema.Array(Schema.String),
  meta: Meta
})
export type Post = typeof Post.Type

export const PostPatch = Schema.Struct({
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  author: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String)
    })
  ),
  tags: Schema.optional(Schema.Array(Schema.String)),
  visibility: Schema.optional(Visibility)
})
export type PostPatch = typeof PostPatch.Type

export const Retag = Schema.Struct({
  from: Schema.String,
  to: Schema.String
})
export type Retag = typeof Retag.Type
