import "server-only";

import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Address,
  type Hex
} from "viem";
import { NextResponse } from "next/server";

import { erc20Abi, feeVaultAbi, launchFactoryAbi, launchPoolAbi, librarcTokenAbi } from "./abis";
import { ARC_FACTORY_DEPLOYMENT_BLOCK, arcDeployment, parseAddress } from "./config";
import { getGraduationPercentage, getPoolStatusLabel } from "./format";
import { isArcRpcTransportFailure, toArcRpcErrorMessage } from "./rpc-errors";
import { getArcTestnetServerPublicClient } from "./server-client";
import { DecimalParseError, MAX_DECIMAL_INPUT_LENGTH, parseDecimalAmount } from "./trading";
import { type ArcTokenApiErrorCode, type ArcTokenReadIssue } from "./token-api";
import { type ArcSerializedCurveState, type ArcTradeApiErrorCode } from "./trade-api";
import { parseLaunchMetadataUri } from "./launch-metadata";

export const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0"
} as const;

const RETRY_DELAYS_MS = [0, 200, 450] as const;

export type ArcRouteErrorCode = ArcTokenApiErrorCode | ArcTradeApiErrorCode;

export type ArcRouteFailure = {
  code: ArcRouteErrorCode;
  details: ArcTokenReadIssue[];
  message: string;
  revert?: {
    args?: unknown[];
    errorName?: string;
    message: string;
    reason?: string;
    signature?: string;
  };
  status: number;
};

export type CanonicalTradeContext = {
  poolAddress: Address;
  tokenAddress: Address;
  tokenDecimals: number;
  walletAddress?: Address;
};

export type ArcTokenRouteContext = CanonicalTradeContext & {
  creator?: Address;
  description?: string;
  discord?: string;
  launchCount?: bigint;
  launchId?: bigint;
  marketCap?: bigint;
  metadataHash?: Hex;
  metadataUri?: string;
  paused?: boolean;
  feeVault?: Address;
  image?: string;
  liquidityAdapter?: Address;
  liquidityRecipient?: Address;
  telegram?: string;
  treasury?: Address;
  tokenBalance?: bigint;
  tokenAllowanceToPool?: bigint;
  usdcBalance?: bigint;
  usdcAllowanceToPool?: bigint;
  website?: string;
  tokenName: string;
  tokenSymbol: string;
  tokenTotalSupply: bigint;
  x?: string;
  poolCanBuy: boolean;
  poolCanSell: boolean;
  poolBuysPaused: boolean;
  poolAllTradingPaused: boolean;
  poolCurveState: {
    realUsdcReserve: bigint;
    realTokenReserve: bigint;
    virtualUsdcReserve: bigint;
    virtualTokenReserve: bigint;
    accruedProtocolFees: bigint;
  };
  poolFactory: Address;
  poolFeeVault: Address;
  poolStatus: number;
  poolQuoteAsset: Address;
  remainingGraduationCapacity: bigint;
};

const ROUTE_LOG_BLOCK_RANGE = 10_000n;
const ROUTE_LOG_BLOCK_CHUNK_SIZE = ROUTE_LOG_BLOCK_RANGE - 1n;
const launchCreatedEvent = launchFactoryAbi.find(
  (entry) => entry.type === "event" && entry.name === "LaunchCreated"
);

if (!launchCreatedEvent || launchCreatedEvent.type !== "event") {
  throw new Error("LaunchCreated event is missing from the LaunchFactory ABI.");
}

type LaunchCreatedRouteLog = {
  args?: {
    creator?: Address;
    launchId?: bigint;
    launchPool?: Address;
    launchToken?: Address;
    metadataHash?: Hex;
    metadataUri?: string;
  };
  blockNumber?: bigint | null;
};

function toErrorMessage(error: unknown, fallback: string) {
  return toArcRpcErrorMessage(error, fallback);
}

function isTransportFailure(error: unknown) {
  return isArcRpcTransportFailure(error);
}

export function jsonNoStore<T>(status: number, body: T) {
  return NextResponse.json(body, {
    headers: NO_STORE_HEADERS,
    status
  });
}

