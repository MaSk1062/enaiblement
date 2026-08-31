/**
 * Sign out, then land on /login.
 *
 * Exists as a component rather than an inline handler because it belongs on every screen a
 * user can get stuck on - a failed bootstrap, an empty consultation, onboarding - not only on
 * the dashboard header where it started.
 */

import { useNavigate } from "react-router";
import { signOutUser } from "./firebase.client.ts";

export function SignOutButton({ className }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => signOutUser().then(() => navigate("/login", { replace: true }))}
      className={className ?? "text-xs text-slate-500 transition hover:text-slate-900"}
    >
      Sign out
    </button>
  );
}
