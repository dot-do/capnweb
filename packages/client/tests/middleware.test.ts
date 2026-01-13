// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { describe, it, expect, vi } from 'vitest'
import {
  createRpcAuthMiddleware,
  type UserContext,
  type RpcAuthOptions,
} from '../src/middleware.js'

describe('RPC auth middleware', () => {
  describe('extractAuth', () => {
    it('should extract Bearer token from Authorization header', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer valid-token' },
      })

      const result = middleware.extractAuth(req)
      expect(result.token).toBe('valid-token')
    })

    it('should return null token when no Authorization header', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc')

      const result = middleware.extractAuth(req)
      expect(result.token).toBeNull()
    })

    it('should return null token for non-Bearer auth schemes', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      })

      const result = middleware.extractAuth(req)
      expect(result.token).toBeNull()
    })

    it('should handle malformed Bearer header gracefully', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer' }, // no token after Bearer
      })

      const result = middleware.extractAuth(req)
      expect(result.token).toBe('')
    })

    it('should extract token from WebSocket subprotocol header', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: { 'Sec-WebSocket-Protocol': 'capnp-rpc, bearer.ws-token-123' },
      })

      const result = middleware.extractAuth(req)
      expect(result.token).toBe('ws-token-123')
    })

    it('should prefer Authorization header over WebSocket subprotocol', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: {
          Authorization: 'Bearer header-token',
          'Sec-WebSocket-Protocol': 'capnp-rpc, bearer.ws-token',
        },
      })

      const result = middleware.extractAuth(req)
      expect(result.token).toBe('header-token')
    })
  })

  describe('validateAndExtract', () => {
    it('should validate token and return user context', async () => {
      const mockValidate = vi.fn().mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      })

      const middleware = createRpcAuthMiddleware({ validateToken: mockValidate })
      const user = await middleware.validateAndExtract('valid-token')

      expect(mockValidate).toHaveBeenCalledWith('valid-token')
      expect(user).toEqual({ id: 'user-123', email: 'test@example.com' })
    })

    it('should return null for invalid token', async () => {
      const mockValidate = vi.fn().mockResolvedValue(null)

      const middleware = createRpcAuthMiddleware({ validateToken: mockValidate })
      const user = await middleware.validateAndExtract('invalid-token')

      expect(user).toBeNull()
    })

    it('should return null when no validator is provided', async () => {
      const middleware = createRpcAuthMiddleware({})
      const user = await middleware.validateAndExtract('any-token')

      expect(user).toBeNull()
    })

    it('should handle validator throwing an error', async () => {
      const mockValidate = vi.fn().mockRejectedValue(new Error('Validation failed'))

      const middleware = createRpcAuthMiddleware({ validateToken: mockValidate })
      const user = await middleware.validateAndExtract('bad-token')

      expect(user).toBeNull()
    })

    it('should pass through full user context with role', async () => {
      const mockValidate = vi.fn().mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      })

      const middleware = createRpcAuthMiddleware({ validateToken: mockValidate })
      const user = await middleware.validateAndExtract('admin-token')

      expect(user).toEqual({
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      })
    })
  })

  describe('enrichRequest', () => {
    it('should pass user context via X-User-* headers to DO', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        method: 'POST',
        body: 'test body',
      })
      const user: UserContext = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      }

      const enrichedReq = middleware.enrichRequest(req, user)

      expect(enrichedReq.headers.get('X-User-ID')).toBe('user-123')
      expect(enrichedReq.headers.get('X-User-Email')).toBe('test@example.com')
      expect(enrichedReq.headers.get('X-User-Role')).toBe('admin')
    })

    it('should preserve original request URL and method', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc/endpoint', {
        method: 'POST',
      })
      const user: UserContext = { id: 'user-123' }

      const enrichedReq = middleware.enrichRequest(req, user)

      expect(enrichedReq.url).toBe('https://api.example.com/rpc/endpoint')
      expect(enrichedReq.method).toBe('POST')
    })

    it('should not add headers for undefined user fields', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc')
      const user: UserContext = { id: 'user-123' } // no email or role

      const enrichedReq = middleware.enrichRequest(req, user)

      expect(enrichedReq.headers.get('X-User-ID')).toBe('user-123')
      expect(enrichedReq.headers.has('X-User-Email')).toBe(false)
      expect(enrichedReq.headers.has('X-User-Role')).toBe(false)
    })

    it('should preserve original request headers', () => {
      const middleware = createRpcAuthMiddleware({})
      const req = new Request('https://api.example.com/rpc', {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'req-456',
        },
      })
      const user: UserContext = { id: 'user-123' }

      const enrichedReq = middleware.enrichRequest(req, user)

      expect(enrichedReq.headers.get('Content-Type')).toBe('application/json')
      expect(enrichedReq.headers.get('X-Request-ID')).toBe('req-456')
      expect(enrichedReq.headers.get('X-User-ID')).toBe('user-123')
    })
  })

  describe('handle', () => {
    it('should allow requests without auth for public endpoints', async () => {
      const middleware = createRpcAuthMiddleware({ requireAuth: false })
      const req = new Request('https://api.example.com/rpc')

      const result = await middleware.handle(req)

      // Should return the request, not a Response
      expect(result).toBeInstanceOf(Request)
    })

    it('should reject requests without auth when required', async () => {
      const middleware = createRpcAuthMiddleware({ requireAuth: true })
      const req = new Request('https://api.example.com/rpc')

      const result = await middleware.handle(req)

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
      const body = await response.json() as { error: string }
      expect(body.error).toBe('Unauthorized')
    })

    it('should validate and enrich request with valid token', async () => {
      const mockValidate = vi.fn().mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      })

      const middleware = createRpcAuthMiddleware({
        requireAuth: true,
        validateToken: mockValidate,
      })
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer valid-token' },
      })

      const result = await middleware.handle(req)

      expect(result).toBeInstanceOf(Request)
      const enrichedReq = result as Request
      expect(enrichedReq.headers.get('X-User-ID')).toBe('user-123')
      expect(enrichedReq.headers.get('X-User-Email')).toBe('test@example.com')
    })

    it('should reject requests with invalid token when auth required', async () => {
      const mockValidate = vi.fn().mockResolvedValue(null)

      const middleware = createRpcAuthMiddleware({
        requireAuth: true,
        validateToken: mockValidate,
      })
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer invalid-token' },
      })

      const result = await middleware.handle(req)

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
      const body = await response.json() as { error: string }
      expect(body.error).toBe('Invalid token')
    })

    it('should pass through request with invalid token when auth not required', async () => {
      const mockValidate = vi.fn().mockResolvedValue(null)

      const middleware = createRpcAuthMiddleware({
        requireAuth: false,
        validateToken: mockValidate,
      })
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer invalid-token' },
      })

      const result = await middleware.handle(req)

      // Should return request (unenriched) since auth is optional
      expect(result).toBeInstanceOf(Request)
    })

    it('should enrich request with valid token even when auth not required', async () => {
      const mockValidate = vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
      })

      const middleware = createRpcAuthMiddleware({
        requireAuth: false,
        validateToken: mockValidate,
      })
      const req = new Request('https://api.example.com/rpc', {
        headers: { Authorization: 'Bearer valid-token' },
      })

      const result = await middleware.handle(req)

      expect(result).toBeInstanceOf(Request)
      const enrichedReq = result as Request
      expect(enrichedReq.headers.get('X-User-ID')).toBe('user-123')
    })

    it('should extract user from WebSocket subprotocol', async () => {
      const mockValidate = vi.fn().mockResolvedValue({
        user: { id: 'ws-user-123' },
      })

      const middleware = createRpcAuthMiddleware({
        requireAuth: true,
        validateToken: mockValidate,
      })
      const req = new Request('https://api.example.com/rpc', {
        headers: { 'Sec-WebSocket-Protocol': 'capnp-rpc, bearer.ws-token' },
      })

      const result = await middleware.handle(req)

      expect(mockValidate).toHaveBeenCalledWith('ws-token')
      expect(result).toBeInstanceOf(Request)
      const enrichedReq = result as Request
      expect(enrichedReq.headers.get('X-User-ID')).toBe('ws-user-123')
    })
  })

  describe('extractUserFromRequest (helper)', () => {
    it('should extract user context from X-User-* headers', async () => {
      const { extractUserFromRequest } = await import('../src/middleware.js')

      const req = new Request('https://api.example.com/rpc', {
        headers: {
          'X-User-ID': 'user-123',
          'X-User-Email': 'test@example.com',
          'X-User-Role': 'admin',
        },
      })

      const user = extractUserFromRequest(req)

      expect(user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      })
    })

    it('should return null if no X-User-ID header', async () => {
      const { extractUserFromRequest } = await import('../src/middleware.js')

      const req = new Request('https://api.example.com/rpc', {
        headers: {
          'X-User-Email': 'test@example.com',
        },
      })

      const user = extractUserFromRequest(req)

      expect(user).toBeNull()
    })

    it('should return partial user if only id is present', async () => {
      const { extractUserFromRequest } = await import('../src/middleware.js')

      const req = new Request('https://api.example.com/rpc', {
        headers: {
          'X-User-ID': 'user-123',
        },
      })

      const user = extractUserFromRequest(req)

      expect(user).toEqual({ id: 'user-123' })
    })
  })
})
