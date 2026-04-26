export const ENV = {
  // App identification (used in JWT payload — keep stable across hosts)
  appId: process.env.VITE_APP_ID ?? "fudaclub",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Google OAuth (replaces Manus OAuth on Railway)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  // Public URL of this app — used to build OAuth redirect URIs server-side
  // e.g. https://fudaclub-production.up.railway.app or https://fudaclub.com.au
  publicUrl: process.env.PUBLIC_URL ?? "",

  // Legacy Manus vars — kept so other code that imports them doesn't crash.
  // Safe to be empty when running on Railway with Google OAuth.
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  isProduction: process.env.NODE_ENV === "production",
};
