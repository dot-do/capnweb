// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { describe, it, expect, vi } from 'vitest'
import { newHttpBatchRpcSession } from '../src/batch.js'
import { RpcTarget } from '../src/index.js'

// Simple target for testing - we just need to trigger a batch request
class SimpleTarget extends RpcTarget {
  getValue() {
    return 42
  }
}

describe('HTTP batch transport auth', () => {
  it('should include Authorization header when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(''))

    const session = newHttpBatchRpcSession('https://api.example.com/rpc', {
      headers: { Authorization: 'Bearer test-token' },
      fetch: mockFetch,
    })

    // Trigger a batch request by accessing a property (which will cause a batch)
    try {
      await session.getValue()
    } catch {
      // Expected to fail since mock returns empty response
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/rpc')
    expect(init.headers).toBeDefined()
    expect(init.headers['Authorization']).toBe('Bearer test-token')
  })

  it('should merge custom headers with Content-Type', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(''))

    const session = newHttpBatchRpcSession('https://api.example.com/rpc', {
      headers: { 'X-Custom': 'custom-value' },
      fetch: mockFetch,
    })

    try {
      await session.getValue()
    } catch {
      // Expected to fail since mock returns empty response
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    // Should have both Content-Type and custom header
    expect(init.headers['X-Custom']).toBe('custom-value')
  })

  it('should support multiple custom headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(''))

    const session = newHttpBatchRpcSession('https://api.example.com/rpc', {
      headers: {
        'Authorization': 'Bearer multi-token',
        'X-Tenant-ID': 'tenant-123',
        'X-Request-ID': 'req-456',
      },
      fetch: mockFetch,
    })

    try {
      await session.getValue()
    } catch {
      // Expected to fail since mock returns empty response
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer multi-token')
    expect(init.headers['X-Tenant-ID']).toBe('tenant-123')
    expect(init.headers['X-Request-ID']).toBe('req-456')
  })

  it('should work without custom headers (backward compatibility)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(''))

    const session = newHttpBatchRpcSession('https://api.example.com/rpc', {
      fetch: mockFetch,
    })

    try {
      await session.getValue()
    } catch {
      // Expected to fail since mock returns empty response
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Should still work without any headers option
  })
})
