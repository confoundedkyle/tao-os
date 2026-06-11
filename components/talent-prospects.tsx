"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  createProspectAction,
  deleteProspectAction,
  updateProspectAction,
} from "@/lib/actions/talent";
import type { TalentProspect } from "@/lib/types";
import { Button, Card, Field, inputClass } from "@/components/ui";

export function TalentProspects({
  prospects,
}: {
  prospects: TalentProspect[];
}) {
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const q = query.trim().toLowerCase();
  const visible = q
    ? prospects.filter((p) =>
        [p.name, p.email, p.city, p.country, p.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : prospects;

  async function add(formData: FormData) {
    await createProspectAction(formData);
    formRef.current?.reset();
  }

  return (
    <>
      <Card className="mb-5">
        <form ref={formRef} action={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="LinkedIn URL">
            <input
              name="linkedin_url"
              className={inputClass}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputClass} />
          </Field>
          <Field label="Country">
            <input name="country" className={inputClass} />
          </Field>
          <Field label="City">
            <input name="city" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (skills, abilities, context)">
              <textarea name="notes" rows={3} className={inputClass} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="small">
              Add prospect
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prospects…"
          className={`${inputClass} max-w-md`}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-navy-800/45">
          {prospects.length === 0 ? "No prospects yet." : "No matches."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((prospect) => (
            <ProspectRow key={prospect.id} prospect={prospect} />
          ))}
        </div>
      )}
    </>
  );
}

function ProspectRow({ prospect }: { prospect: TalentProspect }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (
      !window.confirm(
        `Delete "${prospect.name}" and any attached CV? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteProspectAction(prospect.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  async function save(formData: FormData) {
    await updateProspectAction(formData);
    setEditing(false);
  }

  if (editing) {
    return (
      <Card>
        <form action={save} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={prospect.id} />
          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={prospect.name}
              className={inputClass}
            />
          </Field>
          <Field label="LinkedIn URL">
            <input
              name="linkedin_url"
              defaultValue={prospect.linkedin_url ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={prospect.email ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              defaultValue={prospect.phone ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Country">
            <input
              name="country"
              defaultValue={prospect.country ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="City">
            <input
              name="city"
              defaultValue={prospect.city ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (skills, abilities, context)">
              <textarea
                name="notes"
                rows={3}
                defaultValue={prospect.notes ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
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

  const location = [prospect.city, prospect.country].filter(Boolean).join(", ");

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link
          href={`/talent-pool/${prospect.id}`}
          className="font-semibold hover:text-mint-700"
        >
          {prospect.name}
        </Link>
        <p className="mt-0.5 text-sm text-navy-800/55">
          {[location, prospect.email, prospect.phone]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        {prospect.notes && (
          <p className="mt-1 line-clamp-2 text-sm text-navy-800/45">
            {prospect.notes}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-coral-400">{error}</p>}
      </div>
      <div className="flex flex-shrink-0 gap-2">
        <Link
          href={`/talent-pool/${prospect.id}`}
          className="rounded-chip border border-navy-800/15 px-2.5 py-1 text-xs font-semibold text-navy-800/65 transition hover:border-navy-800/35 hover:text-navy-900"
        >
          Open
        </Link>
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
