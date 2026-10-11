"use client";

import { useActionState, useState } from "react";
import { saveSettings } from "@/app/actions";
import { AppearanceSection } from "@/components/appearance-section";
import type { Settings } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="card-title">{title}</h2>
      {hint && <p className="mt-1 text-sm text-slate">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function NumberField({ name, label, value, unit }: { name: string; label: string; value: number; unit?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={name} name={name} type="number" defaultValue={value} className="field w-24 font-mono" />
        {unit && <span className="text-sm text-slate">{unit}</span>}
      </div>
    </div>
  );
}

// Rows that can be added and removed. New rows get a key that only lives in
// this form; the server matches rows by their position.
function useRows<T>(initial: T[]) {
  const [rows, setRows] = useState(() => initial.map((value, index) => ({ id: `saved-${index}`, value })));
  const add = (value: T) => setRows((current) => [...current, { id: crypto.randomUUID(), value }]);
  const remove = (id: string) => setRows((current) => current.filter((row) => row.id !== id));
  return { rows, add, remove };
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-quiet mb-0.5 px-3 py-2 text-xs" aria-label={label}>
      Remove
    </button>
  );
}

function CountryList({ initial }: { initial: Settings["countries"] }) {
  const { rows, add, remove } = useRows(initial);
  return (
    <>
      <input type="hidden" name="countryCount" value={rows.length} />
      {rows.length === 0 && <p className="text-sm text-coral">No countries yet. Add at least one.</p>}
      {rows.map(({ id, value }, index) => (
        <div key={id} className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <label className="label" htmlFor={`country-${id}`}>
              Country
            </label>
            <input id={`country-${id}`} name={`country.${index}.name`} defaultValue={value.name} placeholder="e.g. Germany" className="field" />
          </div>
          <NumberField name={`country.${index}.priority`} label="Priority" value={value.priority} />
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor={`cities-${id}`}>
              Cities, first is preferred
            </label>
            <input id={`cities-${id}`} name={`country.${index}.cities`} defaultValue={value.cities.join(", ")} className="field" />
          </div>
          <RemoveButton onClick={() => remove(id)} label={`Remove ${value.name || "this country"}`} />
        </div>
      ))}
      <button type="button" onClick={() => add({ name: "", priority: rows.length + 1, cities: [] })} className="btn btn-quiet text-xs">
        Add country
      </button>
    </>
  );
}

