import assert from "node:assert/strict";
import test from "node:test";

import { readArcHealthStatus } from "./health";

test("health status returns bigint-safe JSON without exposing an RPC url", async () => {
  const result = await readArcHealthStatus({
    getBlockNumber: async () => 54_593_744n
  });

  assert.equal(result.ok, true);
  assert.equal(result.rpcAvailable, true);

  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("rpc.testnet.arc.network"), false);
  assert.equal(serialized.includes("https://"), false);

  if (result.ok) {
    assert.equal(result.latestBlock, "54593744");
  }
});

test("server rpc failures map to a structured runtime error", async () => {
  const result = await readArcHealthStatus({
    getBlockNumber: async () => {
      throw new Error("RPC Request failed: 503 Service Unavailable");
    }
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.code, "RPC_UNAVAILABLE");
    assert.equal(result.rpcAvailable, false);
    assert.equal(result.message, "Arc Testnet RPC is temporarily unavailable.");
    assert.equal(result.details[0]?.label, "Arc Testnet RPC");
    assert.equal(JSON.stringify(result).includes("rpc.testnet.arc.network"), false);
  }
});
