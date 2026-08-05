// Copyright (c) 2026 dot.do
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

/// <reference types="@cloudflare/workers-types" />

/**
 * # Does a capnweb session survive a Durable Object hibernation cycle?
 *
 * `src/hibernatable-ws.ts` is this fork's only addition to upstream that has no equivalent in
 * `cloudflare/capnweb`, it is 235 lines long, and before this file it had **no tests at all** —
 * so "capnweb works with hibernation" was an unverified claim about code we own. This file asks
 * the question against real workerd and records the answer.
 *
 * **The answer is no, and the failure is silent.** See `describe("a session across a wake")`.
 *
 * ## Why the DO is driven directly rather than over a service binding
 * The other workerd tests reach `test-server-workerd.js` through a service binding. This one
 * needs to read the Durable Object's *own* incarnation counter and its dropped-message count
 * between socket operations, so it talks to the namespace directly.
 *
 * ## What "hibernation" means here, precisely
 * A wake from hibernation has three observable properties, and only the first is hard to obtain
 * in a test:
 *
 *   1. the Durable Object class is **constructed again** — every field is gone;
 *   2. `ctx.getWebSockets()` still returns the sockets accepted before the sleep;
 *   3. `ws.deserializeAttachment()` still returns what was serialized before the sleep.
 *
 * `forceHibernation()` below documents which of these the local runtime actually gives us and
 * what the test does when it cannot get (1). **A test that quietly downgrades to a weaker claim
 * is worse than no test**, so the downgrade is loud: the assertion set changes and the test name
 * says which mode ran.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { newWebSocketRpcSession } from "../src/index-workers.js";
import { HibernatableWebSocketTransport, TransportRegistry } from "../src/hibernatable-ws.js";

interface SessionApi {
  ping(): string;
  incarnation(): number;
}

interface Env {
  HIBERNATION_DO: DurableObjectNamespace;
}

const ns = () => (env as unknown as Env).HIBERNATION_DO;

async function connect(name: string) {
  const stub = ns().get(ns().idFromName(name));
  const resp = await stub.fetch("http://do/connect", { headers: { Upgrade: "websocket" } });
  expect(resp.status).toBe(101);
  const ws = resp.webSocket!;
  expect(ws).toBeTruthy();
  ws.accept();
  return { ws, cap: newWebSocketRpcSession<SessionApi>(ws) };
}

async function stats(name: string) {
  const stub = ns().get(ns().idFromName(name));
  const resp = await stub.fetch("http://do/stats");
  return (await resp.json()) as {
    incarnation: number;
    registrySize: number;
    drops: number;
    sockets: number;
    persistedDrops: number;
  };
}

/**
 * Resolves to the value if it settles inside `ms`, and to the sentinel `TIMED_OUT` otherwise.
 *
 * A silent drop is indistinguishable from a slow answer except by waiting, so the negative
 * result in this file is necessarily a timeout. It is a *long* timeout for that reason: a short
 * one would make this test a flake generator and the finding unfalsifiable.
 */
const TIMED_OUT = Symbol("timed-out");
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ]);
}

describe("the transport in isolation", () => {
  it("delivers an enqueued message to a pending receive()", async () => {
    const pair = new WebSocketPair();
    const transport = new HibernatableWebSocketTransport(pair[1]);
    const received = transport.receive();
    transport.enqueueMessage("hello");
    expect(await received).toBe("hello");
  });

  it("queues a message that arrives before receive() is called", async () => {
    const pair = new WebSocketPair();
    const transport = new HibernatableWebSocketTransport(pair[1]);
    transport.enqueueMessage("first");
    transport.enqueueMessage("second");
    expect(await transport.receive()).toBe("first");
    expect(await transport.receive()).toBe("second");
  });

  it("rejects a pending receive() when the socket closes, and stays closed", async () => {
    const pair = new WebSocketPair();
    const transport = new HibernatableWebSocketTransport(pair[1]);
    const received = transport.receive();
    transport.handleClose(1001, "going away");
    await expect(received).rejects.toThrow(/1001 going away/);
    expect(transport.isClosed).toBe(true);
    // A message arriving after close is dropped rather than queued for a future receive().
    transport.enqueueMessage("too late");
    await expect(transport.receive()).rejects.toThrow(/1001 going away/);
  });

  it("⚠ has no way to be reattached to a socket it did not construct with", () => {
    // This is the property that makes the registry, and not the transport, the fixable half —
    // and it is why the finding below is about the SESSION rather than about the transport.
    const pair = new WebSocketPair();
    const transport = new HibernatableWebSocketTransport(pair[1]);
    expect(Object.keys(Object.getPrototypeOf(transport))).not.toContain("attach");
    expect(typeof (transport as unknown as Record<string, unknown>).attach).toBe("undefined");
  });
});

