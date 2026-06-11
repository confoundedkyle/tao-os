"use client";

import { useRef, useState, useTransition } from "react";
import {
  createCandidateAction,
  deleteCandidateAction,
  updateCandidateAction,
} from "@/lib/actions/ats";
import type { AtsCandidateStatus } from "@/lib/types";
import type { AtsCandidateWithProject } from "@/lib/queries";
import type { ClientWithProjects } from "@/components/sidebar-nav";
import { Button, Card, Chip, Field, inputClass } from "@/components/ui";

const STATUSES: AtsCandidateStatus[] = [
  "sourced",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

const STATUS_TONE: Record<
  AtsCandidateStatus,
  "navy" | "sky" | "mint" | "amber" | "coral"
> = {
  sourced: "navy",
  screening: "sky",
  interview: "amber",
  offer: "amber",
  hired: "mint",
  rejected: "coral",
};

function ProjectOptions({ clients }: { clients: ClientWithProjects[] }) {
  return (
    <>
      <option value="">— No role —</option>
      {clients.map((client) => (
        <optgroup key={client.id} label={client.name}>
          {client.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function AtsCandidates({
  candidates,
  clients,
}: {
  candidates: AtsCandidateWithProject[];
  clients: ClientWithProjects[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AtsCandidateStatus>("all");
  const formRef = useRef<HTMLFormElement>(null);

  const q = query.trim().toLowerCase();
  const visible = candidates.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (!q) return true;
    return [c.name, c.email, c.project?.name, c.project?.client?.name, c.notes]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q));
  });

  async function add(formData: FormData) {
    await createCandidateAction(formData);
    formRef.current?.reset();
  }

  return (
    <>
      <Card className="mb-5">
        <form ref={formRef} action={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Role">
            <select name="project_id" className={inputClass} defaultValue="">
              <ProjectOptions clients={clients} />
            </select>
          </Field>
          <Field label="Email">
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" className={inputClass} defaultValue="sourced">
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
              Add candidate
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search candidates…"
          className={`${inputClass} max-w-xs`}
        />
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "all" | AtsCandidateStatus)
          }
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
          {candidates.length === 0 ? "No candidates yet." : "No matches."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              clients={clients}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CandidateRow({
  candidate,
  clients,
}: {
  candidate: AtsCandidateWithProject;
  clients: ClientWithProjects[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Delete "${candidate.name}"?`)) return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteCandidateAction(candidate.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  async function save(formData: FormData) {
    await updateCandidateAction(formData);
    setEditing(false);
  }

  if (editing) {
    return (
      <Card>
        <form action={save} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={candidate.id} />
          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={candidate.name}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <select
              name="project_id"
              className={inputClass}
              defaultValue={candidate.project_id ?? ""}
            >
              <ProjectOptions clients={clients} />
            </select>
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={candidate.email ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              defaultValue={candidate.phone ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <select
              name="status"
              className={inputClass}
              defaultValue={candidate.status}
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
              defaultValue={candidate.notes ?? ""}
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

  const role = candidate.project
    ? [candidate.project.client?.name, candidate.project.name]
        .filter(Boolean)
        .join(" — ")
    : null;

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{candidate.name}</p>
          <Chip tone={STATUS_TONE[candidate.status]}>{candidate.status}</Chip>
        </div>
        <p className="mt-0.5 text-sm text-navy-800/55">
          {[role, candidate.email, candidate.phone].filter(Boolean).join(" · ") ||
            "—"}
        </p>
        {candidate.notes && (
          <p className="mt-1 text-sm text-navy-800/45">{candidate.notes}</p>
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
