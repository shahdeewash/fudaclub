/**
 * Development-only routers for testing without OAuth
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { isDevMode, getDevUser } from "./dev-auth";
import { upsertUser, getUserByOpenId } from "./db";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "../shared/const";

export const devRouter = router({
  /**
   * Check if development mode is enabled
   */
  isDevMode: publicProcedure.query(() => {
    return { enabled: isDevMode() };
  }),

  /**
   * Login as a test user (development only)
   */
  loginAs: publicProcedure
    .input(z.object({
      role: z.enum(["user", "admin", "kitchen"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isDevMode()) {
        throw new Error("Development mode not enabled");
      }

      const devUser = getDevUser(input.role);
      
      // Upsert the dev user
      await upsertUser({
        ...devUser,
        lastSignedIn: new Date(),
      });

      // Get the full user from database
      const user = await getUserByOpenId(devUser.openId);
      if (!user) {
        throw new Error("Failed to create dev user");
      }

      // Create session token
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),
});
