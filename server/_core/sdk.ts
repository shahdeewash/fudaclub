/**
 * Authentication SDK — Google OAuth implementation.
 *
 * This file replaces the original Manus OAuth SDK. It exposes the SAME public
 * API (exchangeCodeForToken, getUserInfo, createSessionToken, verifySession,
 * authenticateRequest, getUserInfoWithJwt) so all callers (server/_core/oauth.ts,
 * server/_core/context.ts, etc.) continue to work without modification.
 *
 * What changed:
 *  - exchangeCodeForToken(code, state) now exchanges with Google's token endpoint
 *  - getUserInfo(accessToken) now calls Google's userinfo endpoint
 *  - openId is now `google_<sub>` (Google's stable user identifier)
 *  - JWT signing/verification is unchanged (already provider-agnostic)
 *
 * Required env vars (set in Railway):
 *  - GOOGLE_CLIENT_ID
 *  - GOOGLE_CLIENT_SECRET
 *  - JWT_SECRET (any random 64-char string)
 *  - PUBLIC_URL (e.g. https://fudaclub-production.up.railway.app)
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

// ─── Google OAuth response shapes ────────────────────────────────────────────

export interface ExchangeTokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface GetUserInfoResponse {
  openId: string;
  name: string | null;
  email: string | null;
  emailVerified?: boolean;
  picture?: string | null;
  loginMethod: string | null;
  platform: string | null;
}

export interface GetUserInfoWithJwtResponse extends GetUserInfoResponse {}

// ─── Google endpoints ───────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// ─── HTTP client ─────────────────────────────────────────────────────────

const httpClient: AxiosInstance = axios.create({ timeout: 30_000 });

// ─── State helpers ───────────────────────────────────────────────────────

/** Decode the OAuth state param. State is base64-encoded redirectUri. */
function decodeState(state: string): string {
  try {
    return Buffer.from(state, "base64").toString("utf-8");
  } catch {
    // Browser-style atob fallback (in case state was encoded client-side)
    try { return atob(state); } catch { return ""; }
  }
}

// ─── Public helper: build Google authorize URL ───────────────────────────────

/**
 * Build a Google OAuth consent URL.
 * The redirectUri MUST also be added to "Authorized redirect URIs" in your
 * Google Cloud OAuth credentials.
 */
export function getGoogleAuthorizeUrl(redirectUri: string): string {
  const state = Buffer.from(redirectUri).toString("base64");
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", ENV.googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

// ─── Server SDK ─────────────────────────────────────────────────────────

class SDKServer {
  /**
   * Exchange a Google OAuth authorization code for an access token.
   * Signature preserved for compatibility with existing oauth.ts callback.
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    const redirectUri = decodeState(state);
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      throw new Error(
        "[Auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured"
      );
    }

    const params = new URLSearchParams();
    params.set("client_id", ENV.googleClientId);
    params.set("client_secret", ENV.googleClientSecret);
    params.set("code", code);
    params.set("grant_type", "authorization_code");
    params.set("redirect_uri", redirectUri);

    const { data } = await httpClient.post(GOOGLE_TOKEN_URL, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Get user info from Google's userinfo endpoint.
   * Signature preserved for compatibility.
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const { data } = await httpClient.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Google returns: { sub, name, given_name, family_name, picture, email, email_verified, locale }
    const sub = data.sub as string;
    if (!sub) {
      throw new Error("[Auth] Google userinfo missing 'sub' field");
    }

    return {
      openId: `google_${sub}`,
      name: (data.name as string | undefined) ?? null,
      email: (data.email as string | undefined) ?? null,
      emailVerified: data.email_verified ?? false,
      picture: (data.picture as string | undefined) ?? null,
      loginMethod: "google",
      platform: "google",
    };
  }

  // ─── JWT session token (unchanged from Manus version) ────────────────────────

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      console.error("[Auth] JWT_SECRET is not configured!");
    }
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  /**
   * Compatibility shim — the old Manus SDK had a getUserInfoWithJwt() that
   * called Manus's server. With our own JWT we just decode it locally.
   * This is only used in authenticateRequest() to "re-sync" a user that's
   * missing from the local DB. If we're using Google OAuth, that case
   * shouldn't happen normally, but we preserve the function shape.
   */
  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const session = await this.verifySession(jwtToken);
    if (!session) {
      throw new Error("[Auth] Invalid JWT");
    }
    // We don't have profile data on hand without re-prompting Google.
    // Return what we know from the JWT — caller can upsert with this.
    return {
      openId: session.openId,
      name: session.name || null,
      email: null,
      emailVerified: false,
      picture: null,
      loginMethod: "google",
      platform: "google",
    };
  }

  // ─── Cookies + middleware ────────────────────────────────────────────────

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    if (!user) {
      // Should be rare — JWT was valid but user row is missing. Re-create
      // a minimal user row from the JWT payload.
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "google",
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from JWT:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