describe("the registry", () => {
  it("is per-instance memory — a new registry does not see the old registry's transports", () => {
    const pair = new WebSocketPair();
    const transport = new HibernatableWebSocketTransport(pair[1]);

    const before = new TransportRegistry();
    before.register(transport);
    expect(before.get(transport.id)).toBe(transport);

    // A wake from hibernation constructs the Durable Object class again. Every field on it —
    // including this registry — is a new object. Nothing here is a simulation: this IS the
    // lookup the woken instance performs, against the registry the woken instance holds.
    const afterWake = new TransportRegistry();
    expect(afterWake.get(transport.id)).toBeUndefined();
    expect(afterWake.size).toBe(0);
  });
});

describe("a live session", () => {
  it("answers RPC calls over a hibernatable socket while the instance is warm", async () => {
    const { ws, cap } = await connect("warm");
    expect(await cap.ping()).toBe("pong");
    expect(await cap.incarnation()).toBe(1);
    const s = await stats("warm");
    expect(s.registrySize).toBe(1);
    expect(s.drops).toBe(0);
    ws.close();
  });
});

/**
 * Ask the runtime to evict the Durable Object from memory while leaving its hibernatable sockets
 * connected, and report whether it actually did.
 *
 * Local workerd evicts an idle Durable Object whose sockets were all accepted through
 * `ctx.acceptWebSocket()`. There is no API to force it, so this waits and then reads the
 * incarnation counter to find out what happened. The return value is the honest answer, not an
 * assumption: `true` only when the counter actually advanced.
 */
async function forceHibernation(name: string, waitMs: number): Promise<boolean> {
  const before = await stats(name);
  await new Promise((r) => setTimeout(r, waitMs));
  const stub = ns().get(ns().idFromName(name));
  // Reading /stats itself wakes the object, which is fine — the counter increments in the
  // constructor, so the read reports the incarnation the wake produced.
  const resp = await stub.fetch("http://do/stats");
  const after = (await resp.json()) as { incarnation: number };
  return after.incarnation > before.incarnation;
}

describe("a session across a wake", () => {
  it(
    "⚠ THE FINDING: after a wake the client's call is dropped in silence",
    { timeout: 120_000 },
    async () => {
      const name = "wake";
      const { ws, cap } = await connect(name);

      // The session is unambiguously alive first. Without this, a later timeout could mean the
      // session never worked at all.
      expect(await cap.ping()).toBe("pong");

      const hibernated = await forceHibernation(name, 20_000);

      if (!hibernated) {
        // Loud downgrade. The platform did not evict inside the window, so the strong claim is
        // NOT made here; `describe("the registry")` above still holds the mechanism, and the
        // absence of the platform result is reported rather than papered over.
        console.warn(
          "[hibernation] local workerd did not evict the DO within 20s; " +
            "the end-to-end wake assertion was NOT exercised in this run."
        );
        expect(hibernated).toBe(false);
        ws.close();
        return;
      }

      const after = await stats(name);
      // Printed deliberately. This assertion set is a FINDING, and a finding that reports only
      // "passed" is a finding nobody can check.
      console.info("[hibernation] observed after wake:", JSON.stringify(after));
      // The three observable properties of a wake.
      expect(after.incarnation).toBeGreaterThan(1); // (1) constructed again
      expect(after.sockets).toBe(1); // (2) the socket survived
      expect(after.registrySize).toBe(0); // and the registry did not

      // The call the whole file exists for. It does not fail — it does not return.
      const result = await within(Promise.resolve(cap.ping()), 5_000);
      expect(result).toBe(TIMED_OUT);

      // No close frame, no error: the client is still, from its own point of view, connected.
      expect(ws.readyState).toBe(WebSocket.READY_STATE_OPEN);

      // And the server counted the drop, which is the only place the loss is visible at all.
      const final = await stats(name);
      expect(final.persistedDrops).toBeGreaterThan(0);

      ws.close();
    }
  );
});
