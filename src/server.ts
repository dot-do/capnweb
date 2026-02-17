// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit
//
// Server-only entry point for @dotdo/capnweb
// Use this in Durable Objects and Workers where you only need to handle incoming RPC requests.
// This excludes client-side session initiators for smaller bundle size.

import { RpcTarget as RpcTargetImpl, RpcStub as RpcStubImpl } from "./core.js";
import { serialize, deserialize } from "./serialize.js";
import { RpcTransport, RpcSession as RpcSessionImpl, RpcSessionOptions } from "./rpc.js";
import { RpcTargetBranded, RpcCompatible, Stub, __RPC_TARGET_BRAND } from "./types.js";
import { newWorkersWebSocketRpcResponse } from "./websocket.js";
import { newHttpBatchRpcResponse, nodeHttpBatchRpcResponse } from "./batch.js";
import { forceInitMap } from "./map.js";

forceInitMap();

// Re-export serialization utilities
export { serialize, deserialize };

// Re-export server response handlers
export { newWorkersWebSocketRpcResponse, newHttpBatchRpcResponse, nodeHttpBatchRpcResponse };

// Re-export types
export type { RpcTransport, RpcSessionOptions, RpcCompatible };

/**
 * Represents a reference to a remote object, on which methods may be remotely invoked via RPC.
 * (Server-side: used for receiving stubs from clients)
 */
export type RpcStub<T extends RpcCompatible<T>> = Stub<T>;
export const RpcStub: {
  new <T extends RpcCompatible<T>>(value: T): RpcStub<T>;
} = <any>RpcStubImpl;

/**
 * Use to construct an `RpcSession` on top of a custom `RpcTransport`.
 * (Server-side: for handling custom transports like HibernatableWebSocketTransport)
 */
export interface RpcSession<T extends RpcCompatible<T> = undefined> {
  getRemoteMain(): RpcStub<T>;
  getStats(): {imports: number, exports: number};
  drain(): Promise<void>;
}
export const RpcSession: {
  new <T extends RpcCompatible<T> = undefined>(
      transport: RpcTransport, localMain?: any, options?: RpcSessionOptions): RpcSession<T>;
} = <any>RpcSessionImpl;

/**
 * Classes which are intended to be passed by reference and called over RPC must extend
 * `RpcTarget`. A class which does not extend `RpcTarget` (and which doesn't have built-in support
 * from the RPC system) cannot be passed in an RPC message at all; an exception will be thrown.
 */
export interface RpcTarget extends RpcTargetBranded {};
export const RpcTarget: {
  new(): RpcTarget;
} = RpcTargetImpl;

/**
 * Implements unified handling of HTTP-batch and WebSocket responses for the Cloudflare Workers
 * Runtime.
 *
 * SECURITY WARNING: This function accepts cross-origin requests. If you do not want this, you
 * should validate the `Origin` header before calling this, or use `newHttpBatchRpcSession()` and
 * `newWebSocketRpcSession()` directly with appropriate security measures for each type of request.
 */
export async function newWorkersRpcResponse(request: Request, localMain: any) {
  if (request.method === "POST") {
    let response = await newHttpBatchRpcResponse(request, localMain);
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } else if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    return newWorkersWebSocketRpcResponse(request, localMain);
  } else {
    return new Response("This endpoint only accepts POST or WebSocket requests.", { status: 400 });
  }
}

// Re-export hibernatable WebSocket transport for DO hibernation API
export { HibernatableWebSocketTransport, TransportRegistry } from "./hibernatable-ws.js";
export type { PendingReceive } from "./hibernatable-ws.js";
