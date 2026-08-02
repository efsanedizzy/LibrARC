import { type NextRequest } from "next/server";

import {
  type ArcLaunchesApiError,
  type ArcLaunchesApiSuccess
} from "../../../../lib/arc/launches-api";
import {
  parseLaunchesLimitParam,
  parseLaunchesPageParam,
  parseLaunchesSearchParam,
  parseLaunchesSortParam,
  parseLaunchesStatusParam,
  readFactoryLaunchesPage
} from "../../../../lib/arc/launches-server";
import { jsonNoStore } from "../../../../lib/arc/server-routes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const page = parseLaunchesPageParam(request.nextUrl.searchParams.get("page"));
    const limit = parseLaunchesLimitParam(request.nextUrl.searchParams.get("limit"));
    const sort = parseLaunchesSortParam(request.nextUrl.searchParams.get("sort"));
    const status = parseLaunchesStatusParam(request.nextUrl.searchParams.get("status"));
    const search = parseLaunchesSearchParam(request.nextUrl.searchParams.get("search"));

    const result = await readFactoryLaunchesPage({
      page,
      limit,
      sort,
      status,
      search
    });

    return jsonNoStore(200, {
      ok: true,
      currentPage: result.currentPage,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
      items: result.items,
      limit: result.limit,
      scanWindowApplied: result.scanWindowApplied,
      search,
      sort,
      status,
      totalFilteredLaunches: result.totalFilteredLaunches,
      totalLaunchCount: result.totalLaunchCount,
      totalPages: result.totalPages,
      warnings: result.warnings
    } satisfies ArcLaunchesApiSuccess);
  } catch (error) {
    const failure = error as {
      code: ArcLaunchesApiError["code"];
      details: ArcLaunchesApiError["details"];
      message: string;
      status: number;
    };

    if (failure && typeof failure === "object" && "code" in failure) {
      return jsonNoStore(failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
        details: failure.details
      } satisfies ArcLaunchesApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: "Unable to load LaunchFactory launches from Arc Testnet.",
      details: [
        {
          label: "Factory launches",
          message: error instanceof Error ? error.message : "Launch list request failed."
        }
      ]
    } satisfies ArcLaunchesApiError);
  }
}
