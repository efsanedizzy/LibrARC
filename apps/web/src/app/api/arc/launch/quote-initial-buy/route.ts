import { type NextRequest } from "next/server";

import {
  LaunchInitialBuyQuoteError,
  quoteInitialLaunchPurchase
} from "../../../../../lib/arc/launch-server";
import {
  ensureAddress,
  jsonNoStore,
  parseAmountFromRequest,
  serializeCurveState
} from "../../../../../lib/arc/server-routes";
import {
  type ArcLaunchApiError,
  type ArcLaunchInitialBuyQuoteResponse,
  type ArcLaunchInitialBuyQuoteSuccess
} from "../../../../../lib/arc/launch-api";
import { arcDeployment } from "../../../../../lib/arc/config";

export const dynamic = "force-dynamic";

function getStringField(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw {
      code: "INVALID_REQUEST",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be provided as a string.`
        }
      ],
      message: `${fieldName} must be provided as a string.`,
      status: 400
    } satisfies {
      code: ArcLaunchApiError["code"];
      details: ArcLaunchApiError["details"];
      message: string;
      status: number;
    };
  }

  return value;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      metadataUri?: unknown;
      name?: unknown;
      symbol?: unknown;
      usdcAmount?: unknown;
      walletAddress?: unknown;
    };
    const walletAddress = ensureAddress(
      typeof body.walletAddress === "string" ? body.walletAddress : null,
      "wallet"
    );
    const name = getStringField(body.name, "name");
    const symbol = getStringField(body.symbol, "symbol");
    const metadataUri = getStringField(body.metadataUri, "metadataUri");
    const usdcAmountIn = parseAmountFromRequest(body.usdcAmount, {
      decimals: 6,
      fieldName: "usdcAmount"
    });

    const { config, quote } = await quoteInitialLaunchPurchase({
      name,
      symbol,
      metadataUri,
      usdcAmountIn
    });

    return jsonNoStore(200, {
      ok: true,
      kind: "launch-initial-buy-quote",
      walletAddress,
      factoryAddress: arcDeployment.factoryAddress,
      quoteAssetAddress: config.factory.quoteAsset,
      spender: arcDeployment.factoryAddress,
      usdcAmountIn: usdcAmountIn.toString(10),
      reachesGraduationThreshold: quote.reachesGraduationThreshold,
      quote: {
        fee: quote.fee.toString(10),
        netUsdcIn: quote.netUsdcIn.toString(10),
        tokenAmountOut: quote.tokenAmountOut.toString(10),
        nextState: serializeCurveState(quote.nextState)
      }
    } satisfies ArcLaunchInitialBuyQuoteSuccess);
  } catch (error) {
    if (error instanceof LaunchInitialBuyQuoteError) {
      return jsonNoStore(409, {
        ok: false,
        code: "CONTRACT_READ_FAILED",
        message: error.message,
        details: [
          {
            label: "Initial launch buy quote",
            message: error.message
          }
        ],
        revert: {
          errorName: error.errorName,
          message: error.message,
          args: error.args?.map((value) => value.toString(10))
        }
      } satisfies ArcLaunchInitialBuyQuoteResponse);
    }

    const failure = error as {
      code: ArcLaunchApiError["code"];
      details: ArcLaunchApiError["details"];
      message: string;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      } satisfies ArcLaunchApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to quote this initial Arc Testnet launch purchase.",
      details: [
        {
          label: "Initial launch buy quote",
          message: error instanceof Error ? error.message : "Quote execution failed."
        }
      ]
    } satisfies ArcLaunchApiError);
  }
}
