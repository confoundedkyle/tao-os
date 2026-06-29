"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aiMapColumnsAction,
  importProspectsAction,
} from "@/lib/actions/talent";
import {
  detectHeader,
  isLinkedInConnectionsHeader,
  mapKnownColumns,
  parseCsv,
  rowsToProspects,
  type ImportProspect,
  type ProspectField,
} from "@/lib/linkedin-csv";
import { Button, Card } from "@/components/ui";

// Insert in chunks so a big export never trips a server-action body limit and
// the recruiter sees progress.
const BATCH = 500;

interface Preview {
  prospects: ImportProspect[];
  fields: ProspectField[];
  knownFormat: boolean;
  totalRows: number;
}

const nonBlank = (rows: string[][]) =>
  rows.filter((r) => r.some((c) => c.trim() !== ""));

export function LinkedInImportCard({
  onDone,
}: {
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, startImport] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [showHelp, setShowHelp] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setPreview(null);
    setProgress(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const rows = parseCsv(await file.text());
      const header = detectHeader(rows);
      if (!header) {
        setError("That file looks empty — no rows found.");
        return;
      }
      const dataRows = rows.slice(header.index + 1);
      let mapping: (ProspectField | null)[];
      let knownFormat = false;
      if (isLinkedInConnectionsHeader(header.cells)) {
        mapping = mapKnownColumns(header.cells);
        knownFormat = true;
      } else {
        // Not the LinkedIn export — let AI map the columns from a few samples.
        mapping = await aiMapColumnsAction(header.cells, nonBlank(dataRows).slice(0, 3));
      }
      const prospects = rowsToProspects(dataRows, header.cells, mapping);
      if (prospects.length === 0) {
        setError(
          "Couldn't find any people to import — every row was missing a name.",
        );
        return;
      }
      setPreview({
        prospects,
        fields: mapping.filter((f): f is ProspectField => !!f),
        knownFormat,
        totalRows: nonBlank(dataRows).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that CSV.");
    } finally {
      setParsing(false);
    }
  }

  function runImport() {
    if (!preview) return;
    startImport(async () => {
      try {
        setError(null);
        const all = preview.prospects;
        let inserted = 0;
        let skipped = 0;
        setProgress({ done: 0, total: all.length });
        for (let i = 0; i < all.length; i += BATCH) {
          const res = await importProspectsAction(all.slice(i, i + BATCH));
          inserted += res.inserted;
          skipped += res.skipped;
          setProgress({ done: Math.min(i + BATCH, all.length), total: all.length });
        }
        router.refresh();
        onDone(
          `Imported ${inserted} ${inserted === 1 ? "connection" : "connections"}` +
            (skipped ? `, skipped ${skipped} already in your pool` : ""),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
        setProgress(null);
      }
    });
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Import from LinkedIn</h3>
          <p className="mt-0.5 text-sm text-navy-800/55">
            Upload your exported <code>Connections.csv</code> to add your 1st-degree
            connections to the talent pool.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="shrink-0 rounded-chip border border-navy-800/15 px-2.5 py-1 text-xs font-semibold text-navy-800/65 transition hover:border-navy-800/35 hover:text-navy-900"
        >
          {showHelp ? "Hide steps" : "How to export"}
        </button>
      </div>

      {showHelp && (
        <ol className="mt-3 list-decimal space-y-1 rounded-card bg-cream-100/70 py-3 pl-8 pr-4 text-sm text-navy-800/70">
          <li>On LinkedIn, click your profile icon in the top menu.</li>
          <li>Choose <strong>Settings &amp; Privacy</strong>.</li>
          <li>In the sidebar choose <strong>Data privacy</strong>, then <strong>Get a copy of your data</strong>.</li>
          <li>
            Pick the first option —{" "}
            <strong>Download larger data archive, including connections</strong> —
            and request it.
          </li>
          <li>
            LinkedIn takes a few hours to prepare it. Check the download page later,
            then upload the <code>Connections.csv</code> from the archive here.
          </li>
        </ol>
      )}

      <div className="mt-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-card border border-dashed border-navy-800/25 px-4 py-3 text-sm transition hover:border-mint-700 hover:bg-mint-400/5">
          <span className="rounded-chip bg-mint-400 px-3 py-1.5 text-xs font-bold text-navy-900">
            Choose CSV
          </span>
          <span className="truncate text-navy-800/60">
            {fileName ?? "Connections.csv (or any contacts CSV)"}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={parsing || importing}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {parsing && (
        <p className="mt-3 text-sm text-navy-800/55">Reading the file…</p>
      )}

      {preview && !importing && (
        <div className="mt-4 rounded-card border border-navy-800/12 bg-white p-4">
          <p className="text-sm font-medium text-navy-800/80">
            Found {preview.prospects.length}{" "}
            {preview.prospects.length === 1 ? "person" : "people"} to import
            {preview.totalRows > preview.prospects.length
              ? ` (${preview.totalRows - preview.prospects.length} row(s) had no name and were skipped)`
              : ""}
            .
          </p>
          <p className="mt-1 text-xs text-navy-800/50">
            {preview.knownFormat
              ? "Recognised the LinkedIn Connections export — columns mapped automatically."
              : "Not a LinkedIn export, so columns were mapped with AI. Mapped fields:"}{" "}
            {!preview.knownFormat && preview.fields.join(", ")}
          </p>
          <p className="mt-2 truncate text-xs text-navy-800/45">
            e.g. {preview.prospects.slice(0, 3).map((p) => p.name).join(", ")}
            {preview.prospects.length > 3 ? " …" : ""}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="small" onClick={runImport}>
              Import {preview.prospects.length}{" "}
              {preview.prospects.length === 1 ? "person" : "people"}
            </Button>
            <Button
              variant="smallSecondary"
              onClick={() => {
                setPreview(null);
                setFileName(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {importing && progress && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-800/8">
            <div
              className="h-full rounded-full bg-mint-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-navy-800/50">
            Importing… {progress.done} of {progress.total}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-coral-400">
          {error}
        </p>
      )}
    </Card>
  );
}
