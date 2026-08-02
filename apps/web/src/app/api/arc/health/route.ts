import { readArcHealthStatus } from "../../../../lib/arc/health";
import { jsonNoStore } from "../../../../lib/arc/server-routes";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readArcHealthStatus();

  return jsonNoStore(result.ok ? 200 : 503, result);
}
