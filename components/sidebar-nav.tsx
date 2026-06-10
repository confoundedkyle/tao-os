"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Client, Project } from "@/lib/types";

type ClientWithProjects = Client & { projects: Project[] };

const mainNav = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/workflows", label: "Workflows" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/settings", label: "Settings" },
];

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function SidebarNav({ clients }: { clients: ClientWithProjects[] }) {
  const pathname = usePathname();

  const activeClientId = pathname.match(/^\/clients\/([^/]+)/)?.[1];

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (activeClientId) s.add(activeClientId);
    return s;
  });

  const toggle = (clientId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {mainNav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(item.href, item.exact)
              ? "bg-mint-400/15 text-mint-700"
              : "text-navy-800/65 hover:bg-cream-100 hover:text-navy-900",
          )}
        >
          {item.label}
        </Link>
      ))}

      <div className="my-2 border-t border-navy-800/10" />

      <div className="mb-1 flex items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-navy-800/35">
          Clients
        </span>
        <Link
          href="/clients"
          className="text-xs text-navy-800/35 transition-colors hover:text-navy-800/70"
          title="All projects"
        >
          See all
        </Link>
      </div>

      {clients.length === 0 && (
        <p className="px-3 py-1 text-xs text-navy-800/35">No clients yet</p>
      )}

      {clients.map((client) => {
        const isClientActive = pathname.startsWith(`/clients/${client.id}`);
        const isOpen = expanded.has(client.id);

        return (
          <div key={client.id}>
            <div
              className={cn(
                "flex items-center gap-0.5 rounded-lg transition-colors",
                isClientActive && !isOpen ? "bg-mint-400/15" : "",
              )}
            >
              <button
                onClick={() => toggle(client.id)}
                className="flex h-8 w-6 flex-shrink-0 items-center justify-center text-navy-800/30 transition-colors hover:text-navy-800/60"
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                <Chevron
                  className={cn(
                    "transition-transform duration-150",
                    isOpen ? "rotate-90" : "",
                  )}
                />
              </button>
              <Link
                href={`/clients/${client.id}`}
                className={cn(
                  "flex-1 truncate py-1.5 pr-2 text-sm transition-colors",
                  isClientActive
                    ? "font-medium text-navy-900"
                    : "text-navy-800/65 hover:text-navy-900",
                )}
              >
                {client.name}
              </Link>
            </div>

            {isOpen && (
              <div className="ml-5 flex flex-col gap-0.5 pb-0.5">
                {client.projects.length === 0 && (
                  <p className="px-3 py-1 text-xs text-navy-800/30">
                    No projects
                  </p>
                )}
                {client.projects.map((project) => {
                  const href = `/clients/${client.id}/projects/${project.id}`;
                  const active = pathname === href;
                  return (
                    <Link
                      key={project.id}
                      href={href}
                      className={cn(
                        "truncate rounded-lg px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-mint-400/15 font-medium text-mint-700"
                          : "text-navy-800/55 hover:bg-cream-100 hover:text-navy-900",
                      )}
                    >
                      {project.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
