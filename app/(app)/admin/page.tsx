import { notFound, redirect } from "next/navigation";
import { getSession, isPlatformAdmin } from "@/lib/auth";
import { adminListRuns, adminListUsers } from "@/lib/admin";
import { Chip, Mono, PageHeader } from "@/components/ui";

function date(ms: number | null): string {
  return ms
    ? new Date(ms).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!(await isPlatformAdmin())) notFound();

  const [users, runs] = await Promise.all([
    adminListUsers(),
    adminListRuns(session.userId),
  ]);

  return (
    <>
      <PageHeader
        title="Admin"
        description="Platform-wide overview of users and activity across every workspace."
      />

      {/* Users */}
      <div className="mb-6 overflow-x-auto rounded-card border border-navy-800/12 bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-semibold">Users</h2>
          <span className="text-sm text-navy-800/45">{users.length} total</span>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-navy-800/8 text-left text-xs font-semibold uppercase tracking-wider text-navy-800/40">
              <th className="px-5 py-2 font-semibold">User</th>
              <th className="px-5 py-2 font-semibold">Registered</th>
              <th className="px-5 py-2 font-semibold">Last signed in</th>
              <th className="px-5 py-2 text-right font-semibold">Runs</th>
              <th className="px-5 py-2 text-right font-semibold">Spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/8">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-2.5">
                  <div className="font-medium text-navy-800/85">
                    {u.name ?? u.email}
                  </div>
                  {u.name && (
                    <div className="text-xs text-navy-800/45">{u.email}</div>
                  )}
                </td>
                <td className="px-5 py-2.5 text-navy-800/65">
                  {date(u.createdAt)}
                </td>
                <td className="px-5 py-2.5 text-navy-800/65">
                  {date(u.lastSignInAt)}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Mono>{u.runCount}</Mono>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Mono>${u.spentUsd.toFixed(4)}</Mono>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-navy-800/45">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Runs */}
      <div className="overflow-x-auto rounded-card border border-navy-800/12 bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-semibold">Runs</h2>
          <span className="text-sm text-navy-800/45">
            Excluding your own account · last {runs.length}
          </span>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-y border-navy-800/8 text-left text-xs font-semibold uppercase tracking-wider text-navy-800/40">
              <th className="px-5 py-2 font-semibold">Name</th>
              <th className="px-5 py-2 font-semibold">User</th>
              <th className="px-5 py-2 font-semibold">Date</th>
              <th className="px-5 py-2 font-semibold">Provider</th>
              <th className="px-5 py-2 text-right font-semibold">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/8">
            {runs.map((r) => (
              <tr key={`${r.kind}:${r.id}`}>
                <td className="px-5 py-2.5">
                  <span className="font-medium text-navy-800/85">{r.name}</span>{" "}
                  <Chip tone={r.kind === "agent" ? "mint" : "navy"}>
                    {r.kind}
                  </Chip>
                </td>
                <td className="px-5 py-2.5 text-navy-800/65">
                  {r.runnerName ?? "—"}
                </td>
                <td className="px-5 py-2.5 text-navy-800/65">
                  {dateTime(r.createdAt)}
                </td>
                <td className="px-5 py-2.5 text-navy-800/65">
                  {r.provider ?? "—"}
                  {r.model ? (
                    <span className="text-navy-800/40"> · {r.model}</span>
                  ) : null}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Mono>{r.tokens.toLocaleString("en-US")}</Mono>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-navy-800/45">
                  No runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
