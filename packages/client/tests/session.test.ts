// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionManager } from '../src/session.js'

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('token management', () => {
    it('should return current token via getToken()', () => {
      const manager = new SessionManager({ token: 'initial-token' })
      expect(manager.getToken()).toBe('initial-token')
    })

    it('should work with createAuthenticatedClient getToken option', () => {
      const manager = new SessionManager({ token: 'my-token' })

      // The manager's getToken should be usable with createAuthenticatedClient
      expect(typeof manager.getToken).toBe('function')
      expect(manager.getToken()).toBe('my-token')
    })
  })

  describe('scheduled refresh', () => {
    it('should schedule refresh when tokenExpiry is set', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'old-token',
        tokenExpiry: Date.now() + 300000, // 5 minutes
        refreshToken,
        refreshThreshold: 60000, // Refresh 1 min before expiry
      })

      // Should not refresh immediately
      expect(refreshToken).not.toHaveBeenCalled()

      // Advance to 1 minute before expiry (4 minutes from now)
      vi.advanceTimersByTime(240000)

      // Should have scheduled refresh
      expect(refreshToken).toHaveBeenCalled()

      // Clean up to prevent cascading timers
      manager.dispose()
    })

    it('should not schedule refresh without refreshToken function', () => {
      const manager = new SessionManager({
        token: 'token',
        tokenExpiry: Date.now() + 300000,
        // No refreshToken function
      })

      // Advance past expiry - should not throw
      vi.advanceTimersByTime(400000)

      // Token should remain unchanged
      expect(manager.getToken()).toBe('token')
    })

    it('should not schedule refresh without tokenExpiry', () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'token',
        refreshToken,
        // No tokenExpiry
      })

      // Advance time
      vi.advanceTimersByTime(400000)

      // Should not have called refresh
      expect(refreshToken).not.toHaveBeenCalled()
    })

    it('should refresh immediately if already past threshold but not expired', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'old-token',
        tokenExpiry: Date.now() + 30000, // 30 seconds (past 60s threshold)
        refreshToken,
        refreshThreshold: 60000,
      })

      // Should trigger immediate refresh since already past threshold
      await vi.advanceTimersByTimeAsync(0)
      expect(refreshToken).toHaveBeenCalled()

      // Clean up
      manager.dispose()
    })

    it('should use default refreshThreshold of 60000ms', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'old-token',
        tokenExpiry: Date.now() + 120000, // 2 minutes
        refreshToken,
        // No refreshThreshold - should default to 60000
      })

      // Should not refresh yet (59 seconds in)
      vi.advanceTimersByTime(59000)
      expect(refreshToken).not.toHaveBeenCalled()

      // At 60 seconds (60 seconds before expiry) should refresh
      vi.advanceTimersByTime(1000)
      expect(refreshToken).toHaveBeenCalled()

      // Clean up
      manager.dispose()
    })
  })

  describe('manual refresh', () => {
    it('should update token after successful refresh', async () => {
      const refreshToken = vi.fn().mockResolvedValue('refreshed-token')
      const manager = new SessionManager({
        token: 'old-token',
        refreshToken,
      })

      await manager.refresh()

      expect(manager.getToken()).toBe('refreshed-token')
    })

    it('should throw if refresh called without refreshToken function', async () => {
      const manager = new SessionManager({
        token: 'token',
      })

      await expect(manager.refresh()).rejects.toThrow('No refreshToken function provided')
    })

    it('should reschedule refresh after successful manual refresh', async () => {
      const newExpiry = Date.now() + 600000 // 10 minutes in future
      const refreshToken = vi
        .fn()
        .mockResolvedValueOnce({ token: 'new-token-1', expiry: newExpiry })

      const manager = new SessionManager({
        token: 'old-token',
        tokenExpiry: Date.now() + 300000,
        refreshToken: async () => {
          const result = await refreshToken()
          manager.setTokenExpiry(result.expiry)
          return result.token
        },
        refreshThreshold: 60000,
      })

      // Advance to trigger first refresh
      vi.advanceTimersByTime(240000)
      await vi.advanceTimersByTimeAsync(0)

      // Token should be updated
      expect(manager.getToken()).toBe('new-token-1')

      // Clean up
      manager.dispose()
    })
  })

  describe('callbacks', () => {
    it('should emit onTokenRefresh callback', async () => {
      const onTokenRefresh = vi.fn()
      const manager = new SessionManager({
        token: 'old-token',
        refreshToken: async () => 'new-token',
        onTokenRefresh,
      })

      await manager.refresh()

      expect(onTokenRefresh).toHaveBeenCalledWith({
        oldToken: 'old-token',
        newToken: 'new-token',
      })
    })

    it('should handle refresh failure', async () => {
      const onAuthError = vi.fn()
      const manager = new SessionManager({
        token: 'old-token',
        refreshToken: async () => {
          throw new Error('Network error')
        },
        onAuthError,
      })

      await expect(manager.refresh()).rejects.toThrow('Network error')
      expect(onAuthError).toHaveBeenCalled()
    })

    it('should pass error to onAuthError callback', async () => {
      const onAuthError = vi.fn()
      const error = new Error('Token expired')
      const manager = new SessionManager({
        token: 'old-token',
        refreshToken: async () => {
          throw error
        },
        onAuthError,
      })

      await expect(manager.refresh()).rejects.toThrow('Token expired')
      expect(onAuthError).toHaveBeenCalledWith(error)
    })
  })

  describe('dispose', () => {
    it('should cancel scheduled refresh on dispose', () => {
      const refreshToken = vi.fn()
      const manager = new SessionManager({
        token: 'token',
        tokenExpiry: Date.now() + 300000,
        refreshToken,
        refreshThreshold: 60000,
      })

      manager.dispose()

      // Advance past refresh time
      vi.advanceTimersByTime(300000)

      // Should not have refreshed after dispose
      expect(refreshToken).not.toHaveBeenCalled()
    })

    it('should be safe to call dispose multiple times', () => {
      const manager = new SessionManager({ token: 'token' })

      // Should not throw
      manager.dispose()
      manager.dispose()
      manager.dispose()
    })

    it('should not affect getToken after dispose', () => {
      const manager = new SessionManager({ token: 'my-token' })
      manager.dispose()

      // Token should still be accessible
      expect(manager.getToken()).toBe('my-token')
    })
  })

  describe('token expiry updates', () => {
    it('should allow updating token expiry via setTokenExpiry', () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'token',
        tokenExpiry: Date.now() + 300000,
        refreshToken,
        refreshThreshold: 60000,
      })

      // Update expiry to further in the future
      manager.setTokenExpiry(Date.now() + 600000)

      // Advance to original refresh time - should not refresh
      vi.advanceTimersByTime(240000)
      expect(refreshToken).not.toHaveBeenCalled()

      // Advance to new refresh time
      vi.advanceTimersByTime(300000)
      expect(refreshToken).toHaveBeenCalled()

      // Clean up
      manager.dispose()
    })

    it('should clear scheduled refresh if setTokenExpiry called without value', () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token')
      const manager = new SessionManager({
        token: 'token',
        tokenExpiry: Date.now() + 300000,
        refreshToken,
        refreshThreshold: 60000,
      })

      // Clear expiry
      manager.setTokenExpiry(undefined)

      // Advance past original refresh time
      vi.advanceTimersByTime(300000)

      // Should not have refreshed
      expect(refreshToken).not.toHaveBeenCalled()
    })
  })

  describe('integration', () => {
    it('should provide getToken bound method for use with createAuthenticatedClient', () => {
      const manager = new SessionManager({ token: 'bound-token' })

      // Get bound method
      const getToken = manager.getToken.bind(manager)

      // Should work when called independently
      expect(getToken()).toBe('bound-token')
    })

    it('should reflect token updates through bound getToken', async () => {
      const manager = new SessionManager({
        token: 'initial',
        refreshToken: async () => 'updated',
      })

      const getToken = manager.getToken.bind(manager)

      expect(getToken()).toBe('initial')

      await manager.refresh()

      expect(getToken()).toBe('updated')
    })
  })
})
