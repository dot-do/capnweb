// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import the function we're going to implement
import { createAuthenticatedClient } from '../src/auth.js'

// Store captured WebSocket constructor calls for WebSocket transport tests
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

describe('createAuthenticatedClient', () => {
  beforeEach(() => {
    capturedWebSocketCalls = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('HTTP batch transport (default)', () => {
    it('should inject Authorization header via HTTP batch transport', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com/rpc',
        token: 'test-token',
        fetch: mockFetch,
      })

      // Trigger a batch request by accessing a method
      try {
        await client.someMethod()
      } catch {
        // Expected to fail since mock returns empty response
      }

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.example.com/rpc')
      expect(init.headers).toBeDefined()
      expect(init.headers['Authorization']).toBe('Bearer test-token')
    })

    it('should use HTTP batch by default', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com/rpc',
        token: 'default-transport-token',
        fetch: mockFetch,
      })

      // Trigger a batch request
      try {
        await client.someMethod()
      } catch {
        // Expected to fail since mock returns empty response
      }

      // Verify fetch was called (meaning HTTP batch was used)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should support static token', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com',
        token: 'static-token',
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer static-token')
    })

    it('should support dynamic token getter for refresh', async () => {
      const getToken = vi.fn().mockReturnValue('dynamic-token')
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com',
        getToken,
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      expect(getToken).toHaveBeenCalled()
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer dynamic-token')
    })

    it('should prefer getToken over static token when both provided', async () => {
      const getToken = vi.fn().mockReturnValue('from-getter')
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com',
        token: 'static-ignored',
        getToken,
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      expect(getToken).toHaveBeenCalled()
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer from-getter')
    })

    it('should work without token for public endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com/rpc',
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0]
      // Should not have Authorization header when no token provided
      expect(init.headers['Authorization']).toBeUndefined()
    })

    it('should support additional custom headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com/rpc',
        token: 'test-token',
        headers: {
          'X-Tenant-ID': 'tenant-123',
          'X-Request-ID': 'req-456',
        },
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer test-token')
      expect(init.headers['X-Tenant-ID']).toBe('tenant-123')
      expect(init.headers['X-Request-ID']).toBe('req-456')
    })
  })

  describe('WebSocket transport', () => {
    beforeEach(() => {
      vi.stubGlobal('WebSocket', MockWebSocket)
    })

    it('should inject auth token via WebSocket subprotocol', async () => {
      const client = createAuthenticatedClient({
        url: 'wss://api.example.com',
        transport: 'websocket',
        token: 'ws-token',
      })

      expect(capturedWebSocketCalls).toHaveLength(1)
      const call = capturedWebSocketCalls[0]
      expect(call.url).toBe('wss://api.example.com')

      // Should include both capnp-rpc base protocol and bearer token
      expect(call.protocols).toBeDefined()
      const protocols = Array.isArray(call.protocols) ? call.protocols : [call.protocols]
      expect(protocols).toContain('capnp-rpc')
      expect(protocols).toContain('bearer.ws-token')
    })

    it('should allow selecting WebSocket transport explicitly', async () => {
      const client = createAuthenticatedClient({
        url: 'wss://api.example.com',
        transport: 'websocket',
        token: 'ws-token',
      })

      // Verify WebSocket was created (not HTTP fetch)
      expect(capturedWebSocketCalls).toHaveLength(1)
    })

    it('should support dynamic token getter for WebSocket', async () => {
      const getToken = vi.fn().mockReturnValue('dynamic-ws-token')

      const client = createAuthenticatedClient({
        url: 'wss://api.example.com',
        transport: 'websocket',
        getToken,
      })

      expect(getToken).toHaveBeenCalled()
      expect(capturedWebSocketCalls).toHaveLength(1)
      const protocols = capturedWebSocketCalls[0].protocols
      expect(protocols).toBeDefined()
      const protocolArray = Array.isArray(protocols) ? protocols : [protocols]
      expect(protocolArray).toContain('bearer.dynamic-ws-token')
    })

    it('should work without token for public WebSocket endpoints', async () => {
      const client = createAuthenticatedClient({
        url: 'wss://api.example.com',
        transport: 'websocket',
      })

      expect(capturedWebSocketCalls).toHaveLength(1)
      const protocols = capturedWebSocketCalls[0].protocols
      // Without token, should not have bearer protocol
      if (protocols) {
        const protocolArray = Array.isArray(protocols) ? protocols : [protocols]
        expect(protocolArray.some(p => p?.startsWith('bearer.'))).toBe(false)
      }
    })
  })

  describe('transport auto-detection', () => {
    beforeEach(() => {
      vi.stubGlobal('WebSocket', MockWebSocket)
    })

    it('should auto-detect websocket transport for wss:// URLs', async () => {
      const client = createAuthenticatedClient({
        url: 'wss://api.example.com/rpc',
        token: 'auto-ws-token',
      })

      // Should have created a WebSocket, not used fetch
      expect(capturedWebSocketCalls).toHaveLength(1)
    })

    it('should auto-detect websocket transport for ws:// URLs', async () => {
      const client = createAuthenticatedClient({
        url: 'ws://api.example.com/rpc',
        token: 'auto-ws-token',
      })

      // Should have created a WebSocket
      expect(capturedWebSocketCalls).toHaveLength(1)
    })

    it('should use HTTP batch for https:// URLs by default', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      const client = createAuthenticatedClient({
        url: 'https://api.example.com/rpc',
        token: 'https-token',
        fetch: mockFetch,
      })

      try {
        await client.someMethod()
      } catch {
        // Expected
      }

      // Should have used fetch, not WebSocket
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(capturedWebSocketCalls).toHaveLength(0)
    })
  })

  describe('type safety', () => {
    it('should return typed RpcStub when generic type provided', async () => {
      interface MyApi {
        getData(): Promise<{ value: number }>
        setData(value: number): Promise<void>
      }

      const mockFetch = vi.fn().mockResolvedValue(new Response(''))

      // This tests compile-time type checking - the client should be typed as RpcStub<MyApi>
      const client = createAuthenticatedClient<MyApi>({
        url: 'https://api.example.com',
        token: 'typed-token',
        fetch: mockFetch,
      })

      // These method calls should be type-checked at compile time
      try {
        await client.getData()
        await client.setData(42)
      } catch {
        // Expected - mock returns empty response
      }

      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