function RoleList({ initial }: { initial: Settings["roles"] }) {
  const { rows, add, remove } = useRows(initial);
  return (
    <>
      <input type="hidden" name="roleCount" value={rows.length} />
      {rows.length === 0 && <p className="text-sm text-coral">No roles yet. Add at least one.</p>}
      {rows.map(({ id, value }, index) => (
        <div key={id} className="flex flex-wrap items-start gap-4">
          <input type="hidden" name={`role.${index}.key`} value={value.key} />
          <div className="w-44">
            <label className="label" htmlFor={`role-${id}`}>
              Role
            </label>
            <input id={`role-${id}`} name={`role.${index}.label`} defaultValue={value.label} placeholder="e.g. Data analysis" className="field" />
          </div>
          <NumberField name={`role.${index}.priority`} label="Priority" value={value.priority} />
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor={`keywords-${id}`}>
              Keywords
            </label>
            <textarea
              id={`keywords-${id}`}
              name={`role.${index}.keywords`}
              defaultValue={value.keywords.join(", ")}
              placeholder="e.g. data analyst, BI analyst"
              rows={2}
              className="field"
              dir="auto"
            />
          </div>
          <div className="pt-6">
            <RemoveButton onClick={() => remove(id)} label={`Remove ${value.label || "this role"}`} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => add({ key: "", label: "", priority: rows.length + 1, keywords: [] })} className="btn btn-quiet text-xs">
        Add role
      </button>
    </>
  );
}

function Toggle({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4 accent-teal" />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate">{hint}</span>}
      </span>
    </label>
  );
}

const ENGINE_STAGES = [
  { key: "build-profile", label: "Build profile" },
  { key: "rank-jobs", label: "Check and rank" },
  { key: "research-job", label: "Research" },
  { key: "tailor-job", label: "Tailor documents" },
];

const EFFORTS = [
  { value: "", label: "Engine default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max (Claude Code only)" },
];

const WORK_MODES = [
  { key: "remote", label: "Remote" },
  { key: "onsite", label: "On-site" },
  { key: "hybrid", label: "Hybrid" },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [result, action, pending] = useActionState(saveSettings, null);

  return (
    <form action={action} className="space-y-6">
      <Section title="Appearance" hint="Light or dark mode, and the two colours the app is built around.">
        <AppearanceSection appearance={settings.appearance} />
      </Section>

      <Section title="Daily selection">
        <div className="flex flex-wrap gap-6">
          <NumberField name="dailyCap" label="Daily cap" value={settings.dailyCap} unit="jobs for full research" />
          <NumberField name="followUpDays" label="Follow up after" value={settings.followUpDays} unit="days without reply" />
        </div>
      </Section>

      <Section title="Freshness" hint="Older postings are skipped. The newest ones are handled first.">
        <div className="flex flex-wrap gap-6">
          <NumberField name="maxHours" label="Maximum age" value={settings.freshness.maxHours} unit="hours" />
          <NumberField name="fastTrackMinutes" label="High priority under" value={settings.freshness.fastTrackMinutes} unit="minutes" />
        </div>
      </Section>

      <Section title="Countries" hint="Where to search. Priority 1 is searched and ranked first.">
        <CountryList initial={settings.countries} />
      </Section>

      <Section title="Roles" hint="The kinds of job to look for. Keywords are searched as written, separated by commas, in any language.">
        <RoleList initial={settings.roles} />
      </Section>

      <Section title="Experience and work mode">
        <NumberField name="maxYears" label="Most experience a listing may require" value={settings.experience.maxYears} unit="years" />
        <div>
          <label className="label" htmlFor="titles">
            Entry-level title words
          </label>
          <input id="titles" name="titles" defaultValue={settings.experience.titles.join(", ")} className="field" dir="auto" />
        </div>
        <div className="flex flex-wrap gap-6">
          {WORK_MODES.map((mode) => (
            <Toggle key={mode.key} name={`workMode.${mode.key}`} label={mode.label} checked={settings.workModes.includes(mode.key)} />
          ))}
        </div>
      </Section>

      <Section title="Skip these listings">
        <Toggle name="exclude.nationalsOnly" label="Open to nationals only" checked={settings.exclusions.nationalsOnly} />
        <Toggle
          name="exclude.transferableIqamaRequired"
          label="Need a residence or work permit I do not have"
          hint="For example a transferable iqama in Saudi Arabia"
          checked={settings.exclusions.transferableIqamaRequired}
        />
        <Toggle name="exclude.payToApply" label="Ask for a fee to apply" checked={settings.exclusions.payToApply} />
      </Section>

      <Section title="Sources">
        {settings.sources.map((source) => (
          <Toggle key={source.key} name={`source.${source.key}`} label={source.name} hint={source.method} checked={source.enabled} />
        ))}
      </Section>

      <Section
        title="Engines"
        hint="Which AI runs each step. Claude Code uses your Claude subscription; Codex uses your ChatGPT plan. Leave the model blank for the engine's default."
      >
        {ENGINE_STAGES.map((stage) => {
          const choice = settings.engines?.[stage.key] ?? { engine: "claude", model: "", effort: "" };
          return (
            <div key={stage.key} className="flex flex-wrap items-end gap-4">
              <div className="w-36 pb-2 font-medium">{stage.label}</div>
              <div>
                <label className="label" htmlFor={`engine-${stage.key}`}>
                  Engine
                </label>
                <select id={`engine-${stage.key}`} name={`engine.${stage.key}.engine`} defaultValue={choice.engine} className="field w-40">
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex</option>
                </select>
              </div>
              <div className="min-w-40 flex-1">
                <label className="label" htmlFor={`model-${stage.key}`}>
                  Model
                </label>
                <input
                  id={`model-${stage.key}`}
                  name={`engine.${stage.key}.model`}
                  defaultValue={choice.model}
                  placeholder="Default"
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label" htmlFor={`effort-${stage.key}`}>
                  Effort
                </label>
                <select id={`effort-${stage.key}`} name={`engine.${stage.key}.effort`} defaultValue={choice.effort} className="field w-48">
                  {EFFORTS.map((effort) => (
                    <option key={effort.value} value={effort.value}>
                      {effort.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Schedule" hint="When off, steps only run when you start them. The schedule itself arrives in phase 5.">
        <Toggle name="schedule.enabled" label="Run on a schedule" checked={settings.schedule.enabled} />
        <div className="flex flex-wrap gap-6">
          <NumberField name="schedule.every" label="Check for new postings every" value={settings.schedule.fastTrackEveryMinutes} unit="minutes" />
          <div>
            <label className="label" htmlFor="dailyRunAt">
              Build the daily list at
            </label>
            <input id="dailyRunAt" name="schedule.dailyRunAt" type="time" defaultValue={settings.schedule.dailyRunAt} className="field w-32 font-mono" />
          </div>
        </div>
      </Section>

      <Section title="Email" hint="Emails are always written and saved with the job. This switch controls whether drafts are created in the mailbox.">
        <Toggle name="email.sendingEnabled" label="Create email drafts" checked={settings.email.sendingEnabled} />
      </Section>

      <div className="sticky bottom-0 flex items-center gap-4 border-t border-line bg-mist py-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          Save settings
        </button>
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-teal" : "text-coral"}`}>
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
