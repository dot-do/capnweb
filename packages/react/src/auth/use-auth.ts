// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { useContext, useMemo } from 'react'
import { createAuthenticatedClient } from '@dotdo/client'
import { AuthContext, type Session, type User, type LoginOptions, type RpcClient } from './auth-context.js'

/**
 * Options for the useAuth hook.
 */
export interface UseAuthOptions {
  /**
   * URL of the RPC endpoint for creating an authenticated client.
   * If provided, creates a client specific to this component.
   * If not provided, uses the client from AuthProvider (if rpcUrl was set there).
   */
  rpcUrl?: string
}

/**
 * Return type for the useAuth hook.
 */
export interface UseAuthReturn {
  /** Current session, or null if not authenticated */
  session: Session | null
  /** Current user, or null if not authenticated */
  user: User | null
  /** Whether the initial session fetch is in progress */
  isLoading: boolean
  /** Whether the user is authenticated (has a valid session) */
  isAuthenticated: boolean
  /** Initiate login flow */
  login: (options: LoginOptions) => void
  /** Log out the current user */
  logout: () => Promise<void>
  /** Manually refresh the session */
  refreshSession: () => Promise<void>
  /** Authenticated RPC client (null if not authenticated or no rpcUrl) */
  client: RpcClient | null
}

/**
 * React hook for accessing authentication state and actions.
 *
 * Must be used within an AuthProvider.
 *
 * @param options - Optional configuration for the hook
 * @returns Authentication state and actions
 *
 * @example
 * ```tsx
 * // Basic usage
 * function MyComponent() {
 *   const { isAuthenticated, user, login, logout } = useAuth()
 *
 *   if (!isAuthenticated) {
 *     return <button onClick={() => login({ provider: 'google' })}>Login</button>
 *   }
 *
 *   return (
 *     <div>
 *       <p>Welcome, {user.name}!</p>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   )
 * }
 *
 * // With RPC client
 * function MyComponent() {
 *   const { client, isAuthenticated } = useAuth({
 *     rpcUrl: 'https://api.example.com/rpc',
 *   })
 *
 *   const handleClick = async () => {
 *     if (client) {
 *       const result = await client.getData()
 *       console.log(result)
 *     }
 *   }
 *
 *   return <button onClick={handleClick} disabled={!isAuthenticated}>Fetch Data</button>
 * }
 * ```
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const context = useContext(AuthContext)

  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  const { rpcUrl } = options
  const { session, user, isLoading, isAuthenticated, login, logout, refreshSession, client: providerClient } = context

  // Create a component-specific client if rpcUrl is provided
  const client = useMemo<RpcClient | null>(() => {
    // If no rpcUrl provided, use the provider's client
    if (!rpcUrl) {
      return providerClient
    }

    // Create a new client with the provided rpcUrl
    if (!isAuthenticated || !session?.token) {
      return null
    }

    // Cast to RpcClient to avoid type recursion issues with RpcStub
    return createAuthenticatedClient({
      url: rpcUrl,
      token: session.token,
    }) as unknown as RpcClient
  }, [rpcUrl, isAuthenticated, session?.token, providerClient])

  return {
    session,
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshSession,
    client,
  }
}
