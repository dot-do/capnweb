// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { newHttpBatchRpcSession, newWebSocketRpcSession } from '../../../src/index.js'
import type { RpcStub, RpcCompatible, HttpBatchRpcSessionOptions } from '../../../src/index.js'

/**
 * Options for creating an authenticated RPC client.
 */
export interface AuthenticatedClientOptions {
  /**
   * The URL of the RPC endpoint.
   * - For HTTP batch: https:// or http:// URLs
   * - For WebSocket: wss:// or ws:// URLs
   *
   * The transport is auto-detected from the URL scheme if not specified.
   */
  url: string

  /**
   * Static auth token to use for requests.
   * For HTTP: Sent as `Authorization: Bearer {token}` header.
   * For WebSocket: Sent as `bearer.{token}` subprotocol.
   */
  token?: string

  /**
   * Dynamic token getter for refresh scenarios.
   * Called for each request/connection to get the current token.
   * If both `token` and `getToken` are provided, `getToken` takes precedence.
   */
  getToken?: () => string

  /**
   * Transport type to use. If not specified, auto-detected from URL:
   * - wss:// or ws:// -> 'websocket'
   * - https:// or http:// -> 'http'
   */
  transport?: 'http' | 'websocket'

  /**
   * Additional custom headers to include with HTTP batch requests.
   * Not applicable to WebSocket transport.
   */
  headers?: Record<string, string>

  /**
   * Custom fetch function to use for HTTP batch requests.
   * Useful for testing or custom HTTP clients.
   */
  fetch?: typeof fetch

  /**
   * Callback invoked when an authentication error occurs.
   * Useful for triggering token refresh or logout flows.
   */
  onAuthError?: (error: Error) => void
}

/**
 * Detect transport type from URL scheme.
 */
function detectTransport(url: string): 'http' | 'websocket' {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.startsWith('wss://') || lowerUrl.startsWith('ws://')) {
    return 'websocket'
  }
  return 'http'
}

/**
 * Get the auth token from options, preferring getToken over static token.
 */
function getAuthToken(options: AuthenticatedClientOptions): string | undefined {
  if (options.getToken) {
    return options.getToken()
  }
  return options.token
}

/**
 * Build WebSocket subprotocols array for auth.
 * Always includes 'capnp-rpc' as the base protocol when auth is provided.
 */
function buildWebSocketProtocols(token: string | undefined): string[] | undefined {
  if (!token) {
    return undefined
  }
  return ['capnp-rpc', `bearer.${token}`]
}

/**
 * Create an authenticated RPC client that wraps capnweb transport with auth header injection.
 *
 * For HTTP batch transport, auth tokens are sent as `Authorization: Bearer {token}` headers.
 * For WebSocket transport, auth tokens are sent via the `bearer.{token}` subprotocol.
 *
 * @param options - Configuration options for the authenticated client
 * @returns An RpcStub typed to the provided interface
 *
 * @example
 * ```typescript
 * // HTTP batch with static token
 * const client = createAuthenticatedClient<MyApi>({
 *   url: 'https://api.example.com/rpc',
 *   token: 'my-auth-token',
 * })
 *
 * // HTTP batch with dynamic token (for refresh scenarios)
 * const client = createAuthenticatedClient<MyApi>({
 *   url: 'https://api.example.com/rpc',
 *   getToken: () => localStorage.getItem('accessToken') ?? '',
 * })
 *
 * // WebSocket with token
 * const client = createAuthenticatedClient<MyApi>({
 *   url: 'wss://api.example.com/rpc',
 *   token: 'my-auth-token',
 * })
 *
 * // HTTP batch with additional headers
 * const client = createAuthenticatedClient<MyApi>({
 *   url: 'https://api.example.com/rpc',
 *   token: 'my-auth-token',
 *   headers: { 'X-Tenant-ID': 'tenant-123' },
 * })
 * ```
 */
export function createAuthenticatedClient<T extends RpcCompatible<T> = any>(
  options: AuthenticatedClientOptions
): RpcStub<T> {
  const { url, headers: customHeaders = {}, fetch: fetchFn } = options
  const transport = options.transport ?? detectTransport(url)

  if (transport === 'websocket') {
    // WebSocket transport - handle auth via subprotocol in the wrapper
    // Get token (prefer getToken callback over static token)
    const token = getAuthToken(options)
    const protocols = buildWebSocketProtocols(token)

    // Create WebSocket manually with protocols, then pass to capnweb
    const socket = new WebSocket(url, protocols)
    return newWebSocketRpcSession<T>(socket, undefined)
  }

  // HTTP batch transport - use Authorization header
  const authToken = getAuthToken(options)
  const headers: Record<string, string> = {
    ...customHeaders,
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const httpOptions: HttpBatchRpcSessionOptions = {
    headers,
    fetch: fetchFn,
  }

  return newHttpBatchRpcSession<T>(url, httpOptions)
}
