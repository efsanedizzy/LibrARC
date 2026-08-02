import { type NextRequest } from "next/server";

import { launchPoolAbi } from "../../../../../../lib/arc/abis";
import {
  ensureAddress,
  jsonNoStore,
  parseAmountFromRequest,
  readWithRetry,
  resolveCanonicalTradeContext,
  serializeCurveState,
  toBigIntString
} from "../../../../../../lib/arc/server-routes";
import { type ArcSellQuoteResponse } from "../../../../../../lib/arc/trade-api";

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = ensureAddress(address, "token");
    const body = (await request.json()) as {
      tokenAmount?: unknown;
      walletAddress?: unknown;
    };
    const walletAddress = ensureAddress(
      typeof body.walletAddress === "string" ? body.walletAddress : null,
      "wallet"
    );
    const tradeContext = await resolveCanonicalTradeContext({
      tokenAddress,
      walletAddress
    });
    const tokenAmountIn = parseAmountFromRequest(body.tokenAmount, {
      decimals: tradeContext.tokenDecimals,
      fieldName: "tokenAmount"
    });

    const quote = await readWithRetry("Pool quoteSell()", () =>
      tradeContext.client.readContract({
        address: tradeContext.poolAddress,
        abi: launchPoolAbi,
        functionName: "quoteSell",
        args: [tokenAmountIn]
      })
    );

    return jsonNoStore(200, {
      ok: true,
      kind: "sell-quote",
      tokenAddress,
      poolAddress: tradeContext.poolAddress,
      walletAddress,
      tokenAmountIn: toBigIntString(tokenAmountIn),
      quote: {
        fee: toBigIntString(quote.fee),
        grossUsdcAmountOut: toBigIntString(quote.grossUsdcAmountOut),
        netUsdcAmountOut: toBigIntString(quote.netUsdcAmountOut),
        nextState: serializeCurveState(quote.nextState)
      }
    } satisfies ArcSellQuoteResponse);
  } catch (error) {
    const failure = error as {
      code: ArcSellQuoteResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcSellQuoteResponse extends { ok: false; details: infer D } ? D : never;
      message: string;
      revert?: ArcSellQuoteResponse extends { ok: false; revert?: infer R } ? R : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcSellQuoteResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to quote this Arc Testnet sell.",
      details: [
        {
          label: "Pool quoteSell()",
          message: error instanceof Error ? error.message : "Quote execution failed."
        }
      ]
    } satisfies ArcSellQuoteResponse);
  }
}
