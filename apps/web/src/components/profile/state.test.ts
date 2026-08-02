import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { buildProfileRequestKey, resolveProfileWalletState } from "./state";

const walletAddress = getAddress("0x1111111111111111111111111111111111111111");

test("disconnected-wallet state is resolved without a fake profile address", () => {
  assert.deepEqual(
    resolveProfileWalletState({
      isConnected: false
    }),
    {
      mode: "disconnected"
    }
  );
});

test("connected-wallet state preserves the dynamic browser wallet address", () => {
  assert.deepEqual(
    resolveProfileWalletState({
      address: walletAddress,
      chainId: 5042002,
      isConnected: true
    }),
    {
      mode: "connected",
      address: walletAddress,
      isWrongNetwork: false
    }
  );
});

test("invalid wallet addresses resolve to the invalid-wallet profile state", () => {
  assert.deepEqual(
    resolveProfileWalletState({
      address: "not-an-address",
      chainId: 5042002,
      isConnected: true
    }),
    {
      mode: "invalid-wallet",
      rawAddress: "not-an-address"
    }
  );
});

test("account-change refetch behavior is keyed by the connected wallet address", () => {
  const firstWallet = getAddress("0x1111111111111111111111111111111111111111");
  const secondWallet = getAddress("0x2222222222222222222222222222222222222222");

  assert.notEqual(
    buildProfileRequestKey({
      walletAddress: firstWallet,
      page: 1,
      limit: 12,
      sort: "newest"
    }),
    buildProfileRequestKey({
      walletAddress: secondWallet,
      page: 1,
      limit: 12,
      sort: "newest"
    })
  );
});
