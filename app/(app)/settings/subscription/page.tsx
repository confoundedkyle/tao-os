import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button, Card, Chip, Field } from "@/components/ui";

export default async function SubscriptionSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const ws = session.workspace;

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Plan</h2>
          <Chip tone="mint">Free plan</Chip>
        </div>

        <Field label="Subscription">
          <p className="text-navy-800/80">
            {ws.trial_ends_at
              ? `Trial ends ${new Date(ws.trial_ends_at).toLocaleDateString("en-GB")}`
              : "Independent is free forever with your own API key."}
          </p>
        </Field>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" type="button" disabled>
            Change subscription
          </Button>
          <span className="text-sm text-navy-800/55">
            Upgrades are coming soon.
          </span>
        </div>
      </Card>
    </div>
  );
}
