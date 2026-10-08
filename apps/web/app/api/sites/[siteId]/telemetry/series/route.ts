import { getSeries } from "../../../../../../lib/server/backend";
import { guarded, intParam } from "../../../../../../lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_MS = 24 * 3_600_000;

export const GET = (request: Request) =>
  guarded(request, () => getSeries(Math.max(intParam(request, "since") ?? Date.now() - DAY_MS, Date.now() - 2 * DAY_MS)));
