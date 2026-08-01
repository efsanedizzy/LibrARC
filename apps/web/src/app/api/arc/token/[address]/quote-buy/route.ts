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
import { type ArcBuyQuoteResponse } from "../../../../../../lib/arc/trade-api";

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = ensureAddress(address, "token");
    const body = (await request.json()) as {
      usdcAmount?: unknown;
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
    const usdcAmountIn = parseAmountFromRequest(body.usdcAmount, {
      decimals: 6,
      fieldName: "usdcAmount"
    });

    const [quote, reachesGraduationThreshold] = await readWithRetry("Pool quoteBuy()", () =>
      tradeContext.client.readContract({
        address: tradeContext.poolAddress,
        abi: launchPoolAbi,
        functionName: "quoteBuy",
        args: [usdcAmountIn]
      })
    );

    return jsonNoStore(200, {
      ok: true,
      kind: "buy-quote",
      tokenAddress,
      poolAddress: tradeContext.poolAddress,
      walletAddress,
      usdcAmountIn: toBigIntString(usdcAmountIn),
      reachesGraduationThreshold,
      quote: {
        fee: toBigIntString(quote.fee),
        netUsdcIn: toBigIntString(quote.netUsdcIn),
        tokenAmountOut: toBigIntString(quote.tokenAmountOut),
        nextState: serializeCurveState(quote.nextState)
      }
    } satisfies ArcBuyQuoteResponse);
  } catch (error) {
    const failure = error as {
      code: ArcBuyQuoteResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcBuyQuoteResponse extends { ok: false; details: infer D } ? D : never;
      message: string;
      revert?: ArcBuyQuoteResponse extends { ok: false; revert?: infer R } ? R : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcBuyQuoteResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to quote this Arc Testnet buy.",
      details: [
        {
          label: "Pool quoteBuy()",
          message: error instanceof Error ? error.message : "Quote execution failed."
        }
      ]
    } satisfies ArcBuyQuoteResponse);
  }
}
