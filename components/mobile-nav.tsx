"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { ModuleKey } from "@/lib/types";
import { SidebarNav, type ClientWithProjects } from "./sidebar-nav";

/** Hamburger button + slide-over drawer with the app nav; the account
 *  controls are passed in as server-rendered children. */
export function MobileNav({
  clients,
  demo = null,
  modules = [],
  children,
}: {
  clients: ClientWithProjects[];
  demo?: ClientWithProjects | null;
  modules?: ModuleKey[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating. Done during render (not in an effect)
  // per React's "you might not need an effect" guidance — guarded so it
  // converges in one extra render.
  const [navPath, setNavPath] = useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-navy-800/70 transition hover:bg-cream-100"
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-900/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-cream-50 shadow-lift">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-navy-800/10 py-2 pl-5 pr-2">