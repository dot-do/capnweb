# Cap'n Web Language Ports

This fork extends the original [cloudflare/capnweb](https://github.com/cloudflare/capnweb) with protocol-compatible implementations for additional languages.

## Available Ports

| Language | Directory | Package Manager | Package Name | Status |
|----------|-----------|-----------------|--------------|--------|
| TypeScript | `/src` | npm | `capnweb` | ✅ Official (Cloudflare) |
| Python | `/ports/python` | PyPI | `capnweb` | ✅ Ready |
| Rust | `/ports/rust` | crates.io | `capnweb` | ✅ Ready |
| Go | `/ports/go` | Go Modules | `go.capnweb.dev` | ✅ Ready |
| Swift | `/ports/swift` | SPM | `CapnWeb` | ✅ Ready |
| Java | `/ports/java` | Maven | `dev.capnweb:capnweb` | ✅ Ready |
| Kotlin | `/ports/kotlin` | Maven | `dev.capnweb:capnweb` | ✅ Ready |
| Ruby | `/ports/ruby` | RubyGems | `capnweb` | ✅ Ready |
| C# | `/ports/dotnet` | NuGet | `CapnWeb` | ✅ Ready |
| F# | `/ports/fsharp` | NuGet | `CapnWeb` | ✅ Ready |
| PHP | `/ports/php` | Packagist | `capnweb/capnweb` | ✅ Ready |
| Dart | `/ports/dart` | pub.dev | `capnweb` | ✅ Ready |
| Scala | `/ports/scala` | Maven | `dev.capnweb::capnweb` | ✅ Ready |
| Elixir | `/ports/elixir` | Hex | `capnweb` | ✅ Ready |
| Clojure | `/ports/clojure` | Clojars | `dev.capnweb/capnweb` | ✅ Ready |
| Crystal | `/ports/crystal` | Shards | `capnweb` | ✅ Ready |
| Nim | `/ports/nim` | Nimble | `capnweb` | ✅ Ready |
| Deno | `/ports/deno` | JSR | `@capnweb/capnweb` | ✅ Ready |

## Protocol Compatibility

All ports implement the same wire protocol as defined in [protocol.md](./protocol.md). This means:

- A Python client can communicate with a TypeScript server
- A Rust server can handle requests from a Go client
- Any combination of languages works seamlessly

## Installation

### TypeScript/JavaScript (Original)

```bash
npm install capnweb
```

### Python

```bash
pip install capnweb
```

### Rust

```bash
cargo add capnweb
```

### Go

```bash
go get go.capnweb.dev
```

### Swift

```swift
.package(url: "https://github.com/dot-do/capnweb.git", from: "1.0.0")
```

### Java/Kotlin

```kotlin
implementation("dev.capnweb:capnweb:1.0.0")
```

### Ruby

```bash
gem install capnweb
```

### C#/F#

```bash
dotnet add package CapnWeb
```

### PHP

```bash
composer require capnweb/capnweb
```

### Dart

```bash
dart pub add capnweb
```

### Scala

```scala
libraryDependencies += "dev.capnweb" %% "capnweb" % "1.0.0"
```

### Elixir

```elixir
{:capnweb, "~> 1.0"}
```

### Clojure

```clojure
dev.capnweb/capnweb {:mvn/version "1.0.0"}
```

### Crystal

```yaml
dependencies:
  capnweb:
    github: dot-do/capnweb
    branch: main
```

### Nim

```bash
nimble install capnweb
```

### Deno

```typescript
import { RpcSession } from "jsr:@capnweb/capnweb";
```

## Contributing

Each port should:

1. Implement the full protocol as specified in [protocol.md](./protocol.md)
2. Follow the idioms and conventions of its target language
3. Include comprehensive tests against the conformance test suite
4. Provide documentation with language-specific examples

See individual port READMEs for language-specific contribution guidelines.

## Relationship to DotDo SDKs

These capnweb implementations are the foundation for the [DotDo SDK ecosystem](https://github.com/dot-do/sdks):

```
capnweb (this repo)     → Low-level protocol implementation
    ↓
rpc.do                  → Managed RPC proxy layer
    ↓
platform.do / dotdo     → Platform features (auth, billing, metrics)
    ↓
Domain SDKs             → mongo.do, kafka.do, ai.do, etc.
```

## License

MIT - Same as upstream cloudflare/capnweb
