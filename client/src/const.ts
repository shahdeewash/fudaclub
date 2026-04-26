export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the URL the user should be redirected to in order to sign in.
 *
 * This now points at Google's OAuth consent screen directly. The redirect
 * URI must match what's configured in Google Cloud Console "Authorized
 * redirect URIs". The server-side callback at /api/oauth/callback handles
 * the code exchange.
 *
 * Required env var:
 *   VITE_GOOGLE_CLIENT_ID — same value as the server's GOOGLE_CLIENT_ID
 */
export const getLoginUrl = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[Auth] VITE_GOOGLE_CLIENT_ID is not configured");
    return "/";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  // State is base64(redirectUri) — server decodes it during code exchange.
  const state = btoa(redirectUri);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");

  return url.toString();
};
