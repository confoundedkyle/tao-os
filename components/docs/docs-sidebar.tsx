"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_NAV, type DocNavNode } from "@/lib/docs/nav";

function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function NavTree({
  nodes,
  pathname,
  depth = 0,
}: {
  nodes: DocNavNode[];
  pathname: string;
  depth?: number;
}) {
  return (
    <ul className={cn(depth > 0 && "ml-3 border-l border-navy-800/10 pl-3")}>
      {nodes.map((node) => {
        const active = node.href === pathname;
        const isGroup = !!node.children?.length;
        return (
          <li key={node.title} className="py-px">
            {node.href ? (
              <Link
                href={node.href}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-mint-400/15 font-semibold text-mint-700"
                    : isGroup
                      ? "font-semibold text-navy-800/80 hover:text-navy-900"
                      : "text-navy-800/65 hover:bg-cream-100 hover:text-navy-900",
                )}
              >
                {node.title}
              </Link>
            ) : (
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-navy-800/35">
                {node.title}
              </p>
            )}
            {isGroup && (
              <NavTree
                nodes={node.children!}
                pathname={pathname}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="p-3">
      <NavTree nodes={DOC_NAV} pathname={pathname} />
    </nav>
  );
}
