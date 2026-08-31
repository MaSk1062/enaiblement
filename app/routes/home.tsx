import { useEffect } from "react";
import { useNavigate } from "react-router";
import { SpinnerIcon } from "../lib/icons.tsx";
import { useAuth } from "../lib/useAuth.ts";

export function meta() {
  return [{ title: "enaible" }];
}

/** Entry point: straight to the consultation if signed in, otherwise to sign-in. */
export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate(user ? "/dashboard/chat" : "/login", { replace: true });
  }, [user, loading, navigate]);

  // Usually on screen well under a second, but a fully blank page still reads as broken if it
  // happens to land badly (UI-9) — same brand mark and spinner as dashboard.tsx's Centered.
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6">
      <div className="text-center">
        <p className="mb-6 text-lg font-semibold tracking-tight text-slate-900">enaible</p>
        <SpinnerIcon className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      </div>
    </main>
  );
}
