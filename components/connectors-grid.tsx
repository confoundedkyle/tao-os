"use client";

import { useMemo, useState } from "react";
import {
  CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  type ConnectorCategory,
} from "@/lib/connectors";

type Filter = "all" | ConnectorCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ats", label: "ATS" },
  { value: "crm", label: "CRM" },
  { value: "tool", label: "Tools" },
];

const BADGE_STYLES: Record<ConnectorCategory, string> = {
  ats: "bg-mint-400/20 text-mint-700",
  crm: "bg-sky-300/25 text-navy-800/75",
  tool: "bg-amber-400/15 text-amber-400",
};

export function ConnectorsGrid() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () =>
      CONNECTORS.filter((c) => filter === "all" || c.category === filter).sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    [filter],
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={[
              "rounded-chip px-4 py-1.5 text-sm font-semibold transition",
              filter === f.value
                ? "bg-mint-400 text-navy-800"
                : "border border-navy-800/20 text-navy-800/60 hover:border-navy-800/45 hover:text-navy-900",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((connector) => (
          <div
            key={connector.name}
            className="flex flex-col rounded-card border border-navy-800/12 bg-white p-5"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{connector.name}</h3>
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[connector.category]}`}
              >
                {CONNECTOR_CATEGORY_LABELS[connector.category]}
              </span>
            </div>
            <p className="flex-1 text-sm text-navy-800/55">{connector.blurb}</p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="cursor-not-allowed rounded-chip border border-navy-800/15 bg-cream-100 px-4 py-1.5 text-sm font-semibold text-navy-800/35"
              >
                Activate
              </button>
              <span className="text-xs text-navy-800/35">Coming soon</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
