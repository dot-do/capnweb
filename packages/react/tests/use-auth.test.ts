// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock createAuthenticatedClient before importing the modules under test
vi.mock('@dotdo/client', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    // Mock RPC client
    someMethod: vi.fn().mockResolvedValue({ data: 'test' }),
  })),
}))

import { useAuth, AuthProvider } from '../src/index.js'
import { createAuthenticatedClient } from '@dotdo/client'

// Mock fetch globally
const mockFetch = vi.fn()

// Helper to create wrapper with AuthProvider
function createWrapper(props: Record<string, unknown> = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(AuthProvider, props, children)
  }
}

// Session response types for testing
interface MockSession {
  token: string
  expiresAt: string
}

interface MockUser {
  id: string
  email: string
  name: string
}

interface MockSessionResponse {
  session: MockSession | null
  user: MockUser | null
}

// Helper to create mock session response
function createMockSessionResponse(authenticated: boolean): MockSessionResponse {
  if (authenticated) {
    return {
      session: {
        token: 'test-token-123',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      },
    }
  }
  return { session: null, user: null }
}

describe('useAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    // Default: return unauthenticated response
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(false)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should provide isLoading=true initially', async () => {
    // Delay the fetch response to capture initial loading state
    let resolveSession: (value: Response) => void
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve
      })
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    // Initially should be loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)

    // Resolve the fetch
    await act(async () => {
      resolveSession!(
        new Response(JSON.stringify(createMockSessionResponse(false)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should provide isAuthenticated and user after session fetch', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    })
    expect(result.current.session).toEqual({
      token: 'test-token-123',
      expiresAt: expect.any(String),
    })
  })

  it('should provide login function that redirects', async () => {
    const originalLocation = window.location
    const mockAssign = vi.fn()

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        assign: mockAssign,
        href: 'http://localhost/',
        origin: 'http://localhost',
      },
      writable: true,
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Call login with provider
    act(() => {
      result.current.login({ provider: 'google' })
    })

    // Should redirect to auth endpoint
    expect(mockAssign).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login')
    )
    expect(mockAssign).toHaveBeenCalledWith(
      expect.stringContaining('provider=google')
    )

    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('should provide logout function that clears session', async () => {
    // First, mock an authenticated session
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(createMockSessionResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    // Mock logout endpoint response
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // Call logout
    await act(async () => {
      await result.current.logout()
    })

    // Should have called logout endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({
        method: 'POST',
      })
    )

    // Session should be cleared
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
  })

  it('should provide authenticated client with session token', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(
      () =>
        useAuth({
          rpcUrl: 'https://api.example.com/rpc',
        }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    // Client should be created with the token
    expect(result.current.client).toBeDefined()
    expect(createAuthenticatedClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/rpc',
        token: 'test-token-123',
      })
    )
  })

  it('should return null client when not authenticated', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(false)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(
      () =>
        useAuth({
          rpcUrl: 'https://api.example.com/rpc',
        }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Client should be null when not authenticated
    expect(result.current.client).toBeNull()
  })

  it('should re-create client when token changes', async () => {
    // First session response
    const firstSession = createMockSessionResponse(true)
    firstSession.session!.token = 'token-v1'
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(firstSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(
      () =>
        useAuth({
          rpcUrl: 'https://api.example.com/rpc',
        }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    // Verify first client was created with first token
    expect(createAuthenticatedClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token-v1',
      })
    )

    const createCallCount = vi.mocked(createAuthenticatedClient).mock.calls.length

    // Refresh session with new token
    const secondSession = createMockSessionResponse(true)
    secondSession.session!.token = 'token-v2'
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(secondSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // Trigger refresh
    await act(async () => {
      await result.current.refreshSession()
    })

    // Should have created a new client with new token
    expect(vi.mocked(createAuthenticatedClient).mock.calls.length).toBeGreaterThan(
      createCallCount
    )
    expect(createAuthenticatedClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        token: 'token-v2',
      })
    )
  })
})

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(false)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should fetch session on mount', async () => {
    renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    // Should have called the session endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/session'),
      expect.any(Object)
    )
  })

  it('should accept custom sessionEndpoint', async () => {
    renderHook(() => useAuth(), {
      wrapper: createWrapper({ sessionEndpoint: '/custom/session' }),
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/custom/session'),
        expect.any(Object)
      )
    })
  })

  it('should provide context to children', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockSessionResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should have access to all auth context values
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isAuthenticated')
    expect(result.current).toHaveProperty('user')
    expect(result.current).toHaveProperty('session')
    expect(result.current).toHaveProperty('login')
    expect(result.current).toHaveProperty('logout')
    expect(result.current).toHaveProperty('refreshSession')
  })

  it('should throw if used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within an AuthProvider')

    consoleSpy.mockRestore()
  })
})
