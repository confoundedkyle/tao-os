"use client";

import { useActionState } from "react";
import {
  saveProviderAndFinishOnboardingAction,
  type SaveProviderResult,
} from "@/lib/actions/settings";
import { Button, Field, inputClass } from "./ui";
import type { ModelOption } from "./provider-form";

export function OnboardingByokForm({ models }: { models: ModelOption[] }) {
  const [state, formAction, pending] = useActionState<
    SaveProviderResult | null,
    FormData
  >(saveProviderAndFinishOnboardingAction, null);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="provider" value="anthropic" />
      <Field label="Anthropic API key">
        <input
          name="apiKey"
          type="password"
          required
          placeholder="sk-ant-…"
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <Field
        label="Default model"
        hint="Calyflow's prompts are written and tested for Claude."
      >
        <select name="defaultModel" className={inputClass}>
          {models.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </Field>
      {state && !state.ok && (
        <p className="rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
          {state.error} You can fix the key and try again, or skip for now.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Validating key…" : "Validate & finish"}
      </Button>
    </form>
  );
}
