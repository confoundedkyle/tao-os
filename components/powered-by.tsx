import Link from "next/link";
import { getPrimaryRunModel } from "@/lib/queries";
import { ProviderLogo } from "./provider-logos";

/** "Powered by <provider>" pill shown in the laptop topbar. Links to the
 *  AI provider settings tab. Renders nothing until a provider is configured. */
export async function PoweredBy({ workspaceId }: { workspaceId: string }) {
  const primary = await getPrimaryRunModel(workspaceId);
  if (!primary) return null;

  return (
    <Link
      href="/settings/providers"
      title={`Model: ${primary.modelId}`}
      className="flex items-center gap-1.5 rounded-full border border-navy-800/12 px-2.5 py-1 text-xs font-medium text-navy-800/55 transition-colors hover:border-navy-800/30 hover:text-navy-800"
    >
      <ProviderLogo provider={primary.provider} size={14} />
      <span className="whitespace-nowrap">
        Powered by {primary.providerLabel}
      </span>
    </Link>
  );
}
