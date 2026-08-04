import { type NextRequest } from "next/server";

import { arcDeployment } from "../../../../../lib/arc/config";
import {
  ensureAddress,
  jsonNoStore,
  loadArcTokenRouteData,
  NO_STORE_HEADERS,
  serializeCurveState,
  toBigIntString
} from "../../../../../lib/arc/server-routes";
import { type ArcTokenApiError, type ArcTokenApiSuccess } from "../../../../../lib/arc/token-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = ensureAddress(address, "token");
    const walletAddressValue = request.nextUrl.searchParams.get("wallet");
    const walletAddress = walletAddressValue
      ? ensureAddress(walletAddressValue, "wallet")
      : undefined;

    const data = await loadArcTokenRouteData({
      tokenAddress,
      walletAddress
    });

    const response: ArcTokenApiSuccess = {
      ok: true,
      about: {
        creator: data.creator,
        description: data.description,
        discord: data.discord,
        image: data.image,
        launchId: data.launchId === undefined ? undefined : toBigIntString(data.launchId),
        marketCap: data.marketCap === undefined ? undefined : toBigIntString(data.marketCap),
        metadataHash: data.metadataHash,
        metadataUri: data.metadataUri,
        telegram: data.telegram,
        website: data.website,
        x: data.x
      },
      token: {
        address: tokenAddress,
        name: data.tokenName,
        symbol: data.tokenSymbol,
        decimals: data.tokenDecimals,
        totalSupply: toBigIntString(data.tokenTotalSupply)
      },
      pool: {
        address: data.poolAddress,
        launchToken: tokenAddress,
        quoteAsset: arcDeployment.usdcAddress,
        factory: data.poolFactory,
        feeVault: data.poolFeeVault,
        status: data.poolStatus,
        statusLabel: data.statusLabel,
        canBuy: data.poolCanBuy,
        canSell: data.poolCanSell,
        buysPaused: data.poolBuysPaused,
        allTradingPaused: data.poolAllTradingPaused,
        curveState: serializeCurveState(data.poolCurveState),
        remainingGraduationCapacity: toBigIntString(data.remainingGraduationCapacity),
        graduationProgress: data.graduationProgress
      },
      deployment: {
        factoryAddress: arcDeployment.factoryAddress,
        feeVaultAddress: arcDeployment.feeVaultAddress,
        usdcAddress: arcDeployment.usdcAddress,
        stagingAdapterAddress: arcDeployment.stagingAdapterAddress,
        launchCount: data.launchCount === undefined ? undefined : toBigIntString(data.launchCount),
        paused: data.paused,
        feeVault: data.feeVault,
        liquidityAdapter: data.liquidityAdapter,
        liquidityRecipient: data.liquidityRecipient,
        treasury: data.treasury
      },
      wallet: walletAddress
        ? {
            address: walletAddress,
            tokenBalance:
              data.tokenBalance === undefined ? undefined : toBigIntString(data.tokenBalance),
            tokenAllowanceToPool:
              data.tokenAllowanceToPool === undefined
                ? undefined
                : toBigIntString(data.tokenAllowanceToPool),
            usdcBalance:
              data.usdcBalance === undefined ? undefined : toBigIntString(data.usdcBalance),
            usdcAllowanceToPool:
              data.usdcAllowanceToPool === undefined
                ? undefined
                : toBigIntString(data.usdcAllowanceToPool)
          }
        : undefined,
      warnings: data.warnings
    };

    return Response.json(response, {
      headers: NO_STORE_HEADERS,
      status: 200
    });
  } catch (error) {
    const failure = error as {
      code: ArcTokenApiError["code"];
      details: ArcTokenApiError["details"];
      message: string;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      } satisfies ArcTokenApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to reach the Arc Testnet token route.",
      details: [
        {
          label: "Token route",
          message: error instanceof Error ? error.message : "Route execution failed."
        }
      ]
    } satisfies ArcTokenApiError);
  }
}
