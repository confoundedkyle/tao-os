import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { syncWorkspaceNameFromClerk } from "@/lib/workspace";

// Clerk → DB sync. Catches changes made in Clerk's own UI (e.g. renaming an
// org in the OrganizationSwitcher) that our settings actions never see. The
// reverse direction (DB → Clerk) lives in `syncClerkOrgName`. Configure the
// endpoint URL + `CLERK_WEBHOOK_SIGNING_SECRET` in the Clerk dashboard and
// subscribe to the `organization.updated` event.
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

  // Ack everything else so Clerk doesn't retry unhandled event types.
  return NextResponse.json({ ok: true });
}
