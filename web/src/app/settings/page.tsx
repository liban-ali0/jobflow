import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { COUNTRY_OPTIONS, codeFor } from "@/lib/countries";
import { getSettings } from "@/lib/data";

export default function SettingsPage() {
  const settings = getSettings();
  // Countries saved before the picker existed have only a name.
  const countries = settings.countries.map((country) => ({ ...country, code: country.code ?? codeFor(country.name) ?? "" }));
  return (
    <div className="max-w-6xl">
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
        <SettingsForm settings={{ ...settings, countries }} countryOptions={COUNTRY_OPTIONS} />
      </div>
    </div>
  );
}
