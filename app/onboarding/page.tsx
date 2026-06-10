import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { listCatalogModels } from "@/lib/queries";
import {
  updateWorkspaceNameAction,
  setWorkspaceTypeAction,
  finishOnboardingAction,
} from "@/lib/actions/settings";
import { Button, Field, inputClass } from "@/components/ui";
import { OnboardingByokForm } from "@/components/onboarding-byok-form";
import { IconAiSpark, IconCheck, IconKey } from "@/components/icons";

const TYPES = [
  {
    value: "independent",
    label: "Independent recruiter",
    note: "Solo. Free forever with your own API key.",
  },
  {
    value: "agency",
    label: "Agency",
    note: "A team recruiting for clients. Free for 30 days.",
  },
  {
    value: "inhouse",
    label: "In-house team",
    note: "Hiring for your own company. Free for 30 days.",
  },
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const step = Math.min(Math.max(Number((await searchParams).step ?? 1), 1), 3);
  const platformEnabled = env.platformProviderEnabled;
  const anthropicModels =
    step === 3 ? await listCatalogModels("anthropic") : [];

  async function saveName(formData: FormData) {
    "use server";
    await updateWorkspaceNameAction(formData);
    redirect("/onboarding?step=2");
  }
  async function saveType(formData: FormData) {
    "use server";
    await setWorkspaceTypeAction(formData);
    redirect("/onboarding?step=3");
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <div className="mb-8 flex items-center gap-2 text-mint-700">
        <IconAiSpark />
        <span className="font-display text-xl font-bold text-navy-900">
          Calyflow
        </span>
      </div>
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-mint-400" : "bg-navy-800/10"}`}
          />
        ))}
      </div>

      <div className="rounded-panel border border-navy-800/12 bg-white p-8">
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold">Name your workspace</h1>
            <p className="mb-6 mt-1 text-navy-800/55">
              Your team, clients, and workflows live here. You can change this
              anytime in Settings.
            </p>
            <form action={saveName} className="space-y-5">
              <Field label="Workspace name">
                <input
                  name="name"
                  defaultValue={session.workspace.name}
                  required
                  className={inputClass}
                />
              </Field>
              <Button type="submit">Continue</Button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-bold">What describes you best?</h1>
            <p className="mb-6 mt-1 text-navy-800/55">
              This shapes pricing and features later — everything is free
              right now.
            </p>
            <form action={saveType} className="space-y-3">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className="flex cursor-pointer items-start gap-3 rounded-card border border-navy-800/15 p-4 transition hover:border-mint-700"
                >
                  <input
                    type="radio"
                    name="workspaceType"
                    value={t.value}
                    required
                    defaultChecked={
                      session.workspace.workspace_type === t.value
                    }
                    className="mt-1.5 accent-[#1b7a5f]"
                  />
                  <span>
                    <span className="block font-semibold">{t.label}</span>
                    <span className="block text-sm text-navy-800/55">
                      {t.note}
                    </span>
                  </span>
                </label>
              ))}
              <Button type="submit" className="mt-2">
                Continue
              </Button>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-bold">Choose your AI setup</h1>
            <p className="mb-6 mt-1 text-navy-800/55">
              {platformEnabled
                ? "Start on Calyflow's built-in model with included credit, or bring your own API key."
                : "Add your AI provider API key to run workflows."}
            </p>

            {platformEnabled && (
              <form action={finishOnboardingAction} className="mb-6">
                <button
                  type="submit"
                  className="flex w-full items-start gap-3 rounded-card border border-mint-400/60 bg-mint-400/10 p-4 text-left transition hover:border-mint-700"
                >
                  <IconCheck className="mt-0.5 shrink-0 text-mint-700" />
                  <span>
                    <span className="block font-semibold">
                      Use Calyflow default
                    </span>
                    <span className="block text-sm text-navy-800/55">
                      No setup. Includes ~€10 of AI credit; add your own key
                      later anytime.
                    </span>
                  </span>
                </button>
              </form>
            )}

            <details open={!platformEnabled} className="group">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-mint-700">
                <IconKey size={20} /> Bring your own API key
              </summary>
              <OnboardingByokForm
                models={anthropicModels.filter((m) => m.curated)}
              />
            </details>

            {!platformEnabled && (
              <form action={finishOnboardingAction} className="mt-6">
                <button
                  type="submit"
                  className="text-sm text-navy-800/45 underline underline-offset-2 transition hover:text-navy-800/70"
                >
                  Skip for now — I don&apos;t have a key yet
                </button>
                <p className="mt-1 text-sm text-navy-800/45">
                  You can add one anytime in Settings → AI Providers. Workflows
                  won&apos;t run until a valid key is added.
                </p>
              </form>
            )}

            <p className="mt-6 text-sm text-navy-800/45">
              <Link href="/settings/providers" className="text-mint-700">
                More providers
              </Link>{" "}
              (OpenAI, Google) can be added in Settings.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
