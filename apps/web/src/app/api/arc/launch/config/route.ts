import { readLaunchFactoryConfig } from "../../../../../lib/arc/launch-server";
import { jsonNoStore } from "../../../../../lib/arc/server-routes";
import {
  type ArcLaunchApiError,
  type ArcLaunchConfigSuccess
} from "../../../../../lib/arc/launch-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await readLaunchFactoryConfig();

    return jsonNoStore(200, {
      ok: true,
      kind: "launch-config",
      chainId: config.chainId,
      explorerUrl: config.explorerUrl,
      factory: {
        address: config.factory.address,
        paused: config.factory.paused,
        quoteAsset: config.factory.quoteAsset,
        feeVault: config.factory.feeVault,
        liquidityAdapter: config.factory.liquidityAdapter,
        liquidityRecipient: config.factory.liquidityRecipient,
        buyFeeBps: config.factory.buyFeeBps.toString(10),
        sellFeeBps: config.factory.sellFeeBps.toString(10),
        graduationThreshold: config.factory.graduationThreshold.toString(10),
        virtualUsdcReserve: config.factory.virtualUsdcReserve.toString(10),
        virtualTokenReserve: config.factory.virtualTokenReserve.toString(10),
        maxMetadataUriLength: config.factory.maxMetadataUriLength.toString(10),
        launchCount: config.factory.launchCount.toString(10)
      }
    } satisfies ArcLaunchConfigSuccess);
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
      message: "Unable to load the Arc Testnet LaunchFactory configuration.",
      details: [
        {
          label: "Factory config",
          message: error instanceof Error ? error.message : "Configuration read failed."
        }
      ]
    } satisfies ArcLaunchApiError);
  }
}
