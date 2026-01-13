// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * User context extracted from authentication.
 * This is passed to Durable Objects via X-User-* headers.
 */
export interface UserContext {
  /** Unique user identifier */
  id: string
  /** User's email address (optional) */
  email?: string
  /** User's role for authorization (optional) */
  role?: string
}

/**
 * Options for configuring RPC authentication middleware.
 */
export interface RpcAuthOptions {
  /**
   * Function to validate a token and return user context.
   * Returns { user: UserContext } on success, null on failure.
   */
  validateToken?: (token: string) => Promise<{ user: UserContext } | null>

  /**
   * Whether authentication is required for this endpoint.
   * If true, requests without valid auth will receive 401 responses.
   * If false, requests proceed without auth (but auth is still extracted if present).
   * Defaults to false.
   */
  requireAuth?: boolean
}

/**
 * Result of extracting authentication from a request.
 */
export interface ExtractAuthResult {
  /** The extracted token, or null if no token found */
  token: string | null
}

/**
 * RPC authentication middleware instance.
 * Provides methods for extracting, validating, and enriching requests with auth.
 */
export interface RpcAuthMiddleware {
  /**
   * Extract Bearer token from request.
   * Checks Authorization header first, then WebSocket subprotocol.
   */
  extractAuth(req: Request): ExtractAuthResult

  /**
   * Validate a token and extract user context.
   * Returns null if validation fails or no validator is configured.
   */
  validateAndExtract(token: string): Promise<UserContext | null>

  /**
   * Enrich a request with user context via X-User-* headers.
   * Returns a new Request with the headers added.
   */
  enrichRequest(req: Request, user: UserContext): Request

  /**
   * Handle a request through the full auth flow.
   * Returns a Response (401) if auth fails and is required.
   * Returns an enriched Request if auth succeeds or is optional.
   */
  handle(req: Request): Promise<Response | Request>
}

/**
 * Create an RPC authentication middleware instance.
 *
 * @param options Configuration options for the middleware
 * @returns An RpcAuthMiddleware instance
 *
 * @example
 * ```typescript
 * const middleware = createRpcAuthMiddleware({
 *   requireAuth: true,
 *   validateToken: async (token) => {
 *     const session = await auth.verifyToken(token)
 *     return session ? { user: session.user } : null
 *   }
 * })
 *
 * // In your handler:
 * const result = await middleware.handle(request)
 * if (result instanceof Response) {
 *   return result // Auth failed
 * }
 * // result is now an enriched Request with X-User-* headers
 * ```
 */
export function createRpcAuthMiddleware(options: RpcAuthOptions): RpcAuthMiddleware {
  return {
    extractAuth(req: Request): ExtractAuthResult {
      // First check Authorization header (takes precedence)
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        // Return token even if empty (malformed Bearer header case)
        return { token: authHeader.slice(7) }
      }
      // Handle "Bearer" without space - still a Bearer attempt
      if (authHeader === 'Bearer') {
        return { token: '' }
      }

      // Fallback to WebSocket subprotocol
      // Format: "capnp-rpc, bearer.{token}"
      const wsProtocol = req.headers.get('Sec-WebSocket-Protocol')
      if (wsProtocol) {
        const protocols = wsProtocol.split(',').map((p) => p.trim())
        const bearerProtocol = protocols.find((p) => p.startsWith('bearer.'))
        if (bearerProtocol) {
          return { token: bearerProtocol.slice(7) }
        }
      }

      return { token: null }
    },

    async validateAndExtract(token: string): Promise<UserContext | null> {
      if (!options.validateToken) {
        return null
      }

      try {
        const result = await options.validateToken(token)
        return result?.user ?? null
      } catch {
        // Validation error - treat as invalid token
        return null
      }
    },

    enrichRequest(req: Request, user: UserContext): Request {
      const headers = new Headers(req.headers)

      // Set required user ID
      headers.set('X-User-ID', user.id)

      // Set optional fields only if present
      if (user.email !== undefined) {
        headers.set('X-User-Email', user.email)
      }
      if (user.role !== undefined) {
        headers.set('X-User-Role', user.role)
      }

      // Build RequestInit with duplex option when body is present
      // Node.js requires duplex: 'half' for streaming bodies
      const init: RequestInit & { duplex?: 'half' } = {
        method: req.method,
        headers,
        // Preserve other request properties
        redirect: req.redirect,
        signal: req.signal,
        referrer: req.referrer,
        referrerPolicy: req.referrerPolicy,
        mode: req.mode,
        credentials: req.credentials,
        cache: req.cache,
        integrity: req.integrity,
        keepalive: req.keepalive,
      }

      // Only include body and duplex if there's a body
      if (req.body !== null) {
        init.body = req.body
        init.duplex = 'half'
      }

      return new Request(req.url, init)
    },

    async handle(req: Request): Promise<Response | Request> {
      const { token } = this.extractAuth(req)

      // No token provided
      if (!token) {
        if (options.requireAuth) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // Auth not required, pass through original request
        return req
      }

      // Token provided - validate it
      const user = await this.validateAndExtract(token)

      if (user) {
        // Valid token - enrich request with user context
        return this.enrichRequest(req, user)
      } else if (options.requireAuth) {
        // Invalid token and auth required
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Invalid token but auth not required - pass through original request
      return req
    },
  }
}

/**
 * Extract user context from X-User-* headers in a request.
 * This is typically used by Durable Objects to get the authenticated user.
 *
 * @param req The incoming request
 * @returns UserContext if X-User-ID is present, null otherwise
 *
 * @example
 * ```typescript
 * // In a Durable Object:
 * async fetch(request: Request) {
 *   const user = extractUserFromRequest(request)
 *   if (!user) {
 *     return new Response('Unauthorized', { status: 401 })
 *   }
 *   // user.id, user.email, user.role are available
 * }
 * ```
 */
export function extractUserFromRequest(req: Request): UserContext | null {
  const id = req.headers.get('X-User-ID')
  if (!id) {
    return null
  }

  const user: UserContext = { id }

  const email = req.headers.get('X-User-Email')
  if (email) {
    user.email = email
  }

  const role = req.headers.get('X-User-Role')
  if (role) {
    user.role = role
  }

  return user
}
