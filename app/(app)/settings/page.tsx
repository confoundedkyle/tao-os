import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  updateWorkspaceNameAction,
  setWorkspaceTypeAction,
  setMonthlySpendLimitAction,
} from "@/lib/actions/settings";
import { Button, Card, Chip, Field, inputClass } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = {
  independent: "Independent recruiter",
  agency: "Agency",
  inhouse: "In-house team",
};

export default async function GeneralSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const isAdmin = session.role === "admin";
  const ws = session.workspace;

  return (
    <div className="grid max-w-3xl gap-6">
      {!isAdmin && (
        <p className="rounded-card border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
          Only the workspace owner can change settings.
        </p>
      )}

      <Card>
        <h2 className="mb-4 text-xl font-semibold">Workspace</h2>
        <form action={updateWorkspaceNameAction} className="mb-6 flex items-end gap-3">
          <div className="flex-1">
            <Field label="Name">
              <input
                name="name"
                defaultValue={ws.name}
                disabled={!isAdmin}
                className={inputClass}
              />
            </Field>
          </div>
          <Button variant="small" type="submit" disabled={!isAdmin}>
            Save
          </Button>
        </form>
        <form action={setWorkspaceTypeAction} className="flex items-end gap-3">
          <div className="flex-1">
            <Field
              label="Type"
              hint={
                ws.trial_ends_at
                  ? `Trial ends ${new Date(ws.trial_ends_at).toLocaleDateString("en-GB")}`
                  : "Independent is free forever with your own API key."
              }
            >
              <select
                name="workspaceType"
                defaultValue={ws.workspace_type ?? ""}
                disabled={!isAdmin}
                className={inputClass}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button variant="small" type="submit" disabled={!isAdmin}>
            Save
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Monthly spend limit</h2>
          <Chip tone={ws.monthly_spend_limit_usd != null ? "mint" : "navy"}>
            {ws.monthly_spend_limit_usd != null
              ? `$${Number(ws.monthly_spend_limit_usd).toFixed(0)}/month`
              : "off"}
          </Chip>
        </div>
        <p className="mb-4 text-sm text-navy-800/55">
          Optional cap on ALL AI usage in this workspace — including runs on
          your own API keys. Runs pause when the limit is hit and resume next
          calendar month. Leave empty to turn off.
        </p>
        <form action={setMonthlySpendLimitAction} className="flex items-end gap-3">
          <div className="max-w-48">
            <Field label="Limit (USD)">
              <input
                name="limit"
                type="number"
                min="0"
                step="1"
                defaultValue={ws.monthly_spend_limit_usd ?? ""}
                placeholder="e.g. 100"
                disabled={!isAdmin}
                className={inputClass}
              />
            </Field>
          </div>
          <Button variant="small" type="submit" disabled={!isAdmin}>
            Save
          </Button>
        </form>
      </Card>
    </div>
  );
}
