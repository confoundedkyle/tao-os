import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { sign } from "@/lib/crypto";
import { getAdapter } from "@/lib/integrations";

export const OAUTH_COOKIE = "zoho_crm_oauth";
const PROVIDER = "zoho-crm";

function redirectUri(request: NextRequest): string {
  const base = env.appBaseUrl || request.nextUrl.origin;
  return `${base}/api/connectors/${PROVIDER}/callback`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  }
  if (!env.zohoClientId || !env.zohoClientSecret) {
    return NextResponse.redirect(
      new URL("/settings/connectors?error=not_configured", request.nextUrl.origin),
    );
  }
  const adapter = getAdapter(PROVIDER)!;

  // Zoho has no PKCE — the signed state cookie alone guards the callback.
  const state = randomBytes(24).toString("base64url");
  const authorizeUrl = adapter.getAuthorizeUrl!({
    state,
    codeChallenge: "",
    redirectUri: redirectUri(request),
  });

  const jar = await cookies();
  jar.set(OAUTH_COOKIE, sign(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/connectors/${PROVIDER}`,
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl);
}
