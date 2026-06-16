import { redirect } from "next/navigation";

/** The agents list moved to /agents (the section is now "Agents", not
 *  "Workflows"). Redirect old links/bookmarks, preserving ?imported. */
export default async function WorkflowsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const { imported } = await searchParams;
  redirect(imported ? `/agents?imported=${imported}` : "/agents");
}
