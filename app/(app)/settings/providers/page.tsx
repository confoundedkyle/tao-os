import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { agenticPlatformModel } from "@/lib/ai-catalog";
import { listCatalogModels, listProviders } from "@/lib/queries";
import { providerLabel } from "@/lib/providers";
import {
  makePrimaryProviderAction,
  removeProviderAction,
} from "@/lib/actions/settings";
import { ProviderForm } from "@/components/provider-form";
import { Card, Chip, Mono } from "@/components/ui";
import { IconKey } from "@/components/icons";

export default async function ProvidersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const isAdmin = session.role === "admin";
  const [providers, models] = await Promise.all([
    listProviders(session.workspaceId),
    listCatalogModels(),
  ]);
  // The Calyflow default runs on the LIVE platform model from env, not the value
  // stored on its row at workspace creation (which can drift) — show the real one.
  const platformModel = agenticPlatformModel(
    env.platformProvider,
    env.platformModel,
  );

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <h2 className="mb-1 text-xl font-semibold">Your providers</h2>
        <p className="mb-5 text-sm text-navy-800/55">
          The primary provider serves every run; the others are fallbacks in
          order. If the primary hits a rate limit or outage mid-run, Calyflow
          retries on the next one — and the run log says so.
        </p>
        {providers.length === 0 ? (
          <p className="text-sm text-navy-800/45">
            No providers yet — add one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-navy-800/12 p-4"
              >
                <IconKey className="text-navy-800" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {providerLabel(p.provider)}
                    </span>
                    {p.priority === 1 ? (
                      <Chip tone="mint">primary</Chip>
                    ) : (
                      <Chip tone="navy">fallback #{p.priority - 1}</Chip>
                    )}
                    <Chip
                      tone={
                        p.status === "valid"
                          ? "mint"
                          : p.status === "invalid"
                            ? "coral"
                            : "amber"
                      }
                    >
                      {p.status}
                    </Chip>
                  </div>
                  <Mono>
                    {p.provider === "calyflow"
                      ? platformModel
                      : (p.default_model ?? "no model")}
                    {p.key_last4 ? ` · key ••••${p.key_last4}` : ""}
                  </Mono>
                </div>
                {isAdmin && p.priority !== 1 && (
                  <form action={makePrimaryProviderAction.bind(null, p.id)}>
                    <button className="text-sm font-semibold text-mint-700 hover:underline">
                      Make primary
                    </button>
                  </form>
                )}
                {isAdmin && p.provider !== "calyflow" && (
                  <form action={removeProviderAction.bind(null, p.id)}>
                    <button className="text-sm text-navy-800/40 hover:text-coral-400">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin ? (
        <Card>
          <h2 className="mb-1 text-xl font-semibold">Add / update a provider</h2>
          <p className="mb-5 text-sm text-navy-800/55">
            Calyflow&apos;s prompts are written and tested for Claude — other
            providers work, with possible differences in output style.
          </p>
          <ProviderForm
            models={models.map((m) => ({
              provider: m.provider,
              model_id: m.model_id,
              display_name: m.display_name,
              curated: m.curated,
            }))}
            existingProviders={providers.map((p) => p.provider)}
          />
        </Card>
      ) : (
        <p className="text-sm text-navy-800/45">
          Only the workspace owner can manage providers.
        </p>
      )}
    </div>
  );
}
