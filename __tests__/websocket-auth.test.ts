// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * WebSocket Auth Tests
 *
 * Auth handling has been moved to the packages/client wrapper layer.
 * The core websocket.ts no longer has auth support - it uses the original
 * Cloudflare capnweb implementation.
 *
 * For auth tests, see: packages/client/tests/auth.test.ts
 * The createAuthenticatedClient function handles WebSocket auth by:
 * 1. Creating a WebSocket with bearer.{token} subprotocol
 * 2. Passing the opened WebSocket to newWebSocketRpcSession
 *
 * These tests verify the core behavior without auth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store captured WebSocket constructor calls
let capturedWebSocketCalls: { url: string; protocols: string | string[] | undefined }[] = []

// Mock WebSocket class for testing
class MockWebSocket {
  url: string
  protocols: string | string[] | undefined
  readyState = 0 // CONNECTING

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    capturedWebSocketCalls.push({ url, protocols })
  }

  addEventListener(_event: string, _handler: Function) {}
  removeEventListener(_event: string, _handler: Function) {}
  send(_data: string) {}
  close(_code?: number, _reason?: string) {}
}

describe('WebSocket transport (core - no auth)', () => {
  beforeEach(() => {
    capturedWebSocketCalls = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should create WebSocket without protocols when given a URL string', async () => {
    const { newWebSocketRpcSession } = await import('../src/websocket.js')

    newWebSocketRpcSession('wss://api.example.com/rpc')

    expect(capturedWebSocketCalls).toHaveLength(1)
    const call = capturedWebSocketCalls[0]
    expect(call.url).toBe('wss://api.example.com/rpc')
    // Core implementation creates WebSocket without protocols
    expect(call.protocols).toBeUndefined()
  })

  it('should accept pre-created WebSocket object directly', async () => {
    const { newWebSocketRpcSession } = await import('../src/websocket.js')

    // Pre-create WebSocket with custom protocols (like the wrapper does)
    const socket = new MockWebSocket('wss://api.example.com/rpc', ['capnp-rpc', 'bearer.test-token'])

    // Clear the captured calls from manual creation
    capturedWebSocketCalls = []

    // Pass the pre-created socket - should not create a new one
    newWebSocketRpcSession(socket as any)

    // No new WebSocket should be created when passing an object
    expect(capturedWebSocketCalls).toHaveLength(0)
  })

  it('should not have auth options in the API', async () => {
    const { newWebSocketRpcSession } = await import('../src/websocket.js')

    // Third parameter is RpcSessionOptions, not WebSocketSessionOptions with auth
    // This test verifies the signature doesn't include auth-specific options
    newWebSocketRpcSession('wss://api.example.com/rpc', undefined, {
      // RpcSessionOptions only has onSendError
      onSendError: (err) => console.error(err),
    })

    expect(capturedWebSocketCalls).toHaveLength(1)
    // Verify no protocols were added
    expect(capturedWebSocketCalls[0].protocols).toBeUndefined()
  })
})

describe('WebSocket auth via wrapper', () => {
  beforeEach(() => {
    capturedWebSocketCalls = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should handle auth in createAuthenticatedClient wrapper', async () => {
    // This tests the wrapper pattern where auth is handled externally
    const { createAuthenticatedClient } = await import('../packages/client/src/auth.js')

    createAuthenticatedClient({
      url: 'wss://api.example.com/rpc',
      token: 'wrapper-token',
    })

    expect(capturedWebSocketCalls).toHaveLength(1)
    const call = capturedWebSocketCalls[0]
    expect(call.url).toBe('wss://api.example.com/rpc')

    // Wrapper should add protocols
    expect(call.protocols).toBeDefined()
    const protocols = Array.isArray(call.protocols) ? call.protocols : [call.protocols]
    expect(protocols).toContain('capnp-rpc')
    expect(protocols).toContain('bearer.wrapper-token')
  })

  it('should support dynamic token in wrapper', async () => {
    const { createAuthenticatedClient } = await import('../packages/client/src/auth.js')

    const getToken = vi.fn().mockReturnValue('dynamic-token')

    createAuthenticatedClient({
      url: 'wss://api.example.com/rpc',
      getToken,
    })

    expect(getToken).toHaveBeenCalled()
    expect(capturedWebSocketCalls).toHaveLength(1)
    const protocols = capturedWebSocketCalls[0].protocols
    expect(protocols).toBeDefined()
    const protocolArray = Array.isArray(protocols) ? protocols : [protocols]
    expect(protocolArray).toContain('bearer.dynamic-token')
  })
})
