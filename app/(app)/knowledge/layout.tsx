import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { KnowledgeTabNav } from "@/components/knowledge-tab-nav";

export default async function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <>
      <PageHeader title="Knowledge Base For AI" />
      <KnowledgeTabNav />
      {children}
    </>
  );
}
