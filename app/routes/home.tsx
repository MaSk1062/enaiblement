import { useEffect } from "react";
import { useNavigate } from "react-router";
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

  return <main className="grid min-h-dvh place-items-center bg-slate-50" />;
}
