# Cap'n Web Multi-Language Workspace

## Overview

This repository contains Cap'n Web RPC client implementations for multiple programming languages, all sharing a common wire protocol defined in `protocol.md`.

## Languages

| Language | Package Name | Registry | Directory |
|----------|-------------|----------|-----------|
| TypeScript/JavaScript | `capnweb` | npm | `src/` |
| Python | `capnweb` | PyPI | `packages/python/` |
| Rust | `capnweb` | crates.io | `packages/rust/` |
| Go | `capnweb` | go modules | `packages/go/` |
| C#/.NET | `CapnWeb` | NuGet | `packages/dotnet/` |
| Java | `capnweb` | Maven Central | `packages/java/` |
| Ruby | `capnweb` | RubyGems | `packages/ruby/` |
| PHP | `capnweb/capnweb` | Packagist | `packages/php/` |
| Swift | `CapnWeb` | SwiftPM | `packages/swift/` |

## Implementation Requirements

Each language implementation must support:

### Core Features

1. **RpcStub** - Dynamic proxy for remote object references
2. **RpcTarget** - Base class/trait for exportable objects
3. **Promise pipelining** - Use call results before awaiting
4. **Bidirectional RPC** - Server can call client callbacks

### Transports

1. **WebSocket** - Long-lived connections
2. **HTTP Batch** - Single request/response

### Serialization

Custom JSON encoding for:
- `undefined` → `["undefined"]`
- `Date` → `["date", timestamp]`
- `Uint8Array` → `["bytes", base64]`
- `BigInt` → `["bigint", decimal_string]`
- `Error` → `["error", type, message, stack?]`
- Arrays → `[[...elements...]]`
- Imports → `["import", id, path?, args?]`
- Exports → `["export", id]`

### Resource Management

- Reference counting for stubs
- Explicit disposal (Symbol.dispose equivalent)
- Automatic cleanup on session end

## Protocol Messages

```
["push", expression]           # Initiate call
["pull", import_id]            # Request result
["resolve", export_id, expr]   # Return result
["reject", export_id, expr]    # Return error
["release", import_id, refcount] # Release reference
["abort", expression]          # Terminate session
```

## Testing

Each implementation should have tests for:
1. Basic RPC calls
2. Promise pipelining
3. Bidirectional calls
4. Error handling
5. Resource disposal
6. Reconnection (WebSocket)

## Interoperability

All implementations must be wire-compatible with the TypeScript reference implementation and each other.
