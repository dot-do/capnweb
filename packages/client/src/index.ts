// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * @dotdo/client - High-level RPC client with authentication support
 *
 * This package provides a simplified API for creating authenticated RPC clients
 * that wrap the capnweb transport layer with automatic auth header injection.
 *
 * @example
 * ```typescript
 * import { createAuthenticatedClient } from '@dotdo/client'
 *
 * interface MyApi {
 *   getData(): Promise<{ value: number }>
 *   setData(value: number): Promise<void>
 * }
 *
 * const client = createAuthenticatedClient<MyApi>({
 *   url: 'https://api.example.com/rpc',
 *   token: 'my-auth-token',
 * })
 *
 * const data = await client.getData()
 * ```
 */

export { createAuthenticatedClient } from './auth.js'
export type { AuthenticatedClientOptions } from './auth.js'

export { SessionManager } from './session.js'
export type { SessionManagerOptions, TokenRefreshEvent } from './session.js'

export { createRpcAuthMiddleware, extractUserFromRequest } from './middleware.js'
export type { RpcAuthMiddleware, RpcAuthOptions, UserContext, ExtractAuthResult } from './middleware.js'

// Re-export useful types from capnweb for convenience
export type { RpcStub, RpcCompatible, RpcTarget } from '../../../src/index.js'
