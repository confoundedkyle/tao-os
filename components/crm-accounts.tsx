"use client";

import { useState, useTransition } from "react";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/crm";
import type { CrmAccount } from "@/lib/types";
import { Button, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/use-toast";

export function CrmAccounts({ accounts }: { accounts: CrmAccount[] }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast, showToast } = useToast();

  const q = query.trim().toLowerCase();
  const visible = q
    ? accounts.filter((a) =>
        [a.name, a.website, a.industry, a.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : accounts;

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        setError(null);
        await createAccountAction(formData);
        setAdding(false);
        showToast("Account added");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add account");
      }
    });
  }

  return (
    <section className="mb-12">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <Button variant="small" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add account"}
        </Button>
      </div>

      {adding && (
        <Card className="mb-5">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Website">
              <input
                name="website"
                className={inputClass}
                placeholder="https://"
              />
            </Field>
            <Field label="Industry">
              <input name="industry" className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={3} className={inputClass} />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="small" disabled={pending}>
                {pending ? "Adding…" : "Add account"}
              </Button>
              {error && (
                <p role="alert" className="text-xs text-coral-400">
                  {error}
                </p>
              )}
            </div>
          </form>
        </Card>
      )}

      {accounts.length === 0 ? (
        !adding && (
          <EmptyState
            title="No accounts yet"
            description="Add the companies you work with to start tracking leads against them."
            action={
              <Button variant="small" onClick={() => setAdding(true)}>
                Add account
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              aria-label="Search accounts"
              className={inputClass}
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-navy-800/45">
              No matches.{" "}
              <button
                type="button"
                onClick={() => setQuery("")}
                className="font-semibold text-mint-700 hover:underline"
              >
                Clear search
              </button>
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  showToast={showToast}
                />
              ))}
            </div>
          )}
        </>
      )}

      {toast}
    </section>
  );
}

function AccountRow({
  account,
  showToast,
}: {
  account: CrmAccount;
  showToast: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`))
      return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteAccountAction(account.id);
        showToast("Account deleted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        setError(null);
        await updateAccountAction(formData);
        showToast("Account updated");
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  if (editing) {
    return (
      <Card>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={account.id} />
          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={account.name}
              className={inputClass}
            />
          </Field>
          <Field label="Website">
            <input
              name="website"
              defaultValue={account.website ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Industry">
            <input
              name="industry"
              defaultValue={account.industry ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              rows={3}
              defaultValue={account.notes ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" variant="small" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="smallSecondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            {error && (
              <p role="alert" className="text-xs text-coral-400">
                {error}
              </p>
            )}
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{account.name}</p>
        <p className="mt-0.5 text-sm text-navy-800/55">
          {[account.industry, account.website].filter(Boolean).join(" · ") ||
            "—"}
        </p>
        {account.notes && (
          <p className="mt-1 line-clamp-2 text-sm text-navy-800/45">
            {account.notes}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-coral-400">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={pending}
          className="rounded-chip border border-navy-800/15 px-2.5 py-1 text-xs font-semibold text-navy-800/65 transition hover:border-navy-800/35 hover:text-navy-900 disabled:opacity-40"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-chip border border-navy-800/15 px-2.5 py-1 text-xs font-medium text-navy-800/45 transition hover:border-coral-400/50 hover:text-coral-400 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </Card>
  );
}
