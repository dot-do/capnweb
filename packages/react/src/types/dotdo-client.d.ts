// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * Type declarations for @dotdo/client.
 * We declare minimal types here to avoid pulling in the full capnweb types
 * which can cause type recursion issues.
 */
declare module '@dotdo/client' {
  export interface AuthenticatedClientOptions {
    url: string
    token?: string
    getToken?: () => string
    transport?: 'http' | 'websocket'
    headers?: Record<string, string>
    fetch?: typeof fetch
    onAuthError?: (error: Error) => void
  }

  /**
   * Creates an authenticated RPC client.
   * Returns an object that proxies method calls to the RPC endpoint.
   */
  export function createAuthenticatedClient<T = Record<string, (...args: unknown[]) => Promise<unknown>>>(
    options: AuthenticatedClientOptions
  ): T
}
