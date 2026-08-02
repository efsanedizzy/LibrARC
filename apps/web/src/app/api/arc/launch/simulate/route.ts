import { type NextRequest } from "next/server";

import { simulateCreateLaunchTransaction } from "../../../../../lib/arc/launch-server";
import {
  ensureAddress,
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
      metadataUri?: unknown;
      name?: unknown;
      symbol?: unknown;
      walletAddress?: unknown;
    };
    const walletAddress = ensureAddress(
      typeof body.walletAddress === "string" ? body.walletAddress : null,
      "wallet"
    );
    const name = getStringField(body.name, "name");
    const symbol = getStringField(body.symbol, "symbol");
    const metadataUri = getStringField(body.metadataUri, "metadataUri");

    try {
      const simulation = await simulateCreateLaunchTransaction({
        account: walletAddress,
        name,
        symbol,
        metadataUri
      });

      return jsonNoStore(200, {
        ok: true,
        kind: "launch-simulation",
        walletAddress,
        factoryAddress: arcDeployment.factoryAddress,
        request: simulation.request,
        simulation: {
          launchId: simulation.simulation.launchId.toString(10),
          launchToken: simulation.simulation.launchToken,
          launchPool: simulation.simulation.launchPool
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
