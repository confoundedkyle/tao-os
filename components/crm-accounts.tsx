"use client";

import { useRef, useState, useTransition } from "react";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/crm";
import type { CrmAccount } from "@/lib/types";
import { Button, Card, Field, inputClass } from "@/components/ui";

export function CrmAccounts({ accounts }: { accounts: CrmAccount[] }) {
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const q = query.trim().toLowerCase();
  const visible = q
    ? accounts.filter((a) =>
        [a.name, a.website, a.industry, a.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : accounts;

  async function add(formData: FormData) {
    await createAccountAction(formData);
    formRef.current?.reset();
  }

  return (
    <section className="mb-12">
      <h2 className="mb-3 text-xl font-semibold">Accounts</h2>

      <Card className="mb-5">
        <form ref={formRef} action={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Website">
            <input name="website" className={inputClass} placeholder="https://" />
          </Field>
          <Field label="Industry">
            <input name="industry" className={inputClass} />
          </Field>
          <Field label="Notes">
            <input name="notes" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="small">
              Add account
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accounts…"
          className={inputClass}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-navy-800/45">
          {accounts.length === 0 ? "No accounts yet." : "No matches."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountRow({ account }: { account: CrmAccount }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Delete "${account.name}"?`)) return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteAccountAction(account.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  async function save(formData: FormData) {
    await updateAccountAction(formData);
    setEditing(false);
  }

  if (editing) {
    return (
      <Card>
        <form action={save} className="grid gap-3 sm:grid-cols-2">
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
            <input
              name="notes"
              defaultValue={account.notes ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="small">
              Save
            </Button>
            <Button
              type="button"
              variant="smallSecondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
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
          <p className="mt-1 text-sm text-navy-800/45">{account.notes}</p>
        )}
        {error && <p className="mt-1 text-xs text-coral-400">{error}</p>}
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
