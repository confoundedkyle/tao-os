"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth";
import { sign } from "../crypto";
import { env } from "../env";

// SINGLE_WORKSPACE mode only: "any login" via signed email cookie (SPEC §13).

export async function signInSingleWorkspace(formData: FormData) {
  if (!env.singleWorkspace) throw new Error("Not in single-workspace mode");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/sign-in?error=invalid-email");
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
