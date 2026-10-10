import { Optic } from "effect"

type Address = { readonly city: string; readonly zip: string }
type User = { readonly name: string; readonly address: Address }

const user: User = { name: "Hugo", address: { city: "Paris", zip: "75001" } }

// Describe the path once
const _city = Optic.id<User>().key("address").key("city")

const moved = _city.replace("Nice", user)

console.log(user.address.city ) // "Paris" (the original is intact)
console.log(moved.address.city) // "Nice"