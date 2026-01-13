// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { createAuthenticatedClient } from '@dotdo/client'
import { AuthContext, type Session, type User, type LoginOptions, type AuthContextValue, type RpcClient } from './auth-context.js'

/**
 * Props for the AuthProvider component.
 */
export interface AuthProviderProps {
  /** Child components */
  children: ReactNode
  /**
   * Endpoint to fetch session from.
   * @default '/auth/session'
   */
  sessionEndpoint?: string
  /**
   * Endpoint to call for logout.
   * @default '/auth/logout'
   */
  logoutEndpoint?: string
  /**
   * Endpoint to redirect to for login.
   * @default '/auth/login'
   */
  loginEndpoint?: string
  /**
   * URL of the RPC endpoint for creating authenticated clients.
   * If not provided, no client will be created.
   */
  rpcUrl?: string
}

/**
 * Response structure from the session endpoint.
 */
interface SessionResponse {
  session: Session | null
  user: User | null
}

/**
 * AuthProvider component that manages authentication state and provides
 * it to child components via React context.
 */
export function AuthProvider({
  children,
  sessionEndpoint = '/auth/session',
  logoutEndpoint = '/auth/logout',
  loginEndpoint = '/auth/login',
  rpcUrl,
}: AuthProviderProps): ReactNode {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Fetch session from the auth endpoint.
   */
  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(sessionEndpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const data: SessionResponse = await response.json()
        setSession(data.session)
        setUser(data.user)
      } else {
        // Not authenticated or error
        setSession(null)
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
      setSession(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [sessionEndpoint])

  /**
   * Refresh the session.
   */
  const refreshSession = useCallback(async () => {
    await fetchSession()
  }, [fetchSession])

  /**
   * Initiate login flow by redirecting to the login endpoint.
   */
  const login = useCallback((options: LoginOptions) => {
    const params = new URLSearchParams()
    params.set('provider', options.provider)

    if (options.redirectUrl) {
      params.set('redirect_url', options.redirectUrl)
    } else {
      // Default to current URL
      params.set('redirect_url', window.location.href)
    }

    // Add any additional parameters
    Object.entries(options).forEach(([key, value]) => {
      if (key !== 'provider' && key !== 'redirectUrl' && value !== undefined) {
        params.set(key, String(value))
      }
    })

    const loginUrl = `${loginEndpoint}?${params.toString()}`
    window.location.assign(loginUrl)
  }, [loginEndpoint])

  /**
   * Log out the current user.
   */
  const logout = useCallback(async () => {
    try {
      await fetch(logoutEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
      })
    } catch (error) {
      console.error('Failed to call logout endpoint:', error)
    } finally {
      // Always clear local state
      setSession(null)
      setUser(null)
    }
  }, [logoutEndpoint])

  // Fetch session on mount
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Computed authentication state
  const isAuthenticated = session !== null && user !== null

  // Create authenticated RPC client when we have a session and rpcUrl
  const client = useMemo<RpcClient | null>(() => {
    if (!isAuthenticated || !session?.token || !rpcUrl) {
      return null
    }

    // Cast to RpcClient to avoid type recursion issues with RpcStub
    return createAuthenticatedClient({
      url: rpcUrl,
      token: session.token,
    }) as unknown as RpcClient
  }, [isAuthenticated, session?.token, rpcUrl])

  // Build context value
  const contextValue: AuthContextValue = useMemo(
    () => ({
      session,
      user,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshSession,
      client,
    }),
    [session, user, isLoading, isAuthenticated, login, logout, refreshSession, client]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}
