import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import {
  buildTokenAboutActions,
  copyTokenAddressWithFeedback,
  getTokenAddressCopyPresentation,
  getTokenAddressDisplay,
  TOKEN_ADDRESS_COPY_RESET_MS,
  type TokenAddressCopyStatus
} from "./token-address-copy";

const tokenAddress = getAddress("0x1385964841Fb1Cd3a1f4f553615320D375125290");

test("token and pool actions stay as explorer links while contract copies the canonical token address", () => {
  const actions = buildTokenAboutActions({
    contractCopyStatus: "idle",
    creatorExplorerUrl:
      "https://testnet.arcscan.app/address/0x3333333333333333333333333333333333333333",
    poolExplorerUrl:
      "https://testnet.arcscan.app/address/0xf6F0232b8b4544566AE8C9f3925E655A13556B29",
    tokenAddress,
    tokenExplorerUrl: `https://testnet.arcscan.app/address/${tokenAddress}`
  });
  const tokenAction = actions.find((action) => action.key === "token");
  const poolAction = actions.find((action) => action.key === "pool");
  const contractAction = actions.find((action) => action.key === "contract");
  const display = getTokenAddressDisplay(tokenAddress);

  assert.deepEqual(tokenAction, {
    href: `https://testnet.arcscan.app/address/${tokenAddress}`,
    key: "token",
    kind: "link",
    label: "Token"
  });
  assert.deepEqual(poolAction, {
    href: "https://testnet.arcscan.app/address/0xf6F0232b8b4544566AE8C9f3925E655A13556B29",
    key: "pool",
    kind: "link",
    label: "Pool"
  });
  assert.ok(contractAction && contractAction.kind === "copy");
  assert.equal(contractAction?.address, tokenAddress);
  assert.equal(display.title, tokenAddress);
  assert.notEqual(display.compactAddress, tokenAddress);
});

test("successful contract-address copies use the canonical address and reset after the timeout", async () => {
  const copiedValues: string[] = [];
  const statuses: TokenAddressCopyStatus[] = [];
  let scheduledReset: (() => void) | undefined;

  const result = await copyTokenAddressWithFeedback({
    address: tokenAddress.toLowerCase(),
    navigatorRef: {
      clipboard: {
        writeText: async (value) => {
          copiedValues.push(value);
        }
      }
    },
    onStatusChange: (status) => {
      statuses.push(status);
    },
    scheduleReset: (callback, delayMs) => {
      assert.equal(delayMs, TOKEN_ADDRESS_COPY_RESET_MS);
      scheduledReset = callback;
      return { id: "timer" };
    }
  });

  assert.equal(result.attempted, true);
  assert.equal(result.copiedAddress, tokenAddress);
  assert.equal(result.status, "copied");
  assert.deepEqual(copiedValues, [tokenAddress]);
  assert.deepEqual(statuses, ["copied"]);
  assert.equal(getTokenAddressCopyPresentation(result.status).pillLabel, "Copied");

  scheduledReset?.();

  assert.deepEqual(statuses, ["copied", "idle"]);
  assert.equal(getTokenAddressCopyPresentation("idle").pillLabel, "Contract");
});

test("clipboard failures surface a non-blocking copy error before resetting", async () => {
  const statuses: TokenAddressCopyStatus[] = [];
  let scheduledReset: (() => void) | undefined;

  const result = await copyTokenAddressWithFeedback({
    address: tokenAddress,
    navigatorRef: {
      clipboard: {
        writeText: async () => {
          throw new Error("permission denied");
        }
      }
    },
    onStatusChange: (status) => {
      statuses.push(status);
    },
    scheduleReset: (callback) => {
      scheduledReset = callback;
      return { id: "timer" };
    }
  });

  assert.equal(result.attempted, true);
  assert.equal(result.status, "error");
  assert.deepEqual(statuses, ["error"]);
  assert.equal(
    getTokenAddressCopyPresentation(result.status).liveMessage,
    "Could not copy address"
  );

  scheduledReset?.();

  assert.deepEqual(statuses, ["error", "idle"]);
});

test("invalid or missing addresses never attempt clipboard access", async () => {
  let writeAttempts = 0;

  const result = await copyTokenAddressWithFeedback({
    address: "not-an-address",
    navigatorRef: {
      clipboard: {
        writeText: async () => {
          writeAttempts += 1;
        }
      }
    },
    onStatusChange: () => {
      throw new Error("status should not change for an invalid address");
    }
  });

  assert.equal(result.attempted, false);
  assert.equal(result.copiedAddress, null);
  assert.equal(result.nextResetHandle, null);
  assert.equal(writeAttempts, 0);
});

test("the textarea fallback removes temporary nodes immediately and restores focus", async () => {
  const appendedNodes: unknown[] = [];
  const removedNodes: unknown[] = [];
  let focused = 0;
  let selected = 0;
  let execCommandCalls = 0;

  await copyTokenAddressWithFeedback({
    address: tokenAddress,
    documentRef: {
      activeElement: {
        focus: () => {
          focused += 1;
        }
      },
      body: {
        appendChild(node) {
          appendedNodes.push(node);
        },
        removeChild(node) {
          removedNodes.push(node);
        }
      },
      createElement() {
        return {
          readOnly: false,
          select() {
            selected += 1;
          },
          setAttribute() {
            // Test-only DOM stub.
          },
          style: {},
          value: ""
        };
      },
      execCommand(command) {
        execCommandCalls += 1;
        return command === "copy";
      }
    },
    navigatorRef: {},
    onStatusChange: () => {
      // The copy result itself is asserted below.
    },
    scheduleReset: () => null
  });

  assert.equal(appendedNodes.length, 1);
  assert.equal(removedNodes.length, 1);
  assert.equal(appendedNodes[0], removedNodes[0]);
  assert.equal(selected, 1);
  assert.equal(execCommandCalls, 1);
  assert.equal(focused, 1);
});
