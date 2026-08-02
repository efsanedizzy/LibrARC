import { type NextRequest } from "next/server";

import { launchPoolAbi } from "../../../../../../lib/arc/abis";
import {
  ensureAddress,
  ensurePositiveIntegerAmount,
  getSimulationFailure,
  jsonNoStore,
  parseUnsignedIntegerString,
  resolveCanonicalTradeContext,
  toBigIntString
} from "../../../../../../lib/arc/server-routes";
import { type ArcSellSimulationResponse } from "../../../../../../lib/arc/trade-api";

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
      deadline?: unknown;
      minUsdcAmountOut?: unknown;
      tokenAmountIn?: unknown;
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
    const tokenAmountIn = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.tokenAmountIn, "tokenAmountIn"),
      "tokenAmountIn"
    );
    const minUsdcAmountOut = parseUnsignedIntegerString(body.minUsdcAmountOut, "minUsdcAmountOut");
    const deadline = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.deadline, "deadline"),
      "deadline"
    );

    try {
      const { result } = await tradeContext.client.simulateContract({
        address: tradeContext.poolAddress,
        abi: launchPoolAbi,
        functionName: "sell",
        account: walletAddress,
        args: [tokenAmountIn, minUsdcAmountOut, deadline, walletAddress]
      });

      return jsonNoStore(200, {
        ok: true,
        kind: "sell-simulation",
        tokenAddress,
        poolAddress: tradeContext.poolAddress,
        walletAddress,
        recipient: walletAddress,
        tokenAmountIn: toBigIntString(tokenAmountIn),
        minUsdcAmountOut: toBigIntString(minUsdcAmountOut),
        deadline: toBigIntString(deadline),
        netUsdcAmountOut: toBigIntString(result)
      } satisfies ArcSellSimulationResponse);
    } catch (error) {
      const failure = getSimulationFailure(error, "LaunchPool sell()", "Sell simulation failed.");

      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcSellSimulationResponse);
    }
  } catch (error) {
    const failure = error as {
      code: ArcSellSimulationResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcSellSimulationResponse extends { ok: false; details: infer D } ? D : never;
      message: string;
      revert?: ArcSellSimulationResponse extends { ok: false; revert?: infer R } ? R : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcSellSimulationResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to simulate this Arc Testnet sell.",
      details: [
        {
          label: "LaunchPool sell()",
          message: error instanceof Error ? error.message : "Sell simulation failed."
        }
      ]
    } satisfies ArcSellSimulationResponse);
  }
}
