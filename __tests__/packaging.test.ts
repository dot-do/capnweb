// Copyright (c) 2026 dot.do
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/**
 * # Every built entry point must be reachable from the published package
 *
 * `@dotdo/capnweb@0.4.0` built `src/hibernatable-ws.ts`, shipped `dist/hibernatable-ws.js` in the
 * tarball, and gave it **no `exports` subpath** — so
 * `import '@dotdo/capnweb/hibernatable-ws'` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` against
 * the real published artifact. The fork's one addition over upstream was unreachable bytes for
 * the whole life of the release, and nothing in the repository noticed.
 *
 * This asserts the general rule rather than that one path: a `tsup` entry that a consumer cannot
 * import is dead weight in every install, and the two lists drift silently because neither tool
 * reads the other.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("package.json", root)), "utf8")) as {
  exports: Record<string, unknown>;
};
const tsup = readFileSync(fileURLToPath(new URL("tsup.config.ts", root)), "utf8");

/** The `entry: [...]` array, read out of the tsup config as source text. */
function tsupEntries(): string[] {
  const match = tsup.match(/entry:\s*\[([^\]]*)\]/);
  if (!match) throw new Error("tsup.config.ts no longer declares `entry: [...]`");
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** `src/hibernatable-ws.ts` -> `./hibernatable-ws`; `src/index.ts` -> `.` */
function subpathFor(entry: string): string {
  const base = entry.replace(/^src\//, "").replace(/\.ts$/, "");
  return base === "index" ? "." : `./${base}`;
}

describe("package exports", () => {
  it("declares a subpath for every built entry point", () => {
    const declared = new Set(Object.keys(pkg.exports));
    const missing = tsupEntries()
      // `index-workers` is not a subpath: it is the `workerd` condition of `.`, and the exports
      // map wires it there. Reaching it by name would bypass the condition that exists to pick it.
      .filter((e) => !e.endsWith("index-workers.ts"))
      .map(subpathFor)
      .filter((s) => !declared.has(s));

    expect(missing).toEqual([]);
  });

  it("keeps ./hibernatable-ws reachable — this fork's only addition over upstream", () => {
    expect(pkg.exports["./hibernatable-ws"]).toBeTruthy();
  });
});
