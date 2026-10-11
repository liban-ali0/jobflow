import { runStage, saveFacts, saveRules } from "@/app/actions";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { TextForm } from "@/components/text-form";
import { getSettings, hasCv, listRuns, profileUpdatedAt, readFacts, readProfile } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

const RULES_EXAMPLE = `Examples:
- Skip jobs that require German or French.
- Prefer Java Spring Boot roles over .NET roles.
- Treat government contractor roles in Riyadh as a plus.`;

// The profile's "Gaps" section lists what the CV is missing or unclear about.
function gapsOf(profile: string | null) {
  const section = profile?.split(/^## Gaps\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .map((line) => line.replace(/^\s*(\d+\.|[-*])\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const profile = readProfile();
  const facts = readFacts();
  const gaps = gapsOf(profile);
  const lastBuild = listRuns(50).find((run) => run.stage === "build-profile");
  const cv = hasCv();
  const updatedAt = profileUpdatedAt();

  return (
    <div className="max-w-4xl">
      <AutoRefresh active={lastBuild?.status === "running"} />
      <PageHeader
        eyebrow={
          lastBuild?.status === "running"
            ? "Rebuilding now"
            : lastBuild?.status === "failed"
              ? `Last rebuild failed ${formatDateTime(lastBuild.finished_at)} · see Activity`
              : updatedAt
                ? `Built ${formatDateTime(updatedAt)}`
                : "Not built yet"
        }
        title="Profile"
        description="What every step knows about you. The CV is the source; the facts fill in what it leaves out."
        actions={
          <ActionButton
            variant="primary"
            action={runStage.bind(null, "build-profile", null)}
            disabled={!cv || lastBuild?.status === "running"}
            title={cv ? "Rebuilds the profile and the three base CVs from your CV and facts" : "Add the CV as a PDF in the candidate folder first"}
          >
            Rebuild profile
          </ActionButton>
        }
      />

      {gaps.length > 0 && (
        <section className="card mt-8 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="card-title">CV improvements</h2>
            <span className="font-mono text-xs text-slate">{gaps.length} found</span>
          </div>
          <p className="mt-1 text-sm text-slate">
            Things to fix or add in the CV itself. Questions only you can answer go to{" "}
            <Link href="/questions" className="text-teal underline">
              Questions
            </Link>
            .
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            {gaps.slice(0, 4).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ol>
          {gaps.length > 4 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-slate hover:text-ink">Show {gaps.length - 4} more</summary>
              <ol start={5} className="mt-2 list-decimal space-y-1.5 pl-5">
                {gaps.slice(4).map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      <div className="mt-8 space-y-6">
        <TextForm
          action={saveFacts}
          name="facts"
          label="Facts about you"
          hint="Anything the CV does not say: employment type per job, current location, languages, visa, preferences. When the CV and these facts disagree, the facts win."
          defaultValue={facts ?? ""}
          rows={18}
          button="Save facts"
        />

        <TextForm
          action={saveRules}
          name="rules"
          label="Extra ranking rules"
          hint="Plain-language rules the ranking step must follow on top of the built-in ones. They override the built-in rules when the two conflict."
          defaultValue={getSettings().customRules ?? ""}
          placeholder={RULES_EXAMPLE}
          rows={7}
          button="Save rules"
        />

        <section className="card p-5">
          <h2 className="card-title">Current profile</h2>
          {profile ? (
            <pre className="mt-3 max-h-[32rem] overflow-auto rounded bg-mist p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap" dir="auto">
              {profile}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-slate">
              No profile yet. {cv ? "Use Rebuild profile to create it from your CV." : "Add your CV as a PDF in the candidate folder first."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
