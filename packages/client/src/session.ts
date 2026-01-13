// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * Event emitted when a token is successfully refreshed.
 */
export interface TokenRefreshEvent {
  oldToken: string
  newToken: string
}

/**
 * Options for creating a SessionManager instance.
 */
export interface SessionManagerOptions {
  /**
   * The initial authentication token.
   */
  token: string

  /**
   * Unix timestamp (ms) when the token expires.
   * If provided along with refreshToken, automatic refresh will be scheduled.
   */
  tokenExpiry?: number

  /**
   * Async function that returns a new token.
   * Called when the token needs to be refreshed (either automatically or manually).
   */
  refreshToken?: () => Promise<string>

  /**
   * Time in milliseconds before expiry to trigger refresh.
   * Default: 60000 (1 minute before expiry)
   */
  refreshThreshold?: number

  /**
   * Callback invoked when a token is successfully refreshed.
   * Useful for persisting the new token or updating other parts of the app.
   */
  onTokenRefresh?: (event: TokenRefreshEvent) => void

  /**
   * Callback invoked when a token refresh fails.
   * Useful for triggering logout flows or error handling.
   */
  onAuthError?: (error: Error) => void
}

/**
 * Default refresh threshold: 1 minute before expiry.
 */
const DEFAULT_REFRESH_THRESHOLD = 60000

/**
 * Manages authentication session tokens with automatic refresh support.
 *
 * SessionManager tracks token expiry and proactively refreshes tokens before
 * they expire. It integrates seamlessly with createAuthenticatedClient via
 * the getToken() method.
 *
 * @example
 * ```typescript
 * import { SessionManager, createAuthenticatedClient } from '@dotdo/client'
 *
 * const session = new SessionManager({
 *   token: 'initial-token',
 *   tokenExpiry: Date.now() + 3600000, // 1 hour
 *   refreshToken: async () => {
 *     const response = await fetch('/auth/refresh', { method: 'POST' })
 *     const data = await response.json()
 *     session.setTokenExpiry(data.expiry)
 *     return data.token
 *   },
 *   onTokenRefresh: ({ newToken }) => {
 *     localStorage.setItem('token', newToken)
 *   },
 *   onAuthError: (error) => {
 *     // Redirect to login
 *     window.location.href = '/login'
 *   },
 * })
 *
 * // Use with createAuthenticatedClient
 * const client = createAuthenticatedClient({
 *   url: 'https://api.example.com/rpc',
 *   getToken: () => session.getToken(),
 * })
 *
 * // Clean up when done
 * session.dispose()
 * ```
 */
export class SessionManager {
  private token: string
  private tokenExpiry?: number
  private refreshTimer?: ReturnType<typeof setTimeout>
  private options: SessionManagerOptions

  constructor(options: SessionManagerOptions) {
    this.options = options
    this.token = options.token
    this.tokenExpiry = options.tokenExpiry
    this.scheduleRefresh()
  }

  /**
   * Returns the current authentication token.
   * This method can be passed directly to createAuthenticatedClient's getToken option.
   */
  getToken(): string {
    return this.token
  }

  /**
   * Manually triggers a token refresh.
   * Calls the refreshToken function and updates the internal token.
   *
   * @throws Error if no refreshToken function was provided
   * @throws Error if the refreshToken function fails
   * @returns The new token
   */
  async refresh(): Promise<string> {
    if (!this.options.refreshToken) {
      throw new Error('No refreshToken function provided')
    }

    try {
      const oldToken = this.token
      this.token = await this.options.refreshToken()

      this.options.onTokenRefresh?.({ oldToken, newToken: this.token })
      // Skip immediate refresh to avoid infinite loop if tokenExpiry hasn't been updated
      this.scheduleRefresh(true)

      return this.token
    } catch (error) {
      this.options.onAuthError?.(error as Error)
      throw error
    }
  }

  /**
   * Updates the token expiry time and reschedules automatic refresh.
   * Call this when you receive a new expiry time from your auth server.
   *
   * @param expiry - Unix timestamp (ms) when the token expires, or undefined to clear
   */
  setTokenExpiry(expiry: number | undefined): void {
    this.tokenExpiry = expiry
    this.scheduleRefresh()
  }

  /**
   * Disposes of the SessionManager, canceling any scheduled refresh.
   * Call this when the session is no longer needed to prevent memory leaks.
   */
  dispose(): void {
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }

  /**
   * Schedules automatic token refresh based on tokenExpiry and refreshThreshold.
   * Called internally after construction and after each successful refresh.
   * @param skipImmediateRefresh - If true, don't trigger immediate refresh even if past threshold.
   *                              Used to prevent infinite loops after a refresh completes.
   */
  private scheduleRefresh(skipImmediateRefresh = false): void {
    // Clear any existing timer
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }

    // Can't schedule without both expiry and refresh function
    if (this.tokenExpiry === undefined || !this.options.refreshToken) {
      return
    }

    const threshold = this.options.refreshThreshold ?? DEFAULT_REFRESH_THRESHOLD
    const now = Date.now()
    const refreshAt = this.tokenExpiry - threshold
    const refreshIn = refreshAt - now

    if (refreshIn > 0) {
      // Schedule refresh for future
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch(() => {
          // Error is already handled via onAuthError callback
        })
      }, refreshIn)
    } else if (!skipImmediateRefresh && refreshIn > -threshold) {
      // Already past threshold but not yet expired - refresh immediately
      // Note: we use setTimeout(0) to avoid blocking and allow for dispose() to work
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch(() => {
          // Error is already handled via onAuthError callback
        })
      }, 0)
    }
    // If refreshIn <= -threshold, token is already expired - don't auto-refresh
  }
}
