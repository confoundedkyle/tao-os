"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "crypto";
import { SESSION_COOKIE } from "../auth";
import { sign } from "../crypto";
import { env } from "../env";
import { rateLimit, clientIp } from "../ratelimit";

// SINGLE_WORKSPACE mode only: email sign-in via signed cookie (SPEC §13).
// Gated by SINGLE_WORKSPACE_PASSWORD when set and rate-limited by IP so a
// known admin email can't be brute-forced into an admin session.

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function signInSingleWorkspace(formData: FormData) {
  if (!env.singleWorkspace) throw new Error("Not in single-workspace mode");

  // 5 sign-in attempts per minute per IP.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(`signin:${ip}`, {
    limit: 5,
    windowSeconds: 60,
  });
  if (!allowed) redirect("/sign-in?error=rate-limited");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/sign-in?error=invalid-email");
  }

  if (env.requireSingleWorkspacePassword) {
    const password = String(formData.get("password") ?? "");
    if (!constantTimeEquals(password, env.singleWorkspacePassword)) {
      redirect("/sign-in?error=invalid-password");
    }
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

export async function signOutSingleWorkspace() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
