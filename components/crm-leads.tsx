"use client";

import { useRef, useState, useTransition } from "react";
import {
  createLeadAction,
  deleteLeadAction,
  updateLeadAction,
} from "@/lib/actions/crm";
import type { CrmAccount, CrmLeadStatus } from "@/lib/types";
import type { CrmLeadWithAccount } from "@/lib/queries";
import { Button, Card, Chip, Field, inputClass } from "@/components/ui";

const STATUSES: CrmLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

const STATUS_TONE: Record<CrmLeadStatus, "navy" | "sky" | "mint" | "coral"> = {
  new: "navy",
  contacted: "sky",
  qualified: "mint",
  won: "mint",
  lost: "coral",
};

export function CrmLeads({
  leads,
  accounts,
}: {
  leads: CrmLeadWithAccount[];
  accounts: CrmAccount[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CrmLeadStatus>("all");
  const formRef = useRef<HTMLFormElement>(null);

  const q = query.trim().toLowerCase();
  const visible = leads.filter((lead) => {
    if (status !== "all" && lead.status !== status) return false;
    if (!q) return true;
    return [lead.name, lead.email, lead.title, lead.account?.name, lead.notes]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q));
  });

  async function add(formData: FormData) {
    await createLeadAction(formData);
    formRef.current?.reset();
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">Leads</h2>

      <Card className="mb-5">
        <form ref={formRef} action={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Account">
            <select name="account_id" className={inputClass} defaultValue="">
              <option value="">— No account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputClass} />
          </Field>
          <Field label="Title">
            <input name="title" className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" className={inputClass} defaultValue="new">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input name="notes" className={inputClass} />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" variant="small">
              Add lead
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search leads…"
          className={`${inputClass} max-w-xs`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | CrmLeadStatus)}
          className={`${inputClass} max-w-[12rem]`}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-navy-800/45">
          {leads.length === 0 ? "No leads yet." : "No matches."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((lead) => (
            <LeadRow key={lead.id} lead={lead} accounts={accounts} />
          ))}
        </div>
      )}
    </section>
  );
}

function LeadRow({
  lead,
  accounts,
}: {
  lead: CrmLeadWithAccount;
  accounts: CrmAccount[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Delete "${lead.name}"?`)) return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteLeadAction(lead.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  async function save(formData: FormData) {
    await updateLeadAction(formData);
    setEditing(false);
  }

  if (editing) {
    return (
      <Card>
        <form action={save} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={lead.name}
              className={inputClass}
            />
          </Field>
          <Field label="Account">
            <select
              name="account_id"
              className={inputClass}
              defaultValue={lead.account_id ?? ""}
            >
              <option value="">— No account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={lead.email ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              defaultValue={lead.phone ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Title">
            <input
              name="title"
              defaultValue={lead.title ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <select
              name="status"
              className={inputClass}
              defaultValue={lead.status}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input
              name="notes"
              defaultValue={lead.notes ?? ""}
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{lead.name}</p>
          <Chip tone={STATUS_TONE[lead.status]}>{lead.status}</Chip>
        </div>
        <p className="mt-0.5 text-sm text-navy-800/55">
          {[lead.title, lead.account?.name, lead.email, lead.phone]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        {lead.notes && (
          <p className="mt-1 text-sm text-navy-800/45">{lead.notes}</p>
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
