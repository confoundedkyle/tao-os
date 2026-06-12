import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { sign } from "@/lib/crypto";
import { getAdapter } from "@/lib/integrations";

export const OAUTH_COOKIE = "bullhorn_oauth";
const PROVIDER = "bullhorn";

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function redirectUri(request: NextRequest): string {
  const base = env.appBaseUrl || request.nextUrl.origin;
  return `${base}/api/connectors/${PROVIDER}/callback`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  }
  if (!env.bullhornClientId || !env.bullhornClientSecret) {
    return NextResponse.redirect(
      new URL("/settings/connectors?error=not_configured", request.nextUrl.origin),
    );
  }
  const adapter = getAdapter(PROVIDER)!;

  // Bullhorn has no PKCE; the verifier/challenge ride along unused so the
  // shared cookie format stays identical across providers.
  const codeVerifier = base64url(randomBytes(64));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest(),
  );
  const state = base64url(randomBytes(24));

  const authorizeUrl = adapter.getAuthorizeUrl!({
    state,
    codeChallenge,
    redirectUri: redirectUri(request),
  });

  // state:verifier (both base64url, no ':') signed so the callback can trust it.
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, sign(`${state}:${codeVerifier}`), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/connectors/${PROVIDER}`,
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl);
}
