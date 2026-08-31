/**
 * Cloud Run readiness probe. The only unauthenticated route.
 *
 * It reports the model and endpoint because after the defaults moved into the code, "what is
 * production actually running?" otherwise has no answer short of reading logs. `curl $URL/health`
 * answers it from outside the container, before a demo. Neither value is a secret, and a wrong
 * pairing here (gemini-3.5-flash is global-only) is the difference between a working turn and a
 * 404 on the first message.
 */

import { LOCATION, TEXT_MODEL } from "../services/gemini.ts";

export function loader() {
  return Response.json({
    status: "ok",
    service: "enaible",
    model: TEXT_MODEL,
    location: LOCATION,
  });
}
