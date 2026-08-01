import assert from "node:assert/strict";
import test from "node:test";

import { ContractFunctionRevertedError } from "viem";

import { readWithRetry } from "./server-routes";

test("deterministic contract reverts remain CONTRACT_READ_FAILED without transport retries", async () => {
  let attempts = 0;
  const revertError = new ContractFunctionRevertedError({
    abi: [],
    functionName: "quoteBuy",
    message: "execution reverted"
  });

  await assert.rejects(
    async () =>
      readWithRetry("Pool quoteBuy()", async () => {
        attempts += 1;
        throw revertError;
      }),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "code" in error ? error.code : undefined,
        "CONTRACT_READ_FAILED"
      );
      assert.equal(
        error && typeof error === "object" && "status" in error ? error.status : undefined,
        502
      );

      return true;
    }
  );

  assert.equal(attempts, 1);
});
