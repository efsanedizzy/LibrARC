import { getAddress, isAddress, type Address } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_FACTORY_DEPLOYMENT_BLOCK = 54_593_744n;
export const ARC_PUBLIC_ENV_NAMES = [
  "NEXT_PUBLIC_ARC_TESTNET_RPC_URL",
  "NEXT_PUBLIC_ARC_TESTNET_EXPLORER_URL",
  "NEXT_PUBLIC_ARC_FACTORY_ADDRESS",
  "NEXT_PUBLIC_ARC_FEE_VAULT_ADDRESS",
  "NEXT_PUBLIC_ARC_USDC_ADDRESS",
  "NEXT_PUBLIC_ARC_STAGING_ADAPTER_ADDRESS",
  "NEXT_PUBLIC_ARC_EXAMPLE_TOKEN_ADDRESS",
  "NEXT_PUBLIC_ARC_EXAMPLE_POOL_ADDRESS"
] as const;

const VERIFIED_RPC_URL = "https://rpc.testnet.arc.network";
const VERIFIED_EXPLORER_URL = "https://testnet.arcscan.app";
const VERIFIED_FACTORY_ADDRESS = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
const VERIFIED_FEE_VAULT_ADDRESS = getAddress("0x084b9a1a9ad2c46b9d200012dae39b83d5c24b05");
const VERIFIED_USDC_ADDRESS = getAddress("0x3600000000000000000000000000000000000000");
const VERIFIED_STAGING_ADAPTER_ADDRESS = getAddress("0x8f71AB54e51101C2fd04C656572782B2410577d5");
const VERIFIED_EXAMPLE_TOKEN_ADDRESS = getAddress("0x1385964841Fb1Cd3a1f4f553615320D375125290");
const VERIFIED_EXAMPLE_POOL_ADDRESS = getAddress("0xf6F0232b8b4544566AE8C9f3925E655A13556B29");

type ArcPublicEnvironment = Partial<
  Record<(typeof ARC_PUBLIC_ENV_NAMES)[number], string | undefined>
>;

function readPublicUrl(
  env: ArcPublicEnvironment,
  name: (typeof ARC_PUBLIC_ENV_NAMES)[number],
  fallback: string
) {
  const envValue = env[name];

  if (envValue === undefined) {
    return fallback;
  }

  const value = envValue.trim();

  if (!value) {
    throw new Error(`${name} is required and cannot be empty.`);
  }

  try {
    const normalized = new URL(value).toString();

    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function readPublicAddress(
  env: ArcPublicEnvironment,
  name: (typeof ARC_PUBLIC_ENV_NAMES)[number],
  fallback: Address,
  exactAddress?: Address
) {
  const envValue = env[name];
  const value = envValue === undefined ? fallback : envValue.trim();

  if (!value) {
    throw new Error(`${name} is required and cannot be empty.`);
  }

  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  const normalized = getAddress(value);

  if (exactAddress && normalized !== exactAddress) {
    throw new Error(`${name} must match the verified Arc Testnet deployment at ${exactAddress}.`);
  }

  return normalized;
}

export function getArcDeploymentFromEnv(
  env: ArcPublicEnvironment = process.env as ArcPublicEnvironment
) {
  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    rpcUrl: readPublicUrl(env, "NEXT_PUBLIC_ARC_TESTNET_RPC_URL", VERIFIED_RPC_URL),
    explorerUrl: readPublicUrl(env, "NEXT_PUBLIC_ARC_TESTNET_EXPLORER_URL", VERIFIED_EXPLORER_URL),
    factoryAddress: readPublicAddress(
      env,
      "NEXT_PUBLIC_ARC_FACTORY_ADDRESS",
      VERIFIED_FACTORY_ADDRESS,
      VERIFIED_FACTORY_ADDRESS
    ),
    feeVaultAddress: readPublicAddress(
      env,
      "NEXT_PUBLIC_ARC_FEE_VAULT_ADDRESS",
      VERIFIED_FEE_VAULT_ADDRESS
    ),
    usdcAddress: readPublicAddress(env, "NEXT_PUBLIC_ARC_USDC_ADDRESS", VERIFIED_USDC_ADDRESS),
    stagingAdapterAddress: readPublicAddress(
      env,
      "NEXT_PUBLIC_ARC_STAGING_ADAPTER_ADDRESS",
      VERIFIED_STAGING_ADAPTER_ADDRESS
    ),
    exampleTokenAddress: readPublicAddress(
      env,
      "NEXT_PUBLIC_ARC_EXAMPLE_TOKEN_ADDRESS",
      VERIFIED_EXAMPLE_TOKEN_ADDRESS
    ),
    examplePoolAddress: readPublicAddress(
      env,
      "NEXT_PUBLIC_ARC_EXAMPLE_POOL_ADDRESS",
      VERIFIED_EXAMPLE_POOL_ADDRESS
    )
  } as const;
}

export const arcDeployment = getArcDeploymentFromEnv();

export function parseAddress(value: string) {
  return isAddress(value) ? getAddress(value) : null;
}
