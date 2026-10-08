import { getDaily } from "../../../../../../lib/server/backend";
import { guarded, intParam } from "../../../../../../lib/server/guard";

export const dynamic = "force-dynamic";
// A cold 30-day request reads every day from SmartESS before the cache is warm.
export const maxDuration = 60;

export const GET = (request: Request) => guarded(request, () => getDaily(intParam(request, "days") ?? 30));