export function ensureAddress(value: string | null, fieldName: string) {
  const address = value ? parseAddress(value) : null;

  if (!address) {
    throw toRouteFailure({
      code: "INVALID_ADDRESS",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be a valid EVM address.`
        }
      ],
      message: `${fieldName} must be a valid EVM address.`,
      status: 400
    });
  }

  return address;
}

export function toRouteFailure(failure: ArcRouteFailure) {
  return failure;
}

export function toReadIssue(label: string, error: unknown): ArcTokenReadIssue {
  return {
    label,
    message: toErrorMessage(error, "Contract read failed.")
  };
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString(10);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        serializeValue(item)
      ])
    );
  }

  return value;
}

export function getDecodedRevert(error: unknown) {
  if (!(error instanceof BaseError)) {
    return null;
  }

  const revertedError = error.walk(
    (walkError) => walkError instanceof ContractFunctionRevertedError
  );

  if (!(revertedError instanceof ContractFunctionRevertedError)) {
    return null;
  }

  return {
    args: revertedError.data?.args
      ? (serializeValue(revertedError.data.args) as unknown[])
      : undefined,
    errorName: revertedError.data?.errorName,
    message: revertedError.shortMessage,
    reason: revertedError.reason,
    signature: revertedError.signature
  };
}

export function toReadFailure(label: string, error: unknown): ArcRouteFailure {
  return toRouteFailure({
    code: isTransportFailure(error) ? "RPC_UNAVAILABLE" : "CONTRACT_READ_FAILED",
    details: [toReadIssue(label, error)],
    message: isTransportFailure(error)
      ? "Arc Testnet RPC is temporarily unavailable."
      : "A required Arc Testnet contract read failed.",
    revert: getDecodedRevert(error) ?? undefined,
    status: isTransportFailure(error) ? 503 : 502
  });
}

async function delay(ms: number) {
  if (ms === 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function readWithRetry<T>(label: string, read: () => Promise<T>) {
  let lastError: unknown;

  for (const retryDelay of RETRY_DELAYS_MS) {
    try {
      return await read();
    } catch (error) {
      lastError = error;

      if (
        !isTransportFailure(error) ||
        retryDelay === RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      ) {
        break;
      }

      await delay(retryDelay);
    }
  }

  throw toReadFailure(label, lastError);
}

export async function optionalRead<T>(label: string, read: () => Promise<T>) {
  try {
    const value = await readWithRetry(label, read);

    return { value, warning: null as ArcTokenReadIssue | null };
  } catch (error) {
    const failure = error as ArcRouteFailure;

    return {
      value: undefined,
      warning:
        failure.details[0] ??
        ({
          label,
          message: "Contract read failed."
        } satisfies ArcTokenReadIssue)
    };
  }
}

export function toBigIntString(value: bigint) {
  return value.toString(10);
}

function getRouteChunkToBlock({
  chunkStart,
  latestBlock
}: {
  chunkStart: bigint;
  latestBlock: bigint;
}) {
  const candidate = chunkStart + ROUTE_LOG_BLOCK_CHUNK_SIZE;

  return candidate > latestBlock ? latestBlock : candidate;
}

export function serializeCurveState(state: {
  accruedProtocolFees: bigint;
  realTokenReserve: bigint;
  realUsdcReserve: bigint;
  virtualTokenReserve: bigint;
  virtualUsdcReserve: bigint;
}): ArcSerializedCurveState {
  return {
    realUsdcReserve: toBigIntString(state.realUsdcReserve),
    realTokenReserve: toBigIntString(state.realTokenReserve),
    virtualUsdcReserve: toBigIntString(state.virtualUsdcReserve),
    virtualTokenReserve: toBigIntString(state.virtualTokenReserve),
    accruedProtocolFees: toBigIntString(state.accruedProtocolFees)
  };
}

export function parseAmountFromRequest(
  value: unknown,
  {
    decimals,
    fieldName
  }: {
    decimals: number;
    fieldName: string;
  }
) {
  if (typeof value !== "string") {
    throw toRouteFailure({
      code: "INVALID_AMOUNT",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be provided as a decimal string.`
        }
      ],
      message: `${fieldName} must be provided as a decimal string.`,
      status: 400
    });
  }

  if (value.length > MAX_DECIMAL_INPUT_LENGTH) {
    throw toRouteFailure({
      code: "INPUT_TOO_LARGE",
      details: [
        {
          label: fieldName,
          message: `${fieldName} is too long.`
        }
      ],
      message: `${fieldName} is too long.`,
      status: 400
    });
  }

  try {
    return parseDecimalAmount(value, decimals, fieldName);
  } catch (error) {
    if (error instanceof DecimalParseError) {
      throw toRouteFailure({
        code: error.code === "INPUT_TOO_LONG" ? "INPUT_TOO_LARGE" : "INVALID_AMOUNT",
        details: [
          {
            label: fieldName,
            message: error.message
          }
        ],
        message: error.message,
        status: 400
      });
    }

    throw error;
  }
}

