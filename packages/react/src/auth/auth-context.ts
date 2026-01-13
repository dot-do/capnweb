// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { createContext } from 'react'

/**
 * Generic RPC client type (any object with callable methods).
 * We use a simple type here to avoid type recursion issues with capnweb's RpcStub.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcClient = Record<string, (...args: any[]) => Promise<any>>

/**
 * Session information from the auth endpoint.
 */
export interface Session {
  /** The authentication token */
  token: string
  /** When the session expires (ISO 8601 format) */
  expiresAt: string
}

/**
 * User information from the auth endpoint.
 */
export interface User {
  /** Unique user identifier */
  id: string
  /** User's email address */
  email: string
  /** User's display name */
  name: string
  /** Additional user properties */
  [key: string]: unknown
}

/**
 * Authentication state managed by the AuthProvider.
 */
export interface AuthState {
  /** Current session, or null if not authenticated */
  session: Session | null
  /** Current user, or null if not authenticated */
  user: User | null
  /** Whether the initial session fetch is in progress */
  isLoading: boolean
  /** Whether the user is authenticated (has a valid session) */
  isAuthenticated: boolean
}

/**
 * Options for the login function.
 */
export interface LoginOptions {
  /** OAuth provider to use (e.g., 'google', 'github') */
  provider: string
  /** URL to redirect to after successful login */
  redirectUrl?: string
  /** Additional parameters to pass to the auth endpoint */
  [key: string]: unknown
}

/**
 * Complete auth context value provided by AuthProvider.
 */
export interface AuthContextValue extends AuthState {
  /** Initiate login flow */
  login: (options: LoginOptions) => void
  /** Log out the current user */
  logout: () => Promise<void>
  /** Manually refresh the session */
  refreshSession: () => Promise<void>
  /** Authenticated RPC client (null if not authenticated) */
  client: RpcClient | null
}

/**
 * React context for authentication state and actions.
 */
export const AuthContext = createContext<AuthContextValue | null>(null)

AuthContext.displayName = 'AuthContext'
