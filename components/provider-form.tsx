"use client";

import { useActionState, useState } from "react";
import { saveProviderAction, type SaveProviderResult } from "@/lib/actions/settings";
import { Button, Field, inputClass } from "./ui";

export interface ModelOption {
  provider: string;
  model_id: string;
  display_name: string;
  curated: boolean;
}

export function ProviderForm({
  models,
  existingProviders,
}: {
  models: ModelOption[];
  existingProviders: string[];
}) {
  const [provider, setProvider] = useState("anthropic");
  const [showAll, setShowAll] = useState(false);
  const [state, formAction, pending] = useActionState<SaveProviderResult | null, FormData>(
    saveProviderAction,
    null,
  );

  const options = models.filter(
    (m) => m.provider === provider && (showAll || m.curated),
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          <select
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={inputClass}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </select>
        </Field>
        <Field
          label="Default model"
          hint={
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-mint-700 hover:underline"
            >
              {showAll ? "Show recommended only" : "Show all models"}
            </button>
          }
        >
          <select name="defaultModel" className={inputClass}>
            {options.map((m) => (
              <option key={m.model_id} value={m.model_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="API key"
        hint={
          existingProviders.includes(provider)
            ? "Leave blank to keep the saved key (only its last 4 characters are stored for display)."
            : "Validated with a cheap test call when you save. Stored encrypted; never shown again."
        }
      >
        <input
          name="apiKey"
          type="password"
          placeholder={provider === "anthropic" ? "sk-ant-…" : "API key"}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      {state && !state.ok && (
        <p className="rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-chip bg-mint-400/15 px-3 py-2 text-sm text-mint-700">
          ✓ Provider saved and key validated.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Validating key…" : "Save provider"}
      </Button>
    </form>
  );
}
