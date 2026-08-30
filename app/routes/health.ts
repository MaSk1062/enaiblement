/** Cloud Run readiness probe. The only unauthenticated route. */
export function loader() {
  return Response.json({ status: "ok", service: "enaible" });
}
