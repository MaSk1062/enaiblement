/**
 * Firebase client SDK - browser only. Does the SSO popup and holds the ID token.
 *
 * The token goes to the server as a bearer header on every API call and is verified there
 * with the Admin SDK (middleware/requireUser.ts). There is no session cookie: on a 48-hour
 * clock that is an evening of work for no demo value.
 *
 * These VITE_ values are public by design - they identify the Firebase project, they do not
 * authorise anything. Access control lives in the rules and in requireUser.
 */

import { type FirebaseApp, initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const isConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

let app: FirebaseApp | undefined;

export function firebaseAuth(): Auth {
  if (!isConfigured) {
    throw new Error(
      "Firebase is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN " +
        "and VITE_FIREBASE_PROJECT_ID - see .env.example.",
    );
  }
  app ??= getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}

export function signInWithGoogle() {
  // ponytail: Google only. PRD Epic 1 says Google/Microsoft, but one provider demos
  // identically and the Azure app registration is the slow part. Add Microsoft by
  // swapping in OAuthProvider("microsoft.com") - the rest of the flow is unchanged.
  return signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
}

export const signInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(firebaseAuth(), email, password);

export const signUpWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(firebaseAuth(), email, password);

export const resetPassword = (email: string) => sendPasswordResetEmail(firebaseAuth(), email);

export const signOutUser = () => signOut(firebaseAuth());

/**
 * Firebase throws codes like `auth/invalid-credential`. Showing those to a CEO is not an
 * error message, it is a stack trace with extra steps.
 */
const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "That email and password do not match.",
  "auth/invalid-email": "That does not look like an email address.",
  "auth/user-not-found": "No account with that email. Create one below.",
  "auth/wrong-password": "That email and password do not match.",
  "auth/email-already-in-use": "That email already has an account - sign in instead.",
  "auth/weak-password": "Use at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/operation-not-allowed":
    "Email sign-in is not enabled for this project yet. Turn it on in Firebase Auth.",
  "auth/network-request-failed": "Could not reach Firebase. Check your connection.",
  "auth/invalid-login-credentials": "That email and password do not match.",
  "auth/missing-password": "Enter a password.",
  "auth/configuration-not-found":
    "Firebase Authentication is not set up for this project yet. Enable it in the Firebase " +
    "console and turn on the Email/Password and Google providers.",
};

/** Returns null for a cancelled popup - that is a user action, not an error to shout about. */
export function authErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  return AUTH_ERRORS[code] ?? (err as Error)?.message ?? "Sign-in failed.";
}

/** Resolves once Firebase has restored (or failed to restore) the session. */
export function watchUser(cb: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth(), cb);
}

export async function idToken(): Promise<string> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  return user.getIdToken();
}
