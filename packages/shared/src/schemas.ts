import { Schema } from "effect"

export const Author = Schema.Struct({
  name: Schema.String,
  email: Schema.String
})
export type Author = typeof Author.Type

export const Post = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  body: Schema.String,
  author: Author
})
export type Post = typeof Post.Type

export const PostPatch = Schema.Struct({
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  author: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String)
    })
  )
})
export type PostPatch = typeof PostPatch.Type
