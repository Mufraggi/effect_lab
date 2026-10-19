class Address {
  constructor(
    readonly city: string,
    readonly zip: string
  ) {}
  withCity(city: string) {
    return new Address(city, this.zip)
  }
}

class User {
  constructor(
    readonly name: string,
    readonly address: Address
  ) {}
  withAddress(address: Address) {
    return new User(this.name, address)
  }
}

const user = new User("Hugo", new Address("Paris", "75001"))
const moved = user.withAddress(user.address.withCity("Nice"))

console.log(user.address.city)
console.log(moved.address.city)
