import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getPostHogClient } from "@/lib/posthog-server";
import { syncWorkspaceNameFromClerk } from "@/lib/workspace";

// Clerk → DB sync + signup analytics. Catches changes made in Clerk's own UI
// (e.g. renaming an org in the OrganizationSwitcher) that our settings actions
// never see, and captures the top-of-funnel `signup` event. The reverse
// direction (DB → Clerk) lives in `syncClerkOrgName`. Configure the endpoint URL
// + `CLERK_WEBHOOK_SIGNING_SECRET` in the Clerk dashboard and subscribe to the
// `organization.updated` and `user.created` events.
export async function POST(request: NextRequest) {
  if (!env.clerkWebhookSigningSecret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  let event;
  try {
    // Verifies the svix signature against CLERK_WEBHOOK_SIGNING_SECRET.
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "organization.updated") {
    await syncWorkspaceNameFromClerk(event.data.id, event.data.name);
  }

  // Top-of-funnel: a new account was created. distinctId is the Clerk user id,
  // which matches how PostHogIdentify identifies the user, so this stitches to
  // the rest of the activation funnel (onboarding → demo_run → activated).
  if (event.type === "user.created") {
    const email = event.data.email_addresses?.[0]?.email_address;
    getPostHogClient().capture({
      distinctId: event.data.id,
      event: "signup",
      properties: {
        ...(email ? { email } : {}),
        created_at: event.data.created_at,
      },
    });
  }

  // Ack everything else so Clerk doesn't retry unhandled event types.
  return NextResponse.json({ ok: true });
}
