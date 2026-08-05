// Copyright (c) 2026 dot.do
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

// The Durable Object under test for `__tests__/hibernation.test.ts`.
//
// This file exists to answer ONE question that this repository has never asked in a test:
// **does a capnweb RPC session survive a Durable Object hibernation cycle?**
//
// `src/hibernatable-ws.ts` is 235 lines with zero tests, and its own `@example` block teaches
// exactly the pattern implemented below — a `TransportRegistry` held on the Durable Object
// instance, with only the transport *id* written into the WebSocket attachment. That pattern is
// the thing under test; it is not an endorsement of it.
//
// Written as JavaScript rather than TypeScript for the same reason `test-server-workerd.js` is:
// the worker modules are handed to miniflare as raw ES modules in `vitest.config.ts`, with no
// build step of their own.

import { DurableObject } from "cloudflare:workers";
import { RpcSession, RpcTarget } from "../dist/index-workers.js";
import { HibernatableWebSocketTransport, TransportRegistry } from "../dist/hibernatable-ws.js";

/** The RPC interface the client acquires a stub for. */
class SessionApi extends RpcTarget {
  #host;

  constructor(host) {
    super();
    this.#host = host;
  }

  /** A trivially cheap round trip. If this answers, the session is alive. */
  ping() {
    return "pong";
  }

  /**
   * Which JS incarnation of the Durable Object is answering.
   *
   * This is the observable that makes "did it hibernate" a fact rather than a guess: the counter
   * is incremented in the constructor and persisted, so incarnation 2 answering means the class
   * was constructed a second time over the same Durable Object id — which is precisely what a
   * wake from hibernation is.
   */
  incarnation() {
    return this.#host.incarnation;
  }
}

export class HibernationDo extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);

    /** In-memory, per-incarnation, and that is the whole point. */
    this.registry = new TransportRegistry();

    /** Messages that arrived for a transport id the registry did not hold. */
    this.drops = 0;

    ctx.blockConcurrencyWhile(async () => {
      const n = ((await ctx.storage.get("incarnations")) ?? 0) + 1;
      await ctx.storage.put("incarnations", n);
      this.incarnation = n;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/stats") {
      // Deliberately reports from persisted state as well as memory, so a caller can tell an
      // empty registry on a fresh incarnation from an empty registry on the original one.
      return Response.json({
        incarnation: this.incarnation,
        registrySize: this.registry.size,
        drops: this.drops,
        sockets: this.ctx.getWebSockets().length,
        persistedDrops: (await this.ctx.storage.get("drops")) ?? 0,
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // The hibernation API. Note that `accept()` is NOT called — that is what distinguishes a
    // hibernatable socket from a normal one, and calling both is an error.
    this.ctx.acceptWebSocket(server);

    const transport = new HibernatableWebSocketTransport(server);
    this.registry.register(transport);

    // Only the id survives. The transport itself is a live JS object and is not serializable.
    server.serializeAttachment({ transportId: transport.id });

    new RpcSession(transport, new SessionApi(this));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment();
    const transport = attachment && this.registry.get(attachment.transportId);

    if (transport && typeof message === "string") {
      transport.enqueueMessage(message);
      return;
    }

    // The failure mode under test: the lookup misses and the message goes nowhere. No error is
    // raised, the socket is not closed, and the client is told nothing. We count it here only so
    // the test can observe from outside what production would never see.
    this.drops += 1;
    await this.ctx.storage.put("drops", ((await this.ctx.storage.get("drops")) ?? 0) + 1);
  }

  async webSocketClose(ws, code, reason) {
    const attachment = ws.deserializeAttachment();
    const transport = attachment && this.registry.get(attachment.transportId);
    transport?.handleClose(code, reason);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const name = url.searchParams.get("do") ?? "default";
    return env.HIBERNATION_DO.get(env.HIBERNATION_DO.idFromName(name)).fetch(request);
  },
};
