"use client";

import { useState, useTransition } from "react";
import { setModuleActiveAction } from "@/lib/actions/modules";
import { MODULES, type ModuleKey } from "@/lib/types";
import { useToast } from "@/components/use-toast";

export function ModulesGrid({
  activeKeys = [],
  canManage = false,
}: {
  activeKeys?: ModuleKey[];
  canManage?: boolean;
}) {
  const active = new Set(activeKeys);

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {MODULES.map((module) => (
        <div
          key={module.key}
          className="flex flex-col rounded-card border border-navy-800/12 bg-white p-5"
        >
          <h3 className="mb-2 text-lg font-semibold">{module.label}</h3>
          <p className="flex-1 text-sm text-navy-800/55">
            {module.description}
          </p>
          <ModuleFooter
            moduleKey={module.key}
            label={module.label}
            isActive={active.has(module.key)}
            canManage={canManage}
          />
        </div>
      ))}
    </div>
  );
}

function ModuleFooter({
  moduleKey,
  label,
  isActive,
  canManage,
}: {
  moduleKey: ModuleKey;
  label: string;
  isActive: boolean;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast, showToast } = useToast();

  function toggle() {
    startTransition(async () => {
      try {
        setError(null);
        await setModuleActiveAction(moduleKey, !isActive);
        showToast(`${label} ${isActive ? "deactivated" : "activated"}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update");
      }
    });
  }

  if (!canManage) {
    return (
      <div className="mt-4 flex items-center gap-2">
        <span
          className={`rounded-chip px-3 py-1.5 text-sm font-semibold ${
            isActive
              ? "bg-mint-400/20 text-mint-700"
              : "bg-navy-800/8 text-navy-800/50"
          }`}
        >
          {isActive ? "✓ Active" : "Inactive"}
        </span>
        <span className="text-xs text-navy-800/40">
          Ask a workspace admin to change this.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {isActive && (
          <span className="rounded-chip bg-mint-400/20 px-3 py-1.5 text-sm font-semibold text-mint-700">
            ✓ Active
          </span>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={toggle}
          className={
            isActive
              ? "ml-auto inline-flex items-center gap-1.5 rounded-chip border border-navy-800/15 px-3 py-1.5 text-sm font-medium text-navy-800/55 transition hover:border-coral-400/60 hover:bg-coral-400/10 hover:text-coral-400 disabled:opacity-40"
              : "rounded-chip bg-mint-400 px-4 py-1.5 text-sm font-semibold text-navy-800 transition hover:bg-mint-400/85 disabled:opacity-40"
          }
        >
          {pending
            ? isActive
              ? "Deactivating…"
              : "Activating…"
            : isActive
              ? "Deactivate"
              : "Activate"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-coral-400">
          {error}
        </p>
      )}
      {toast}
    </div>
  );
}
