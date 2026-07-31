import "server-only";

import { createPublicClient, http, type PublicClient } from "viem";

import { arcTestnet } from "../chains/arc-testnet";

const VERIFIED_ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";

let cachedRpcUrl: string | null = null;
let cachedClient: PublicClient | null = null;

function normalizeRpcUrl(value: string) {
  try {
    const normalized = new URL(value).toString();

    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return VERIFIED_ARC_TESTNET_RPC_URL;
  }
}

function getArcTestnetServerRpcUrl() {
  const configuredUrl = process.env.ARC_TESTNET_RPC_URL?.trim();

  if (!configuredUrl) {
    return VERIFIED_ARC_TESTNET_RPC_URL;
  }

  return normalizeRpcUrl(configuredUrl);
}

export function getArcTestnetServerPublicClient() {
  const rpcUrl = getArcTestnetServerRpcUrl();

  if (!cachedClient || cachedRpcUrl !== rpcUrl) {
    cachedRpcUrl = rpcUrl;
    cachedClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl, {
        retryCount: 2,
        retryDelay: 150,
        timeout: 10_000
      })
    });
  }

  return cachedClient;
}
