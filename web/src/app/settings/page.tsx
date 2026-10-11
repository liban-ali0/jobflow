import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/data";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Search, ranking, engines"
        title="Settings"
        description="The rules every step follows when it searches, ranks, and selects."
        actions={
          <Link href="/setup" className="btn btn-quiet">
            Setup checklist
          </Link>
        }
      />
      <div className="mt-8">
        <SettingsForm settings={getSettings()} />
      </div>
    </div>
  );
}
