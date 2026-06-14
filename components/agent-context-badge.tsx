import { Chip } from "./ui";

/** Where an agent belongs — "Recruiting Project" or "Business Development". */
export function AgentContextBadge({ context }: { context?: string | null }) {
  const bizDev = context === "business-development";
  return (
    <Chip tone={bizDev ? "sky" : "mint"}>
      {bizDev ? "Business Development" : "Recruiting Project"}
    </Chip>
  );
}
