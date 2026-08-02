import { type NextRequest } from "next/server";

import { ensureAddress, jsonNoStore } from "../../../../../lib/arc/server-routes";
import {
  parseProfileLimitParam,
  parseProfilePageParam,
  parseProfileSortParam,
  readArcProfilePage
} from "../../../../../lib/arc/profile-server";
import {
  type ArcProfileApiError,
  type ArcProfileApiSuccess
} from "../../../../../lib/arc/profile-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const walletAddress = ensureAddress(address, "profile");
    const page = parseProfilePageParam(request.nextUrl.searchParams.get("page"));
    const limit = parseProfileLimitParam(request.nextUrl.searchParams.get("limit"));
    const sort = parseProfileSortParam(request.nextUrl.searchParams.get("sort"));

    const data = await readArcProfilePage({
      walletAddress,
      page,
      limit,
      sort
    });

    return jsonNoStore(200, {
      ok: true,
      walletAddress: data.walletAddress,
      usdcBalance: data.usdcBalance,
      totalCreatedLaunches: data.totalCreatedLaunches,
      activeLaunchCount: data.activeLaunchCount,
      graduationPendingLaunchCount: data.graduationPendingLaunchCount,
      graduatedLaunchCount: data.graduatedLaunchCount,
      page: data.page,
      limit: data.limit,
      sort: data.sort,
      totalPages: data.totalPages,
      hasPreviousPage: data.hasPreviousPage,
      hasNextPage: data.hasNextPage,
      launches: data.launches,
      warnings: data.warnings
    } satisfies ArcProfileApiSuccess);
  } catch (error) {
    const failure = error as {
      code: ArcProfileApiError["code"];
      details: ArcProfileApiError["details"];
      message: string;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      } satisfies ArcProfileApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to load the Arc Testnet creator profile.",
      details: [
        {
          label: "Profile route",
          message: error instanceof Error ? error.message : "Route execution failed."
        }
      ]
    } satisfies ArcProfileApiError);
  }
}
