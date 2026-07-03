import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureDemoProject } from "@/lib/demo";
import {
  getDocument,
  getLibraryAgentBySlug,
  getPrimaryRunModel,
  getWorkspaceAgent,
  listConnections,
} from "@/lib/queries";
import { deriveAgentGraph } from "@/lib/workflow-graph";
import { DemoExperience } from "@/components/demo/demo-experience";

export const metadata = { title: "Demo · TAO OS" };

export default async function DemoPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const demo = await ensureDemoProject(session.workspaceId, session.userId);

  const [agent, model, , jdDoc, libraryAgent] = await Promise.all([
    getWorkspaceAgent(session.workspaceId, demo.agentId),
    getPrimaryRunModel(session.workspaceId),
    listConnections(session.workspaceId),
    getDocument(session.workspaceId, demo.jd.id),
    getLibraryAgentBySlug("cv-screener"),
  ]);
  if (!agent) redirect("/library?tab=agents");

  // CV Screener needs no external connectors — a plain knowledge-base agent.
  // Same derivation (slug + description) as every other surface, so the canvas
  // is identical across the app and the API export.
  const graph = deriveAgentGraph({
    name: agent.name,
    connectors: [],
    model,
    slug: "cv-screener",
    description: libraryAgent?.description,
    instructions: agent.instructions,
  });

  return (
    <DemoExperience
      projectId={demo.projectId}
      agentId={demo.agentId}
      agentName={agent.name}
      graph={graph}
      jd={{
        id: demo.jd.id,
        filename: demo.jd.filename,
        text: jdDoc?.extracted_text ?? "",
      }}
      cvs={demo.cvs}
    />
  );
}
