import { type NextRequest } from "next/server";

import { erc20Abi } from "../../../../../lib/arc/abis";
import { arcDeployment } from "../../../../../lib/arc/config";
import {
  ensureAddress,
  ensurePositiveIntegerAmount,
  getSimulationFailure,
  jsonNoStore,
  parseUnsignedIntegerString,
  toBigIntString
} from "../../../../../lib/arc/server-routes";
import { type ArcLaunchApproveSimulationResponse } from "../../../../../lib/arc/launch-api";
import { getArcTestnetServerPublicClient } from "../../../../../lib/arc/server-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      amount?: unknown;
      walletAddress?: unknown;
    };
    const walletAddress = ensureAddress(
      typeof body.walletAddress === "string" ? body.walletAddress : null,
      "wallet"
    );
    const amount = ensurePositiveIntegerAmount(
      parseUnsignedIntegerString(body.amount, "amount"),
      "amount"
    );

    try {
      const { result } = await getArcTestnetServerPublicClient().simulateContract({
        address: arcDeployment.usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        account: walletAddress,
        args: [arcDeployment.factoryAddress, amount]
      });

      return jsonNoStore(200, {
        ok: true,
        kind: "launch-approve-simulation",
        walletAddress,
        assetAddress: arcDeployment.usdcAddress,
        amount: toBigIntString(amount),
        spender: arcDeployment.factoryAddress,
        result
      } satisfies ArcLaunchApproveSimulationResponse);
    } catch (error) {
      const failure = getSimulationFailure(
        error,
        "ERC20 approve()",
        "Launch approval simulation failed."
      );

      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code as ArcLaunchApproveSimulationResponse extends {
          ok: false;
          code: infer C;
        }
          ? C
          : never,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcLaunchApproveSimulationResponse);
    }
  } catch (error) {
    const failure = error as {
      code: ArcLaunchApproveSimulationResponse extends { ok: false; code: infer C } ? C : never;
      details: ArcLaunchApproveSimulationResponse extends { ok: false; details: infer D }
        ? D
        : never;
      message: string;
      revert?: ArcLaunchApproveSimulationResponse extends { ok: false; revert?: infer R }
        ? R
        : never;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcLaunchApproveSimulationResponse);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to simulate this launch approval on Arc Testnet.",
      details: [
        {
          label: "ERC20 approve()",
          message: error instanceof Error ? error.message : "Approval simulation failed."
        }
      ]
    } satisfies ArcLaunchApproveSimulationResponse);
  }
}
