import assert from "node:assert/strict";
import test from "node:test";

import { getChatPanelMode, mergeTokenChatMessages } from "./ui-state";

test("chat ui mode resolves disconnected, signed-out, wrong-chain, and authenticated states", () => {
  assert.equal(
    getChatPanelMode({
      authenticated: false,
      available: true,
      isConnected: false,
      isWrongChain: false
    }),
    "connect-wallet"
  );
  assert.equal(
    getChatPanelMode({
      authenticated: false,
      available: true,
      isConnected: true,
      isWrongChain: true
    }),
    "switch-network"
  );
  assert.equal(
    getChatPanelMode({
      authenticated: false,
      available: true,
      isConnected: true,
      isWrongChain: false
    }),
    "sign-in"
  );
  assert.equal(
    getChatPanelMode({
      authenticated: true,
      available: true,
      isConnected: true,
      isWrongChain: false
    }),
    "authenticated"
  );
});

test("chat message refreshes merge without duplicates", () => {
  const merged = mergeTokenChatMessages(
    [
      {
        body: "First",
        createdAt: "2026-08-03T12:00:00.000Z",
        id: "1",
        walletAddress: "0x1385964841Fb1Cd3a1f4f553615320D375125290"
      }
    ],
    [
      {
        body: "First",
        createdAt: "2026-08-03T12:00:00.000Z",
        id: "1",
        walletAddress: "0x1385964841Fb1Cd3a1f4f553615320D375125290"
      },
      {
        body: "Second",
        createdAt: "2026-08-03T12:01:00.000Z",
        id: "2",
        walletAddress: "0xf6F0232b8b4544566AE8C9f3925E655A13556B29"
      }
    ]
  );

  assert.deepEqual(
    merged.map((message) => message.id),
    ["1", "2"]
  );
});
