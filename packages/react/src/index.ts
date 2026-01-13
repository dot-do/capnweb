// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * @dotdo/react - React hooks and components for dotdo authentication and RPC
 *
 * This package provides React integration for the dotdo authentication system,
 * including a context provider and hooks for managing authentication state
 * and creating authenticated RPC clients.
 *
 * @example
 * ```tsx
 * import { AuthProvider, useAuth } from '@dotdo/react'
 *
 * // Wrap your app with AuthProvider
 * function App() {
 *   return (
 *     <AuthProvider sessionEndpoint="/auth/session" rpcUrl="https://api.example.com/rpc">
 *       <MyComponent />
 *     </AuthProvider>
 *   )
 * }
 *
 * // Use the useAuth hook in your components
 * function MyComponent() {
 *   const { isAuthenticated, user, client, login, logout } = useAuth()
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
 * ```
 */

// Auth exports
export { AuthContext } from './auth/auth-context.js'
export type {
  Session,
  User,
  AuthState,
  LoginOptions,
  AuthContextValue,
  RpcClient,
} from './auth/auth-context.js'

export { AuthProvider } from './auth/auth-provider.js'
export type { AuthProviderProps } from './auth/auth-provider.js'

export { useAuth } from './auth/use-auth.js'
export type { UseAuthOptions, UseAuthReturn } from './auth/use-auth.js'
