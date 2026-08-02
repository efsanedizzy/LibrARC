import "server-only";

import {
  createPublicClient,
  fallback,
  http,
  type HttpTransportConfig,
  type PublicClient
} from "viem";

import { arcTestnet } from "../chains/arc-testnet";
import { isArcRpcTransportFailure } from "./rpc-errors";

const DEFAULT_ARC_TESTNET_RPC_URLS = [
  "https://rpc.testnet.arc.network",
  "https://rpc.drpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network"
] as const;
export const ARC_SERVER_RPC_ENV_NAMES = [
  "ARC_TESTNET_RPC_URL",
  "ARC_TESTNET_RPC_FALLBACK_URL_1",
  "ARC_TESTNET_RPC_FALLBACK_URL_2",
  "ARC_TESTNET_RPC_FALLBACK_URL_3"
] as const;

export const ARC_SERVER_RPC_TIMEOUT_MS = 8_000;
export const ARC_SERVER_RPC_RETRY_COUNT = 2;
export const ARC_SERVER_RPC_RETRY_DELAY_MS = 250;
export const ARC_SERVER_FALLBACK_RETRY_COUNT = 0;
export const ARC_SERVER_FALLBACK_RETRY_DELAY_MS = 200;

type ArcServerRpcEnvironment = Partial<
  Record<(typeof ARC_SERVER_RPC_ENV_NAMES)[number], string | undefined>
>;

let cachedRpcSignature: string | null = null;
let cachedClient: PublicClient | null = null;

function normalizeRpcUrl(value: string, fallbackUrl: string) {
  try {
    const normalized = new URL(value).toString();

    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return fallbackUrl;
  }
}

function getConfiguredRpcUrl(value: string | undefined, fallbackUrl: string) {
  const configuredUrl = value?.trim();

  if (!configuredUrl) {
    return fallbackUrl;
  }

  return normalizeRpcUrl(configuredUrl, fallbackUrl);
}

export function getArcTestnetServerRpcUrls(
  env: ArcServerRpcEnvironment = process.env as ArcServerRpcEnvironment
) {
  const configuredUrls = [
    getConfiguredRpcUrl(env.ARC_TESTNET_RPC_URL, DEFAULT_ARC_TESTNET_RPC_URLS[0]),
    getConfiguredRpcUrl(env.ARC_TESTNET_RPC_FALLBACK_URL_1, DEFAULT_ARC_TESTNET_RPC_URLS[1]),
    getConfiguredRpcUrl(env.ARC_TESTNET_RPC_FALLBACK_URL_2, DEFAULT_ARC_TESTNET_RPC_URLS[2]),
    getConfiguredRpcUrl(env.ARC_TESTNET_RPC_FALLBACK_URL_3, DEFAULT_ARC_TESTNET_RPC_URLS[3])
  ];

  return configuredUrls.filter((url, index) => configuredUrls.indexOf(url) === index);
}

export function buildArcTestnetServerHttpTransports(
  rpcUrls: readonly string[],
  options: {
    fetchFns?: ReadonlyArray<HttpTransportConfig["fetchFn"] | undefined>;
  } = {}
) {
  return rpcUrls.map((rpcUrl, index) =>
    http(rpcUrl, {
      fetchFn: options.fetchFns?.[index],
      key: `arc-testnet-server-rpc-${index + 1}`,
      name: `Arc Testnet Server RPC ${index + 1}`,
      retryCount: ARC_SERVER_RPC_RETRY_COUNT,
      retryDelay: ARC_SERVER_RPC_RETRY_DELAY_MS,
      timeout: ARC_SERVER_RPC_TIMEOUT_MS
    })
  );
}

export function createArcTestnetServerPublicClient({
  fetchFns,
  rpcUrls = getArcTestnetServerRpcUrls()
}: {
  fetchFns?: ReadonlyArray<HttpTransportConfig["fetchFn"] | undefined>;
  rpcUrls?: readonly string[];
} = {}) {
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(buildArcTestnetServerHttpTransports(rpcUrls, { fetchFns }), {
      key: "arc-testnet-server-fallback",
      name: "Arc Testnet Server RPC Fallback",
      retryCount: ARC_SERVER_FALLBACK_RETRY_COUNT,
      retryDelay: ARC_SERVER_FALLBACK_RETRY_DELAY_MS,
      shouldThrow: (error) => !isArcRpcTransportFailure(error)
    })
  });
}

export function getArcTestnetServerPublicClient() {
  const rpcUrls = getArcTestnetServerRpcUrls();
  const rpcSignature = rpcUrls.join("|");

  if (!cachedClient || cachedRpcSignature !== rpcSignature) {
    cachedRpcSignature = rpcSignature;
    cachedClient = createArcTestnetServerPublicClient({ rpcUrls });
  }

  return cachedClient;
}
