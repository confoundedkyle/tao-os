import { PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </>
  );
}
