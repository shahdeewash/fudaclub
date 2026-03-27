/**
 * Development Mode Authentication Bypass
 * 
 * This file provides test users for local development without requiring Manus OAuth.
 * Only active when NODE_ENV=development
 */

import { User } from "../drizzle/schema";

export const DEV_USERS: Record<string, Omit<User, "id" | "createdAt" | "updatedAt" | "lastSignedIn">> = {
  user: {
    openId: "dev-user-001",
    name: "Test User",
    email: "user@testcompany.com",
    loginMethod: "dev",
    role: "user",
    companyId: 1,
    venueName: null,
    venueAddress: null,
    referralCode: null,
    referredBy: null,
  },
  admin: {
    openId: "dev-admin-001",
    name: "Admin User",
    email: "admin@fuda.com.au",
    loginMethod: "dev",
    role: "admin",
    companyId: null,
    venueName: null,
    venueAddress: null,
    referralCode: null,
    referredBy: null,
  },
  kitchen: {
    openId: "dev-kitchen-001",
    name: "Kitchen Staff",
    email: "kitchen@fuda.com.au",
    loginMethod: "dev",
    role: "kitchen",
    companyId: null,
    venueName: null,
    venueAddress: null,
    referralCode: null,
    referredBy: null,
  },
};

export function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

export function getDevUser(role: "user" | "admin" | "kitchen"): Omit<User, "id" | "createdAt" | "updatedAt" | "lastSignedIn"> {
  return DEV_USERS[role];
}
