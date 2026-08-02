import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { simulateCreateLaunchTransaction } from "./launch-server";

test("server launch simulation uses only the public simulation path and never signs", async () => {
  let called = false;

  const result = await simulateCreateLaunchTransaction(
    {
      account: getAddress("0x1111111111111111111111111111111111111111"),
      name: "Arc Nova",
      symbol: "ARCN",
      metadataUri: "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D"
    },
    {
      simulateContract: (async () => {
        called = true;

        return {
          request: {},
          result: [
            getAddress("0x2222222222222222222222222222222222222222"),
            getAddress("0x3333333333333333333333333333333333333333"),
            7n
          ]
        };
      }) as never
    }
  );

  assert.equal(called, true);
  assert.equal(result.request.functionName, "createLaunch");
  assert.equal(result.simulation.launchId, 7n);
});
