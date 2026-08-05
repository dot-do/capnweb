// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022', // Transpile using syntax for browser compatibility
  },
  test: {
    globalSetup: ['__tests__/test-server.ts'],
    projects: [
      // Node.js
      {
        test: {
          name: 'node',
          // We throw flow-control test under Node only because it's testing straightforward
          // JavaScript -- no need to run it on every runtime.
          include: ['__tests__/index.test.ts', '__tests__/flow-control.test.ts', '__tests__/packaging.test.ts'],
          environment: 'node',
        },
      },

      // Cloudflare Workers
      {
        test: {
          name: 'workerd',
          include: ['__tests__/index.test.ts', '__tests__/workerd.test.ts', '__tests__/hibernation.test.ts'],
          pool: '@cloudflare/vitest-pool-workers',
          poolOptions: {
            workers: {
              miniflare: {
                compatibilityDate: '2026-02-05',

                // Define a backend worker to test server-side functionality. The tests will
                // talk to it over a service binding. (Only the workerd client tests will talk
                // to this, not Node nor browsers.)
                serviceBindings: {
                  testServer: "test-server-workerd",
                },
                // The hibernation tests drive this Durable Object directly rather than over a
                // service binding: they read its incarnation counter between socket operations,
                // which is the only way to know whether the runtime actually evicted it.
                durableObjects: {
                  HIBERNATION_DO: {
                    className: "HibernationDo",
                    scriptName: "hibernation-workerd",
                  },
                },
                workers: [
                  {
                    name: "test-server-workerd",
                    compatibilityDate: '2026-02-05',
                    modules: [
                      {
                        type: "ESModule",
                        path: "./__tests__/test-server-workerd.js",
                      },
                      {
                        type: "ESModule",
                        path: "./dist/index-workers.js",
                      },
                    ],
                    durableObjects: {
                      TEST_DO: "TestDo"
                    }
                  },
                  {
                    name: "hibernation-workerd",
                    compatibilityDate: '2026-02-05',
                    modules: [
                      {
                        type: "ESModule",
                        path: "./__tests__/hibernation-workerd.js",
                      },
                      {
                        type: "ESModule",
                        path: "./dist/index-workers.js",
                      },
                      {
                        type: "ESModule",
                        path: "./dist/hibernatable-ws.js",
                      },
                    ],
                    durableObjects: {
                      HIBERNATION_DO: "HibernationDo"
                    }
                  }
                ]
              },
            },
          },
        },
      },

      // Browsers which natively support the `using` keyword (Explicit Resource Management).
      {
        test: {
          name: 'browsers-with-using',
          include: ['__tests__/index.test.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            instances: [
              // Currently only Chromium supports this.
              { browser: 'chromium' },
            ],
            headless: true,
            screenshotFailures: false,  // there's nothing to screenshot
          },
        },
      },

      // Browsers with the `using` keyword transpiled to try/catch.
      {
        esbuild: {
          target: 'es2022',
        },
        test: {
          name: 'browsers-without-using',
          include: ['__tests__/index.test.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            instances: [
              // We re-test Chromium in this mode since it's likely users will want to serve the
              // same JavaScript to all browsers, so will have to use this mode until `using`
              // becomes widely available.
              { browser: 'chromium' },
              { browser: 'firefox' },
              { browser: 'webkit' },
            ],
            headless: true,
            screenshotFailures: false,  // there's nothing to screenshot
          },
        },
      },
    ],
  },
})