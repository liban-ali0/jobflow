import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { COUNTRY_OPTIONS, codeFor } from "@/lib/countries";
import { EXTENSION_DIR, captureToken } from "@/lib/capture";
import { getSettings } from "@/lib/data";
import { accessKey } from "@/lib/access";

// Addresses other devices can use: the Tailscale name and address set in
// web/.env.local (JOBFLOW_DEV_ORIGINS), on the app's port.
function pairingLinks(key: string) {
  const port = process.env.PORT ?? "3000";
  return (process.env.JOBFLOW_DEV_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map((host) => `http://${host}:${port}/pair?key=${key}`);
}

export default function SettingsPage() {
  const token = captureToken();
  const key = accessKey();
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
        <SettingsForm settings={{ ...settings, countries }} countryOptions={COUNTRY_OPTIONS} extension={{ token, folder: EXTENSION_DIR }} devices={{ links: pairingLinks(key), path: `/pair?key=${key}` }} />
      </div>
    </div>
  );
}
