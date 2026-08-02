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
import { type ArcBuySimulationResponse } from "../../../../../../lib/arc/trade-api";

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
      minTokenAmountOut?: unknown;
      usdcAmountIn?: unknown;
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
    const usdcAmountIn = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.usdcAmountIn, "usdcAmountIn"),
      "usdcAmountIn"
    );
    const minTokenAmountOut = parseUnsignedIntegerString(
      body.minTokenAmountOut,
      "minTokenAmountOut"
    );
    const deadline = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.deadline, "deadline"),
      "deadline"
    );

    try {
      const { result } = await tradeContext.client.simulateContract({
        address: tradeContext.poolAddress,
        abi: launchPoolAbi,
        functionName: "buy",
        account: walletAddress,
        args: [usdcAmountIn, minTokenAmountOut, deadline, walletAddress]
      });

      return jsonNoStore(200, {
        ok: true,
        kind: "buy-simulation",
        tokenAddress,
        poolAddress: tradeContext.poolAddress,
        walletAddress,
        recipient: walletAddress,
        usdcAmountIn: toBigIntString(usdcAmountIn),
        minTokenAmountOut: toBigIntString(minTokenAmountOut),
        deadline: toBigIntString(deadline),
        tokenAmountOut: toBigIntString(result)
      } satisfies ArcBuySimulationResponse);
    } catch (error) {
      const failure = getSimulationFailure(error, "LaunchPool buy()", "Buy simulation failed.");

      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcBuySimulationResponse);
    }
  } catch (error) {
    const failure = error as {
      code: ArcBuySimulationResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcBuySimulationResponse extends { ok: false; details: infer D } ? D : never;
      message: string;
      revert?: ArcBuySimulationResponse extends { ok: false; revert?: infer R } ? R : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcBuySimulationResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to simulate this Arc Testnet buy.",
      details: [
        {
          label: "LaunchPool buy()",
          message: error instanceof Error ? error.message : "Buy simulation failed."
        }
      ]
    } satisfies ArcBuySimulationResponse);
  }
}
