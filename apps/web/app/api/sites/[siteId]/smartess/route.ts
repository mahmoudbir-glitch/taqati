import { connectionStatus } from "../../../../../lib/server/backend";
import { guarded } from "../../../../../lib/server/guard";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => guarded(request, connectionStatus);
