import { type NextRequest } from "next/server";

import { simulateLaunchTransaction } from "../../../../../lib/arc/launch-server";
import {
  ensureAddress,
  ensurePositiveIntegerAmount,
  getSimulationFailure,
  jsonNoStore
} from "../../../../../lib/arc/server-routes";
import {
  type ArcLaunchApiError,
  type ArcLaunchSimulationResponse,
  type ArcLaunchSimulationSuccess
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
      deadline?: unknown;
      metadataUri?: unknown;
      minTokenAmountOut?: unknown;
      mode?: unknown;
      name?: unknown;
      symbol?: unknown;
      usdcAmountIn?: unknown;
      walletAddress?: unknown;
    };
    const walletAddress = ensureAddress(
      typeof body.walletAddress === "string" ? body.walletAddress : null,
      "wallet"
    );
    const name = getStringField(body.name, "name");
    const symbol = getStringField(body.symbol, "symbol");
    const metadataUri = getStringField(body.metadataUri, "metadataUri");
    const mode =
      body.mode === "createLaunchAndBuy"
        ? "createLaunchAndBuy"
        : body.mode === undefined || body.mode === "createLaunch"
          ? "createLaunch"
          : null;

    if (!mode) {
      return jsonNoStore(400, {
        ok: false,
        code: "INVALID_REQUEST",
        message: 'mode must be either "createLaunch" or "createLaunchAndBuy".',
        details: [
          {
            label: "mode",
            message: 'mode must be either "createLaunch" or "createLaunchAndBuy".'
          }
        ]
      } satisfies ArcLaunchApiError);
    }

    try {
      const createAndBuyInputs =
        mode === "createLaunchAndBuy"
          ? {
              usdcAmountIn: ensurePositiveIntegerAmount(
                getBigIntStringField(body.usdcAmountIn, "usdcAmountIn"),
                "usdcAmountIn"
              ),
              minTokenAmountOut: getBigIntStringField(body.minTokenAmountOut, "minTokenAmountOut"),
              deadline: ensurePositiveIntegerAmount(
                getBigIntStringField(body.deadline, "deadline"),
                "deadline"
              )
            }
          : null;
      const requiredCreateAndBuyInputs = createAndBuyInputs ?? undefined;
      const simulation =
        mode === "createLaunch"
          ? await simulateLaunchTransaction({
              account: walletAddress,
              mode,
              name,
              symbol,
              metadataUri
            })
          : await simulateLaunchTransaction({
              account: walletAddress,
              mode,
              name,
              symbol,
              metadataUri,
              usdcAmountIn: requiredCreateAndBuyInputs!.usdcAmountIn,
              minTokenAmountOut: requiredCreateAndBuyInputs!.minTokenAmountOut,
              deadline: requiredCreateAndBuyInputs!.deadline
            });
      const serializedRequest: ArcLaunchSimulationSuccess["request"] =
        mode === "createLaunch"
          ? {
              account: walletAddress,
              address: arcDeployment.factoryAddress,
              functionName: "createLaunch",
              args: [name, symbol, metadataUri]
            }
          : {
              account: walletAddress,
              address: arcDeployment.factoryAddress,
              functionName: "createLaunchAndBuy",
              args: [
                name,
                symbol,
                metadataUri,
                requiredCreateAndBuyInputs!.usdcAmountIn.toString(10),
                requiredCreateAndBuyInputs!.minTokenAmountOut.toString(10),
                requiredCreateAndBuyInputs!.deadline.toString(10),
                walletAddress
              ]
            };

      return jsonNoStore(200, {
        ok: true,
        kind: "launch-simulation",
        mode: simulation.mode,
        walletAddress,
        factoryAddress: arcDeployment.factoryAddress,
        request: serializedRequest,
        simulation: {
          launchId: simulation.simulation.launchId.toString(10),
          launchToken: simulation.simulation.launchToken,
          launchPool: simulation.simulation.launchPool,
          tokenAmountOut: simulation.simulation.tokenAmountOut?.toString(10)
        }
      } satisfies ArcLaunchSimulationSuccess);
    } catch (error) {
      const failure = getSimulationFailure(
        error,
        "LaunchFactory createLaunch()",
        "Launch simulation failed."
      );

      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code as ArcLaunchApiError["code"],
        message: failure.message,
        details: failure.details,
        revert: failure.revert
      } satisfies ArcLaunchSimulationResponse);
    }
  } catch (error) {
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
      message: "Unable to simulate createLaunch on Arc Testnet.",
      details: [
        {
          label: "Launch simulation",
          message: error instanceof Error ? error.message : "Simulation failed."
        }
      ]
    } satisfies ArcLaunchApiError);
  }
}

function getBigIntStringField(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw {
      code: "INVALID_REQUEST",
      details: [
        {
          label: fieldName,
          message: `${fieldName} must be provided as an unsigned integer string.`
        }
      ],
      message: `${fieldName} must be provided as an unsigned integer string.`,
      status: 400
    } satisfies {
      code: ArcLaunchApiError["code"];
      details: ArcLaunchApiError["details"];
      message: string;
      status: number;
    };
  }

  return BigInt(value);
}
