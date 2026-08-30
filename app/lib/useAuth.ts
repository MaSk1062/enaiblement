/** Firebase auth state as a hook. Browser only — `watchUser` runs in an effect. */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { isConfigured, watchUser } from "./firebase.client.ts";

export interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or failed to restore) the previous session. */
  loading: boolean;
  configError: string | null;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setConfigError(
        "Firebase is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN " +
          "and VITE_FIREBASE_PROJECT_ID in .env — see .env.example.",
      );
      setLoading(false);
      return;
    }
    return watchUser((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading, configError };
}
