import { type NextRequest } from "next/server";

import { ensureAddress, jsonNoStore } from "../../../../../../lib/arc/server-routes";
import {
  type ArcTokenActivityApiError,
  type ArcTokenTradesActivitySuccess
} from "../../../../../../lib/arc/token-activity-api";
import {
  parseTokenActivityLimitParam,
  parseTokenActivityPageParam,
  readTokenTradesActivity
} from "../../../../../../lib/arc/token-activity-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = ensureAddress(address, "token");
    const page = parseTokenActivityPageParam(request.nextUrl.searchParams.get("page"));
    const limit = parseTokenActivityLimitParam(request.nextUrl.searchParams.get("limit"));
    const result = await readTokenTradesActivity({
      limit,
      page,
      tokenAddress
    });

    return jsonNoStore(200, {
      ok: true,
      tokenAddress: result.tokenAddress,
      poolAddress: result.poolAddress,
      page: result.page,
      limit: result.limit,
      hasPreviousPage: result.hasPreviousPage,
      hasNextPage: result.hasNextPage,
      startBlock: result.startBlock,
      latestBlock: result.latestBlock,
      trades: result.trades,
      warnings: result.warnings
    } satisfies ArcTokenTradesActivitySuccess);
  } catch (error) {
    const failure = error as {
      code: ArcTokenActivityApiError["code"];
      details: ArcTokenActivityApiError["details"];
      message: string;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      } satisfies ArcTokenActivityApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to load Arc Testnet token activity.",
      details: [
        {
          label: "Token activity route",
          message: error instanceof Error ? error.message : "Recent trade activity failed."
        }
      ]
    } satisfies ArcTokenActivityApiError);
  }
}
