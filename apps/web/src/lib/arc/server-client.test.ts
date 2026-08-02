import assert from "node:assert/strict";
import test from "node:test";

import { arcTestnet } from "../chains/arc-testnet";
import {
  ARC_SERVER_RPC_RETRY_COUNT,
  ARC_SERVER_RPC_RETRY_DELAY_MS,
  ARC_SERVER_RPC_TIMEOUT_MS,
  buildArcTestnetServerHttpTransports,
  createArcTestnetServerPublicClient,
  getArcTestnetServerRpcUrls
} from "./server-client";

function createJsonRpcResponse(result: unknown) {
  return new Response(JSON.stringify({ id: 1, jsonrpc: "2.0", result }), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}

test("keeps the configured primary RPC first and appends official Arc fallbacks in order", () => {
  const urls = getArcTestnetServerRpcUrls({
    ARC_TESTNET_RPC_FALLBACK_URL_1: "https://rpc.drpc.testnet.arc.network",
    ARC_TESTNET_RPC_FALLBACK_URL_2: "https://rpc.quicknode.testnet.arc.network",
    ARC_TESTNET_RPC_FALLBACK_URL_3: "https://rpc.blockdaemon.testnet.arc.network",
    ARC_TESTNET_RPC_URL: "https://custom.arc.example/rpc"
  });

  assert.deepEqual(urls, [
    "https://custom.arc.example/rpc",
    "https://rpc.drpc.testnet.arc.network",
    "https://rpc.quicknode.testnet.arc.network",
    "https://rpc.blockdaemon.testnet.arc.network"
  ]);
});

test("builds HTTP transports with finite timeout, retries, and unique keys", () => {
  const transports = buildArcTestnetServerHttpTransports([
    "https://rpc.testnet.arc.network",
    "https://rpc.drpc.testnet.arc.network"
  ]);
  const configs = transports.map((transport) => transport({ chain: arcTestnet }).config);

  assert.deepEqual(
    configs.map(({ key }) => key),
    ["arc-testnet-server-rpc-1", "arc-testnet-server-rpc-2"]
  );
  assert.deepEqual(
    configs.map(({ name }) => name),
    ["Arc Testnet Server RPC 1", "Arc Testnet Server RPC 2"]
  );

  for (const config of configs) {
    assert.equal(config.retryCount, ARC_SERVER_RPC_RETRY_COUNT);
    assert.equal(config.retryDelay, ARC_SERVER_RPC_RETRY_DELAY_MS);
    assert.equal(config.timeout, ARC_SERVER_RPC_TIMEOUT_MS);
  }
});

test("uses the primary RPC when it succeeds", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const client = createArcTestnetServerPublicClient({
    fetchFns: [
      async () => {
        primaryCalls += 1;

        return createJsonRpcResponse("0x1");
      },
      async () => {
        fallbackCalls += 1;

        return createJsonRpcResponse("0x2");
      }
    ],
    rpcUrls: ["https://rpc.testnet.arc.network", "https://rpc.drpc.testnet.arc.network"]
  });

  assert.equal(await client.getBlockNumber(), 1n);
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
});

test("falls back to the next Arc RPC when the primary transport fails", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const client = createArcTestnetServerPublicClient({
    fetchFns: [
      async () => {
        primaryCalls += 1;
        throw new Error("RPC Request failed: 503 Service Unavailable");
      },
      async () => {
        fallbackCalls += 1;

        return createJsonRpcResponse("0x2");
      }
    ],
    rpcUrls: ["https://rpc.testnet.arc.network", "https://rpc.drpc.testnet.arc.network"]
  });

  assert.equal(await client.getBlockNumber(), 2n);
  assert.equal(primaryCalls, ARC_SERVER_RPC_RETRY_COUNT + 1);
  assert.equal(fallbackCalls, 1);
});

test("throws when every configured Arc RPC provider is unavailable", async () => {
  const client = createArcTestnetServerPublicClient({
    fetchFns: [
      async () => {
        throw new Error("RPC Request failed: 503 Service Unavailable");
      },
      async () => {
        throw new Error("RPC Request failed: 504 Gateway Timeout");
      }
    ],
    rpcUrls: ["https://rpc.testnet.arc.network", "https://rpc.drpc.testnet.arc.network"]
  });

  await assert.rejects(() => client.getBlockNumber());
});

test("creates a public client without wallet or signing capabilities", () => {
  const client = createArcTestnetServerPublicClient({
    rpcUrls: ["https://rpc.testnet.arc.network"]
  });

  assert.equal(client.account, undefined);
  assert.equal("sendTransaction" in client, false);
  assert.equal("signMessage" in client, false);
});
