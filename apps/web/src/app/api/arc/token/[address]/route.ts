import { NextResponse, type NextRequest } from "next/server";
import { BaseError, zeroAddress, type Address } from "viem";

import {
  erc20Abi,
  feeVaultAbi,
  launchFactoryAbi,
  launchPoolAbi,
  librarcTokenAbi
} from "../../../../../lib/arc/abis";
import { arcDeployment, parseAddress } from "../../../../../lib/arc/config";
import { getGraduationPercentage, getPoolStatusLabel } from "../../../../../lib/arc/format";
import { getArcTestnetServerPublicClient } from "../../../../../lib/arc/server-client";
import {
  type ArcTokenApiError,
  type ArcTokenApiErrorCode,
  type ArcTokenApiSuccess,
  type ArcTokenReadIssue
} from "../../../../../lib/arc/token-api";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0"
} as const;

const RETRY_DELAYS_MS = [0, 200, 450] as const;

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

type RouteFailure = {
  code: ArcTokenApiErrorCode;
  details: ArcTokenReadIssue[];
  message: string;
  status: number;
};

function jsonError(status: number, error: ArcTokenApiError) {
  return NextResponse.json(error, {
    headers: NO_STORE_HEADERS,
    status
  });
}

function toRouteFailure({ code, details, message, status }: RouteFailure): RouteFailure {
  return {
    code,
    details,
    message,
    status
  };
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BaseError) {
    return error.shortMessage || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

function isTransportFailure(error: unknown) {
  const message = toErrorMessage(error, "").toLowerCase();

  return [
    "fetch failed",
    "failed to fetch",
    "http request failed",
    "timed out",
    "timeout",
    "network",
    "socket",
    "econn",
    "enotfound"
  ].some((fragment) => message.includes(fragment));
}

function toReadIssue(label: string, error: unknown): ArcTokenReadIssue {
  return {
    label,
    message: toErrorMessage(error, "Contract read failed.")
  };
}

function toReadFailure(label: string, error: unknown): RouteFailure {
  return toRouteFailure({
    code: isTransportFailure(error) ? "RPC_UNAVAILABLE" : "CONTRACT_READ_FAILED",
    details: [toReadIssue(label, error)],
    message: isTransportFailure(error)
      ? "Arc Testnet RPC is temporarily unavailable."
      : "A required Arc Testnet contract read failed.",
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

async function readWithRetry<T>(label: string, read: () => Promise<T>) {
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

async function optionalRead<T>(label: string, read: () => Promise<T>) {
  try {
    const value = await readWithRetry(label, read);

    return { value, warning: null as ArcTokenReadIssue | null };
  } catch (error) {
    const failure = error as RouteFailure;

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

function toBigIntString(value: bigint) {
  return value.toString(10);
}

function toAddressOrUndefined(value: Address | undefined) {
  return value === undefined ? undefined : value;
}

function ensureAddress(value: string | null, fieldName: string) {
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = ensureAddress(address, "token");
    const walletAddressValue = request.nextUrl.searchParams.get("wallet");
    const walletAddress = walletAddressValue ? ensureAddress(walletAddressValue, "wallet") : null;
    const client = getArcTestnetServerPublicClient();

    const isRegistered = await readWithRetry("Factory isLibrarcToken()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "isLibrarcToken",
        args: [tokenAddress]
      })
    );

    if (!isRegistered) {
      return jsonError(404, {
        ok: false,
        code: "TOKEN_NOT_REGISTERED",
        message: "This token address is not registered in the active Arc Testnet LaunchFactory.",
        details: [
          {
            label: "Factory isLibrarcToken()",
            message: `The factory explicitly returned false for ${tokenAddress}.`
          }
        ]
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
      return jsonError(409, {
        ok: false,
        code: "POOL_NOT_RESOLVED",
        message:
          "The token is registered, but the factory returned the zero address for poolByToken().",
        details: [
          {
            label: "Factory poolByToken()",
            message: "The factory returned the zero address instead of a LaunchPool."
          }
        ]
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
      return jsonError(409, {
        ok: false,
        code: "POOL_NOT_REGISTERED",
        message:
          "The resolved pool address is not registered in the active Arc Testnet LaunchFactory.",
        details: [
          {
            label: "Factory isLibrarcPool()",
            message: `The factory explicitly returned false for ${poolAddress}.`
          }
        ]
      });
    }

    const [
      tokenName,
      tokenSymbol,
      tokenDecimals,
      tokenTotalSupply,
      poolLaunchToken,
      poolQuoteAsset,
      poolFactory,
      poolFeeVault,
      poolStatus,
      poolCanBuy,
      poolCanSell,
      poolBuysPaused,
      poolAllTradingPaused,
      poolCurveState,
      remainingGraduationCapacity
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
      readWithRetry("Token decimals()", () =>
        client.readContract({
          address: tokenAddress,
          abi: librarcTokenAbi,
          functionName: "decimals"
        })
      ),
      readWithRetry("Token totalSupply()", () =>
        client.readContract({
          address: tokenAddress,
          abi: librarcTokenAbi,
          functionName: "totalSupply"
        })
      ),
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
      )
    ]);

    const warnings: ArcTokenReadIssue[] = [];

    const [
      launchCountResult,
      pausedResult,
      feeVaultResult,
      liquidityAdapterResult,
      liquidityRecipientResult,
      treasuryResult,
      walletTokenBalanceResult,
      walletUsdcBalanceResult,
      walletUsdcAllowanceResult
    ] = await Promise.all([
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

    for (const warning of [
      launchCountResult.warning,
      pausedResult.warning,
      feeVaultResult.warning,
      liquidityAdapterResult.warning,
      liquidityRecipientResult.warning,
      treasuryResult.warning,
      walletTokenBalanceResult.warning,
      walletUsdcBalanceResult.warning,
      walletUsdcAllowanceResult.warning
    ]) {
      if (warning) {
        warnings.push(warning);
      }
    }

    const response: ArcTokenApiSuccess = {
      ok: true,
      token: {
        address: tokenAddress,
        name: tokenName,
        symbol: tokenSymbol,
        decimals: Number(tokenDecimals),
        totalSupply: toBigIntString(tokenTotalSupply)
      },
      pool: {
        address: poolAddress,
        launchToken: poolLaunchToken,
        quoteAsset: poolQuoteAsset,
        factory: poolFactory,
        feeVault: poolFeeVault,
        status: Number(poolStatus),
        statusLabel: getPoolStatusLabel(poolStatus),
        canBuy: poolCanBuy,
        canSell: poolCanSell,
        buysPaused: poolBuysPaused,
        allTradingPaused: poolAllTradingPaused,
        curveState: {
          realUsdcReserve: toBigIntString(poolCurveState.realUsdcReserve),
          realTokenReserve: toBigIntString(poolCurveState.realTokenReserve),
          virtualUsdcReserve: toBigIntString(poolCurveState.virtualUsdcReserve),
          virtualTokenReserve: toBigIntString(poolCurveState.virtualTokenReserve),
          accruedProtocolFees: toBigIntString(poolCurveState.accruedProtocolFees)
        },
        remainingGraduationCapacity: toBigIntString(remainingGraduationCapacity),
        graduationProgress: getGraduationPercentage(
          poolCurveState.realUsdcReserve,
          remainingGraduationCapacity
        )
      },
      deployment: {
        factoryAddress: arcDeployment.factoryAddress,
        feeVaultAddress: arcDeployment.feeVaultAddress,
        usdcAddress: arcDeployment.usdcAddress,
        stagingAdapterAddress: arcDeployment.stagingAdapterAddress,
        launchCount:
          launchCountResult.value === undefined
            ? undefined
            : toBigIntString(launchCountResult.value),
        paused: pausedResult.value,
        feeVault: toAddressOrUndefined(feeVaultResult.value),
        liquidityAdapter: toAddressOrUndefined(liquidityAdapterResult.value),
        liquidityRecipient: toAddressOrUndefined(liquidityRecipientResult.value),
        treasury: toAddressOrUndefined(treasuryResult.value)
      },
      wallet: walletAddress
        ? {
            address: walletAddress,
            tokenBalance:
              walletTokenBalanceResult.value === undefined
                ? undefined
                : toBigIntString(walletTokenBalanceResult.value),
            usdcBalance:
              walletUsdcBalanceResult.value === undefined
                ? undefined
                : toBigIntString(walletUsdcBalanceResult.value),
            usdcAllowanceToPool:
              walletUsdcAllowanceResult.value === undefined
                ? undefined
                : toBigIntString(walletUsdcAllowanceResult.value)
          }
        : undefined,
      warnings
    };

    return NextResponse.json(response, {
      headers: NO_STORE_HEADERS,
      status: 200
    });
  } catch (error) {
    const failure = error as RouteFailure;

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonError(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      });
    }

    return jsonError(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to reach the Arc Testnet token route.",
      details: [toReadIssue("Token route", error)]
    });
  }
}
