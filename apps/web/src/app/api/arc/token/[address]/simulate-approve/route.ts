import { type NextRequest } from "next/server";

import { erc20Abi } from "../../../../../../lib/arc/abis";
import { arcDeployment } from "../../../../../../lib/arc/config";
import {
  ensureAddress,
  ensurePositiveIntegerAmount,
  getSimulationFailure,
  jsonNoStore,
  parseUnsignedIntegerString,
  resolveCanonicalTradeContext,
  toBigIntString
} from "../../../../../../lib/arc/server-routes";
import { type ArcApproveSimulationResponse } from "../../../../../../lib/arc/trade-api";

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
      amount?: unknown;
      asset?: unknown;
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
    const amount = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.amount, "amount"),
      "amount"
    );
    const asset = body.asset === "token" ? "token" : body.asset === "usdc" ? "usdc" : null;

    if (!asset) {
      return jsonNoStore(400, {
        ok: false,
        code: "INVALID_REQUEST",
        message: 'asset must be either "usdc" or "token".',
        details: [
          {
            label: "asset",
            message: 'asset must be either "usdc" or "token".'
          }
        ]
      } satisfies ArcApproveSimulationResponse);
    }

    const assetAddress = asset === "usdc" ? arcDeployment.usdcAddress : tokenAddress;

    try {
      const { result } = await tradeContext.client.simulateContract({
        address: assetAddress,
        abi: erc20Abi,
        functionName: "approve",
        account: walletAddress,
        args: [tradeContext.poolAddress, amount]
      });

      return jsonNoStore(200, {
        ok: true,
        kind: "approve-simulation",
        tokenAddress,
        poolAddress: tradeContext.poolAddress,
        walletAddress,
        asset,
        assetAddress,
        amount: toBigIntString(amount),
        spender: tradeContext.poolAddress,
        result
      } satisfies ArcApproveSimulationResponse);
    } catch (error) {
      const failure = getSimulationFailure(error, "ERC20 approve()", "Approval simulation failed.");

      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcApproveSimulationResponse);
    }
  } catch (error) {
    const failure = error as {
      code: ArcApproveSimulationResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcApproveSimulationResponse extends { ok: false; details: infer D } ? D : never;
      message: string;
      revert?: ArcApproveSimulationResponse extends { ok: false; revert?: infer R } ? R : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcApproveSimulationResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to simulate this approval on Arc Testnet.",
      details: [
        {
          label: "ERC20 approve()",
          message: error instanceof Error ? error.message : "Approval simulation failed."
        }
      ]
    } satisfies ArcApproveSimulationResponse);
  }
}
