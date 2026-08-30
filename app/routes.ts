import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  layout("routes/dashboard.tsx", [route("dashboard/chat", "routes/dashboard.chat.tsx")]),

  // Resource routes — ARCHITECTURE.md Appendix A. One container serves these and the UI
  // (ADR-01), so the orchestrator is an in-process import rather than a network hop.
  route("health", "routes/health.ts"),
  route("api/session/start", "routes/api.session.start.ts"),
  route("api/session/:id", "routes/api.session.$id.ts"),
  route("api/session/:id/use-cases", "routes/api.session.$id.use-cases.ts"),
  route("api/chat", "routes/api.chat.ts"),
] satisfies RouteConfig;