export function parseUnsignedIntegerString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw toRouteFailure({
      code: "INVALID_REQUEST",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be provided as a decimal-string integer.`
        }
      ],
      message: `${fieldName} must be provided as a decimal-string integer.`,
      status: 400
    });
  }

  if (!/^\d+$/.test(value)) {
    throw toRouteFailure({
      code: "INVALID_REQUEST",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be an unsigned integer string.`
        }
      ],
      message: `${fieldName} must be an unsigned integer string.`,
      status: 400
    });
  }

  return BigInt(value);
}

export function ensurePositiveIntegerAmount(value: bigint, fieldName: string) {
  if (value <= 0n) {
    throw toRouteFailure({
      code: "INVALID_AMOUNT",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be greater than zero.`
        }
      ],
      message: `${fieldName} must be greater than zero.`,
      status: 400
    });
  }

  return value;
}

export async function resolveCanonicalTradeContext({
  tokenAddress,
  walletAddress
}: {
  tokenAddress: Address;
  walletAddress?: Address;
}) {
  const client = getArcTestnetServerPublicClient();

  const isRegisteredToken = await readWithRetry("Factory isLibrarcToken()", () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      functionName: "isLibrarcToken",
      args: [tokenAddress]
    })
  );

  if (!isRegisteredToken) {
    throw toRouteFailure({
      code: "TOKEN_NOT_REGISTERED",
      details: [
        {
          label: "Factory isLibrarcToken()",
          message: `The factory explicitly returned false for ${tokenAddress}.`
        }
      ],
      message: "This token address is not registered in the active Arc Testnet LaunchFactory.",
      status: 404
    });
  }

  const poolAddress = await readWithRetry("Factory poolByToken()", () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      functionName: "poolByToken",
      args: [tokenAddress]
    })
  );

  if (poolAddress === zeroAddress) {
    throw toRouteFailure({
      code: "POOL_NOT_RESOLVED",
      details: [
        {
          label: "Factory poolByToken()",
          message: "The factory returned the zero address instead of a LaunchPool."
        }
      ],
      message:
        "The token is registered, but the factory returned the zero address for poolByToken().",
      status: 409
    });
  }

  const isRegisteredPool = await readWithRetry("Factory isLibrarcPool()", () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      functionName: "isLibrarcPool",
      args: [poolAddress]
    })
  );

  if (!isRegisteredPool) {
    throw toRouteFailure({
      code: "POOL_NOT_REGISTERED",
      details: [
        {
          label: "Factory isLibrarcPool()",
          message: `The factory explicitly returned false for ${poolAddress}.`
        }
      ],
      message:
        "The resolved pool address is not registered in the active Arc Testnet LaunchFactory.",
      status: 409
    });
  }

  const [poolLaunchToken, poolQuoteAsset, tokenDecimals] = await Promise.all([
    readWithRetry("Pool launchToken()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "launchToken"
      })
    ),
    readWithRetry("Pool quoteAsset()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "quoteAsset"
      })
    ),
    readWithRetry("Token decimals()", () =>
      client.readContract({
        address: tokenAddress,
        abi: librarcTokenAbi,
        functionName: "decimals"
      })
    )
  ]);

  if (poolLaunchToken !== tokenAddress) {
    throw toRouteFailure({
      code: "POOL_TOKEN_MISMATCH",
      details: [
        {
          label: "Pool launchToken()",
          message: `The resolved pool reports ${poolLaunchToken} instead of ${tokenAddress}.`
        }
      ],
      message: "The resolved pool does not match the requested token.",
      status: 409
    });
  }

  if (poolQuoteAsset !== arcDeployment.usdcAddress) {
    throw toRouteFailure({
      code: "INVALID_QUOTE_ASSET",
      details: [
        {
          label: "Pool quoteAsset()",
          message: `The resolved pool reports ${poolQuoteAsset} instead of ${arcDeployment.usdcAddress}.`
        }
      ],
      message: "The resolved pool is not paired with the verified Arc USDC contract.",
      status: 409
    });
  }

  return {
    client,
    poolAddress,
    tokenAddress,
    tokenDecimals: Number(tokenDecimals),
    walletAddress
  };
}

export async function loadArcTokenRouteData({
  tokenAddress,
  walletAddress
}: {
  tokenAddress: Address;
  walletAddress?: Address;
}) {
  const context = await resolveCanonicalTradeContext({ tokenAddress, walletAddress });
  const { client, poolAddress } = context;
  const latestBlockResult = await optionalRead("Arc latest block", () => client.getBlockNumber());
  let creator: Address | undefined;
  let description: string | undefined;
  let discord: string | undefined;
  let image: string | undefined;
  let launchId: bigint | undefined;
  let marketCap: bigint | undefined;
  let metadataHash: Hex | undefined;
  let metadataUri: string | undefined;
  let telegram: string | undefined;
  let website: string | undefined;
  let x: string | undefined;

  if (
    latestBlockResult.value !== undefined &&
    latestBlockResult.value >= ARC_FACTORY_DEPLOYMENT_BLOCK
  ) {
    let chunkStart = ARC_FACTORY_DEPLOYMENT_BLOCK;

    while (chunkStart <= latestBlockResult.value) {
      const toBlock = getRouteChunkToBlock({
        chunkStart,
        latestBlock: latestBlockResult.value
      });
      const launchLogsResult = await optionalRead(
        `Factory LaunchCreated logs ${chunkStart}-${toBlock}`,
        () =>
          client.getLogs({
            address: arcDeployment.factoryAddress,
            event: launchCreatedEvent,
            args: {
              launchToken: tokenAddress
            },
            fromBlock: chunkStart,
            toBlock
          })
      );

      if (launchLogsResult.warning) {
        latestBlockResult.warning = latestBlockResult.warning ?? launchLogsResult.warning;
      }

      const matchingLog = (launchLogsResult.value as LaunchCreatedRouteLog[] | undefined)?.find(
        (log) =>
          log.args?.launchToken === tokenAddress &&
          log.args.launchPool === poolAddress &&
          log.args.creator !== undefined
      );

      if (matchingLog?.args) {
        creator = matchingLog.args.creator;
        launchId = matchingLog.args.launchId;
        metadataHash = matchingLog.args.metadataHash;
        metadataUri = matchingLog.args.metadataUri;

        if (metadataUri) {
          const parsedMetadata = parseLaunchMetadataUri(metadataUri);

          description = parsedMetadata.description;
          discord = parsedMetadata.discord;
          image = parsedMetadata.image;
          telegram = parsedMetadata.telegram;
          website = parsedMetadata.website;
          x = parsedMetadata.x;
        }

        break;
      }

      if (toBlock === latestBlockResult.value) {
        break;
      }

      chunkStart = toBlock + 1n;
    }
  }

  const [
    tokenName,
    tokenSymbol,
    tokenTotalSupply,
    poolFactory,
    poolFeeVault,
    poolStatus,
    poolCanBuy,
    poolCanSell,
    poolBuysPaused,
    poolAllTradingPaused,
    poolCurveState,
    remainingGraduationCapacity,
    launchCountResult,
    pausedResult,
    feeVaultResult,
    liquidityAdapterResult,
    liquidityRecipientResult,
    treasuryResult,
    tokenBalanceResult,
    tokenAllowanceResult,
    usdcBalanceResult,
    usdcAllowanceResult
  ] = await Promise.all([
    readWithRetry("Token name()", () =>
      client.readContract({
        address: tokenAddress,
        abi: librarcTokenAbi,
        functionName: "name"
      })
    ),
    readWithRetry("Token symbol()", () =>
      client.readContract({
        address: tokenAddress,
        abi: librarcTokenAbi,
        functionName: "symbol"
      })
    ),
    readWithRetry("Token totalSupply()", () =>
      client.readContract({
        address: tokenAddress,
        abi: librarcTokenAbi,
        functionName: "totalSupply"
      })
    ),
    readWithRetry("Pool factory()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "factory"
      })
    ),
    readWithRetry("Pool feeVault()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "feeVault"
      })
    ),
    readWithRetry("Pool status()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "status"
      })
    ),
    readWithRetry("Pool canBuy()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "canBuy"
      })
    ),
    readWithRetry("Pool canSell()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "canSell"
      })
    ),
    readWithRetry("Pool buysPaused()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "buysPaused"
      })
    ),
    readWithRetry("Pool allTradingPaused()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "allTradingPaused"
      })
    ),
    readWithRetry("Pool curveState()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "curveState"
      })
    ),
    readWithRetry("Pool remainingGraduationCapacity()", () =>
      client.readContract({
        address: poolAddress,
        abi: launchPoolAbi,
        functionName: "remainingGraduationCapacity"
      })
    ),
    optionalRead("Factory launchCount()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "launchCount"
      })
    ),
    optionalRead("Factory paused()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "paused"
      })
    ),
    optionalRead("Factory feeVault()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "feeVault"
      })
    ),
    optionalRead("Factory liquidityAdapter()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "liquidityAdapter"
      })
    ),
    optionalRead("Factory liquidityRecipient()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "liquidityRecipient"
      })
    ),
    optionalRead("FeeVault treasury()", () =>
      client.readContract({
        address: arcDeployment.feeVaultAddress,
        abi: feeVaultAbi,
        functionName: "treasury"
      })
    ),
    walletAddress
      ? optionalRead("Wallet token balanceOf()", () =>
          client.readContract({
            address: tokenAddress,
            abi: librarcTokenAbi,
            functionName: "balanceOf",
            args: [walletAddress]
          })
        )
      : Promise.resolve({ value: undefined, warning: null }),
    walletAddress
      ? optionalRead("Token allowance()", () =>
          client.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [walletAddress, poolAddress]
          })
        )
      : Promise.resolve({ value: undefined, warning: null }),
    walletAddress
      ? optionalRead("USDC balanceOf()", () =>
          client.readContract({
            address: arcDeployment.usdcAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress]
          })
        )
      : Promise.resolve({ value: undefined, warning: null }),
    walletAddress
      ? optionalRead("USDC allowance()", () =>
          client.readContract({
            address: arcDeployment.usdcAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [walletAddress, poolAddress]
          })
        )
      : Promise.resolve({ value: undefined, warning: null })
  ]);

  const warnings: ArcTokenReadIssue[] = [];

  for (const warning of [
    latestBlockResult.warning,
    launchCountResult.warning,
    pausedResult.warning,
    feeVaultResult.warning,
    liquidityAdapterResult.warning,
    liquidityRecipientResult.warning,
    treasuryResult.warning,
    tokenBalanceResult.warning,
    tokenAllowanceResult.warning,
    usdcBalanceResult.warning,
    usdcAllowanceResult.warning
  ]) {
    if (warning) {
      warnings.push(warning);
    }
  }

  if (
    tokenTotalSupply !== undefined &&
    poolCurveState.realUsdcReserve !== undefined &&
    poolCurveState.realTokenReserve !== undefined &&
    poolCurveState.virtualUsdcReserve !== undefined &&
    poolCurveState.virtualTokenReserve !== undefined
  ) {
    const effectiveUsdcReserve = poolCurveState.realUsdcReserve + poolCurveState.virtualUsdcReserve;
    const effectiveTokenReserve =
      poolCurveState.realTokenReserve + poolCurveState.virtualTokenReserve;

    if (effectiveTokenReserve > 0n) {
      marketCap = (tokenTotalSupply * effectiveUsdcReserve) / effectiveTokenReserve;
    }
  }

  return {
    ...context,
    creator,
    description,
    discord,
    launchCount: launchCountResult.value,
    launchId,
    marketCap,
    metadataHash,
    metadataUri,
    paused: pausedResult.value,
    feeVault: feeVaultResult.value,
    image,
    liquidityAdapter: liquidityAdapterResult.value,
    liquidityRecipient: liquidityRecipientResult.value,
    telegram,
    treasury: treasuryResult.value,
    tokenBalance: tokenBalanceResult.value,
    tokenAllowanceToPool: tokenAllowanceResult.value,
    usdcBalance: usdcBalanceResult.value,
    usdcAllowanceToPool: usdcAllowanceResult.value,
    website,
    tokenName,
    tokenSymbol,
    tokenTotalSupply,
    x,
    poolFactory,
    poolFeeVault,
    poolStatus: Number(poolStatus),
    poolCanBuy,
    poolCanSell,
    poolBuysPaused,
    poolAllTradingPaused,
    poolCurveState,
    remainingGraduationCapacity,
    warnings,
    statusLabel: getPoolStatusLabel(poolStatus),
    graduationProgress: getGraduationPercentage(
      poolCurveState.realUsdcReserve,
      remainingGraduationCapacity
    )
  };
}

export function getSimulationFailure(
  error: unknown,
  fallbackLabel: string,
  fallbackMessage: string
) {
  const revert = getDecodedRevert(error);

  return toRouteFailure({
    code: revert
      ? "SIMULATION_REVERTED"
      : isTransportFailure(error)
        ? "RPC_UNAVAILABLE"
        : "CONTRACT_READ_FAILED",
    details: [toReadIssue(fallbackLabel, error)],
    message: revert?.reason || revert?.message || fallbackMessage,
    revert: revert ?? undefined,
    status: revert ? 409 : isTransportFailure(error) ? 503 : 502
  });
}

export function asHexString(value: string) {
  return value as Hex;
}
