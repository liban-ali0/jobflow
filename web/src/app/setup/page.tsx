import Link from "next/link";
import { runEngineCheck, runStage, saveFacts } from "@/app/actions";
import { factsVersion } from "@/lib/data";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { CvUpload } from "@/components/cv-upload";
import { PageHeader } from "@/components/page-header";
import { TextForm } from "@/components/text-form";
import { ROOT, cvName, getSettings, listRuns, readFacts, readProfile } from "@/lib/data";
import { ENGINES, type EngineKey } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";

const FACTS_TEMPLATE = `# Facts not on the CV

- Where I live now:
- Nationality:
- Visas or work permits I already hold:
- Languages and level:
- Notice period or earliest start date:
- Each job on my CV: full-time, part-time, or internship:
- Anything else employers should know:
`;

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full font-display text-lg font-bold ${done ? "bg-go text-white" : "bg-mist text-ink"}`}
          aria-hidden
        >
          {done ? "✓" : number}
        </span>
        <h2 className="card-title">{title}</h2>
        <span className={`ml-auto font-mono text-xs uppercase ${done ? "text-go" : "text-slate"}`}>{done ? "Done" : "To do"}</span>
      </div>
      <div className="mt-4 space-y-3 text-sm">{children}</div>
    </section>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-mist px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
);

export default function SetupPage() {
  const settings = getSettings();
  const savedCheck = settings.setupCheck;
  const cv = cvName();
  const facts = readFacts();
  const profile = readProfile();
  const build = listRuns(50).find((run) => run.stage === "build-profile");
  const engine: EngineKey = settings.engines?.["build-profile"]?.engine ?? "claude";
  // A check counts only for the engine it tested.
  const check = savedCheck && savedCheck.engine === engine ? savedCheck : null;
  const targets = settings.countries.length > 0 && settings.roles.length > 0;

  const done = {
    engine: Boolean(check?.ok),
    cv: Boolean(cv),
    facts: Boolean(facts && facts.trim() !== FACTS_TEMPLATE.trim()),
    targets,
    profile: Boolean(profile),
  };
  const left = Object.values(done).filter((value) => !value).length;

  return (
    <div className="max-w-3xl">
      <AutoRefresh active={build?.status === "running"} />
      <PageHeader
        eyebrow={left === 0 ? "All set" : `${left} of 5 steps left`}
        title="Setup"
        description="Everything Offerbound needs before it can find and rank jobs for you. Each step can be changed again later."
      />

      <div className="mt-8 space-y-6">
        <Step number={1} title={`Connect ${ENGINES[engine].label}`} done={done.engine}>
          <p>
            Offerbound does its work through {ENGINES[engine].label} on this computer, using your {engine === "claude" ? "Claude" : "ChatGPT"} subscription. You can choose the engine for
            each step in Settings. Once per computer:
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Install it: <Code>{engine === "claude" ? "npm install -g @anthropic-ai/claude-code" : "npm install -g @openai/codex"}</Code>
            </li>
            <li>
              Open a terminal in this folder and run <Code>{engine}</Code>. Sign in with your {engine === "claude" ? "Claude" : "ChatGPT"} account and accept the prompt to trust the folder.
              <span className="mt-1 block font-mono text-xs break-all text-slate">{ROOT}</span>
            </li>
            <li>Close it, then check the connection here.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton variant={done.engine ? "quiet" : "primary"} action={runEngineCheck.bind(null, engine)}>
              Check {ENGINES[engine].label}
            </ActionButton>
          </div>
          {check && (
            <p className={check.ok ? "text-go" : "text-coral"}>
              {check.message} <span className="text-xs text-slate">({formatDateTime(check.at)})</span>
            </p>
          )}
        </Step>

        <Step number={2} title="Add your CV" done={done.cv}>
          <p>A PDF of your current CV. Everything Offerbound writes is based on it, and nothing is added that it does not say.</p>
          <CvUpload current={cv} />
        </Step>

        <Step number={3} title="Tell it what the CV does not say" done={done.facts}>
          <p>Fill in what applies and delete the rest. When the CV and these facts disagree, the facts win.</p>
          <TextForm
            action={saveFacts}
          version={factsVersion()}
            name="facts"
            label="Facts about you"
            hint="Also editable later on the Profile screen."
            defaultValue={facts ?? FACTS_TEMPLATE}
            rows={11}
            button="Save facts"
            bare
          />
        </Step>

        <Step number={4} title="Choose where and what to search" done={done.targets}>
          {targets ? (
            <p>
              Countries: {settings.countries.map((country) => country.name).join(", ")}
              <br />
              Roles: {settings.roles.map((role) => role.label).join(", ")}
            </p>
          ) : (
            <p>Add the countries you want to work in and the kinds of job you want, with a few search keywords each.</p>
          )}
          <Link href="/settings" className="btn btn-quiet">
            {targets ? "Change in Settings" : "Open Settings"}
          </Link>
        </Step>

        <Step number={5} title="Build your profile" done={done.profile}>
          <p>
            The engine reads your CV and facts and writes your profile plus one base CV per role. Takes a few minutes. Questions it has for you appear under{" "}
            <Link href="/questions" className="text-teal underline">
              Questions
            </Link>
            .
          </p>
          <ActionButton
            variant={done.profile ? "quiet" : "primary"}
            action={runStage.bind(null, "build-profile", null)}
            disabled={!done.cv || build?.status === "running"}
            title={done.cv ? undefined : "Add your CV first"}
          >
            {build?.status === "running" ? "Building…" : done.profile ? "Rebuild profile" : "Build profile"}
          </ActionButton>
          {build?.status === "failed" && (
            <p className="text-coral">
              The last build failed.{" "}
              <Link href="/activity" className="underline">
                See Activity
              </Link>
            </p>
          )}
        </Step>

        {left === 0 && (
          <p className="text-sm">
            All set. Go to{" "}
            <Link href="/" className="text-teal underline">
              Today
            </Link>{" "}
            and press Find new jobs.
          </p>
        )}
      </div>
    </div>
  );
}
