"use client";

import { CheckMailButton } from "@/components/gmail";
import { ExtensionSetup } from "@/components/extension-setup";
import { OtherDevices } from "@/components/other-devices";
import { ThisComputer } from "@/components/this-computer";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { saveSettings } from "@/app/actions";
import { AppearanceSection } from "@/components/appearance-section";
import { CityPicker } from "@/components/city-picker";
import { TagInput } from "@/components/tag-input";
import { useReorder } from "@/components/use-reorder";
import { EXPERIENCE_LEVELS } from "@/core/levels.mjs";
import { RESEARCH_POINTS, type Settings } from "@/lib/types";

export type CountryOption = { code: string; name: string };

// ---------- building blocks ----------

// Ids of the sections whose fields differ from the saved settings.
const ChangedSections = createContext<Set<string>>(new Set());

function UnsavedMark() {
  return (
    <span className="ml-1 text-coral" title="Changed, not saved yet">
      *<span className="sr-only"> (not saved)</span>
    </span>
  );
}

function Section({ id, title, hint, children, flush = false }: { id: string; title: string; hint?: string; children: React.ReactNode; flush?: boolean }) {
  const changed = useContext(ChangedSections).has(id);
  return (
    <section id={id} className={`card scroll-mt-32 overflow-hidden rounded-xl shadow-sm transition-colors ${changed ? "border-coral/60" : ""}`}>
      <header className="border-b border-line/70 px-5 pt-4 pb-3.5 md:px-6">
        <h2 className="card-title">
          {title}
          {changed && <UnsavedMark />}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-slate">{hint}</p>}
      </header>
      {/* "flush" bodies are lists of rows that bring their own spacing. */}
      <div className={flush ? "" : "space-y-5 px-5 py-5 md:px-6"}>{children}</div>
    </section>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate">{children}</p>;
}

// A number with its unit attached on the right.
function NumberField({
  name,
  label,
  value,
  unit,
  help,
  min,
  max,
  placeholder,
}: {
  name: string;
  label: string;
  value: number | null;
  unit: string;
  help?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="flex w-fit items-stretch rounded-md border border-field bg-surface focus-within:border-teal focus-within:ring-3 focus-within:ring-teal/20">
        <input
          id={name}
          name={name}
          type="number"
          min={min}
          max={max}
          defaultValue={value ?? ""}
          placeholder={placeholder}
          className="w-24 rounded-l-md bg-transparent px-3 py-2 font-mono text-sm text-ink outline-none"
        />
        <span className="flex items-center rounded-r-md border-l border-line bg-mist px-3 text-sm text-slate">{unit}</span>
      </div>
      {help && <Help>{help}</Help>}
    </div>
  );
}

// One on/off option: name and explanation on the left, the switch on the right.
function SwitchRow({
  name,
  label,
  checked,
  hint,
  disabled = false,
  badge,
}: {
  name: string;
  label: string;
  checked: boolean;
  hint?: string;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <label className={`flex items-center justify-between gap-6 px-5 py-3.5 md:px-6 ${disabled ? "" : "cursor-pointer hover:bg-mist/50"}`}>
      <span className={`min-w-0 ${disabled ? "opacity-60" : ""}`}>
        <span className="text-sm font-medium">{label}</span>
        {badge && <span className="ml-2 rounded-full bg-mist px-2 py-0.5 font-mono text-[11px] tracking-wide text-slate uppercase">{badge}</span>}
        {hint && <span className="mt-0.5 block text-xs text-slate">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" name={name} defaultChecked={checked && !disabled} disabled={disabled} className="switch" />
    </label>
  );
}

// A checkbox drawn as a pill that can be switched on and off.
function Pill({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-field px-3.5 py-1.5 text-sm transition-colors select-none hover:border-ink has-[:checked]:border-teal has-[:checked]:bg-teal-soft has-[:checked]:text-teal has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-teal/30">
      <input type="checkbox" name={name} defaultChecked={checked} className="peer sr-only" />
      <span aria-hidden className="hidden peer-checked:inline">
        ✓
      </span>
      {label}
    </label>
  );
}

function SwitchList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line/70">{children}</div>;
}

// ---------- countries and roles ----------

// Rows that can be added, removed, and dragged into order; the order is the
// priority. New rows get a key that only lives in this form; the server
// reads rows by their position.
function useRows<T>(initial: T[]) {
  const [rows, setRows] = useState(() => initial.map((value, index) => ({ id: `saved-${index}`, value })));
  const add = (value: T) => setRows((current) => [...current, { id: crypto.randomUUID(), value }]);
  const remove = (id: string) => setRows((current) => current.filter((row) => row.id !== id));
  const update = (id: string, value: T) => setRows((current) => current.map((row) => (row.id === id ? { id, value } : row)));
  const { itemProps, handleProps, moveTo } = useReorder(rows, setRows, (row) => row.id);
  return { rows, add, remove, update, itemProps, handleProps, moveTo };
}

// Up and down buttons on touch screens, where rows cannot be dragged.
function MoveButtons({ index, count, onMove, label }: { index: number; count: number; onMove: (to: number) => void; label: string }) {
  const button = "grid size-9 place-items-center rounded-md text-slate hover:bg-mist hover:text-ink disabled:opacity-30";
  return (
    <div className="mt-5 hidden flex-col pointer-coarse:flex">
      <button type="button" className={button} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${label} up`}>
        ▲
      </button>
      <button type="button" className={button} disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${label} down`}>
        ▼
      </button>
    </div>
  );
}

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-mist px-4 py-6 text-center text-sm text-slate">{children}</p>;
}

function DragHandle(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="mt-6 cursor-grab touch-none rounded px-1 py-2 text-lg leading-none text-slate/70 hover:bg-mist hover:text-ink active:cursor-grabbing pointer-coarse:hidden"
    >
      <span aria-hidden>⠿</span>
    </button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 grid size-9 shrink-0 place-items-center rounded-md text-xl leading-none text-slate hover:bg-coral-soft hover:text-coral"
      aria-label={label}
      title="Remove"
    >
      ×
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-field py-2.5 text-sm font-medium text-slate transition-colors hover:border-teal hover:bg-teal-soft hover:text-teal"
    >
      <span aria-hidden className="text-lg leading-none">
        +
      </span>
      {children}
    </button>
  );
}

function FirstChoice() {
  return <span className="ml-1.5 rounded-full bg-go-soft px-2 py-px text-[11px] font-semibold text-go normal-case">First choice</span>;
}

const ROW =
  "flex items-start gap-2 rounded-lg border border-line/80 bg-surface p-3 pl-1.5 transition-shadow hover:shadow-sm data-[dragging]:border-dashed data-[dragging]:bg-mist data-[dragging]:opacity-60";

type CountryRow = Settings["countries"][number];

function CountryList({ initial, options }: { initial: CountryRow[]; options: CountryOption[] }) {
  const { rows, add, remove, update, itemProps, handleProps, moveTo } = useRows(initial);
  const used = new Set(rows.map((row) => row.value.code));
  // A country saved under a short name (like "UAE") keeps that name unless
  // another country is picked in its row.
  const savedNames = new Map(initial.map((country) => [country.code, country.name]));

  return (
    <>
      <input type="hidden" name="countryCount" value={rows.length} />
      {rows.length === 0 && <EmptyList>No countries yet. Add the first country you want to work in; you can add more and put them in order.</EmptyList>}
      <ol className="space-y-2.5">
        {rows.map(({ id, value }, index) => (
          <li key={id} {...itemProps(id)} className={ROW}>
            <DragHandle {...handleProps(id, value.name || "this country")} />
            <MoveButtons index={index} count={rows.length} onMove={(to) => moveTo(id, to)} label={value.name || "this country"} />
            <input type="hidden" name={`country.${index}.code`} value={value.code ?? ""} />
            <input type="hidden" name={`country.${index}.name`} value={value.name} />
            <input type="hidden" name={`country.${index}.cities`} value={JSON.stringify(value.cities)} />
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div>
                <label className="label" htmlFor={`country-${id}`}>
                  Country
                  {index === 0 && <FirstChoice />}
                </label>
                <select
                  id={`country-${id}`}
                  value={value.code ?? ""}
                  onChange={(event) => {
                    const code = event.target.value;
                    const name = savedNames.get(code) ?? options.find((option) => option.code === code)?.name ?? "";
                    update(id, { ...value, code, name, cities: [] });
                  }}
                  className="field"
                >
                  <option value="">Choose a country</option>
                  {options.map((option) => (
                    <option key={option.code} value={option.code} disabled={used.has(option.code) && option.code !== value.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <span>
                    Needs visa sponsorship
                    <span className="block text-xs text-slate">Off if you can already work here</span>
                  </span>
                  <input type="checkbox" role="switch" name={`country.${index}.sponsorship`} defaultChecked={value.sponsorship !== false} className="switch" />
                </label>
              </div>
              <div className="min-w-0">
                <span className="label">Cities, first is preferred</span>
                <CityPicker code={value.code ?? ""} cities={value.cities} onChange={(cities) => update(id, { ...value, cities })} />
              </div>
            </div>
            <RemoveButton onClick={() => remove(id)} label={`Remove ${value.name || "this country"}`} />
          </li>
        ))}
      </ol>
      <AddButton onClick={() => add({ code: "", name: "", priority: rows.length + 1, cities: [] })}>Add country</AddButton>
    </>
  );
}

function RoleList({ initial }: { initial: Settings["roles"] }) {
  const { rows, add, remove, itemProps, handleProps, moveTo } = useRows(initial);
  return (
    <>
      <input type="hidden" name="roleCount" value={rows.length} />
      {rows.length === 0 && <EmptyList>No roles yet. Add the kind of job you want, with a few words to search for.</EmptyList>}
      <ol className="space-y-2.5">
        {rows.map(({ id, value }, index) => (
          <li key={id} {...itemProps(id)} className={ROW}>
            <DragHandle {...handleProps(id, value.label || "this role")} />
            <MoveButtons index={index} count={rows.length} onMove={(to) => moveTo(id, to)} label={value.label || "this role"} />
            <input type="hidden" name={`role.${index}.key`} value={value.key} />
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div>
                <label className="label" htmlFor={`role-${id}`}>
                  Role
                  {index === 0 && <FirstChoice />}
                </label>
                <input id={`role-${id}`} name={`role.${index}.label`} defaultValue={value.label} placeholder="e.g. Data analysis" className="field" />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor={`keywords-${id}`}>
                  Search keywords
                </label>
                <TagInput id={`keywords-${id}`} name={`role.${index}.keywords`} initial={value.keywords} placeholder="e.g. data analyst, then Enter" />
              </div>
            </div>
            <RemoveButton onClick={() => remove(id)} label={`Remove ${value.label || "this role"}`} />
          </li>
        ))}
      </ol>
      <AddButton onClick={() => add({ key: "", label: "", priority: rows.length + 1, keywords: [] })}>Add role</AddButton>
    </>
  );
}

// ---------- page structure ----------

const ENGINE_STAGES = [
  { key: "build-profile", label: "Build profile" },
  { key: "rank-jobs", label: "Check and rank" },
  { key: "research-job", label: "Research" },
  { key: "tailor-job", label: "Tailor documents" },
  { key: "design-template", label: "Design CV template" },
  { key: "follow-up", label: "Write follow-up" },
  { key: "improve-cv", label: "Improve CV for ATS" },
  { key: "weave-keyword", label: "Work keyword into CV" },
  { key: "import-jobs", label: "Import jobs from the browser" },
  { key: "interview-pack", label: "Interview pack" },
  { key: "interview-debrief", label: "Interview debrief" },
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

// Groups of sections, in the order of the side menu and the page.
const GROUPS = [
  {
    gate: "A",
    title: "Search",
    sections: [
      { id: "countries", label: "Countries" },
      { id: "roles", label: "Roles" },
      { id: "experience", label: "Experience and work mode" },
      { id: "skip", label: "Skip these listings" },
    ],
  },
  {
    gate: "B",
    title: "Daily run",
    sections: [
      { id: "freshness", label: "Freshness" },
      { id: "daily", label: "Daily selection" },
      { id: "sources", label: "Sources" },
      { id: "schedule", label: "Schedule" },
    ],
  },
  {
    gate: "C",
    title: "Research and output",
    sections: [
      { id: "research", label: "Research" },
      { id: "engines", label: "Engines" },
      { id: "email", label: "Email" },
    ],
  },
  {
    gate: "D",
    title: "Look and access",
    sections: [
      { id: "appearance", label: "Appearance" },
      { id: "devices", label: "Other devices" },
      { id: "computer", label: "This computer" },
    ],
  },
];

// The section list beside the form, highlighting the section in view.
function SideMenu() {
  const [active, setActive] = useState(GROUPS[0].sections[0].id);
  const changed = useContext(ChangedSections);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Counts a section as current while it is near the top of the screen,
      // below the sticky header.
      { rootMargin: "-130px 0px -55% 0px" },
    );
    for (const group of GROUPS) {
      for (const section of group.sections) {
        const element = document.getElementById(section.id);
        if (element) observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="sticky top-32 hidden space-y-5 lg:block">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 flex items-center gap-2 font-display text-sm font-semibold tracking-wider text-ink uppercase">
            <GateLetter>{group.gate}</GateLetter>
            {group.title}
          </p>
          <ul className="space-y-0.5 border-l border-line">
            {group.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                  className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-sm text-slate hover:text-ink aria-[current]:border-primary aria-[current]:font-semibold aria-[current]:text-ink"
                >
                  {section.label}
                  {changed.has(section.id) && <UnsavedMark />}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// A gate letter on a yellow sign, as on airport wayfinding.
function GateLetter({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="grid size-6 place-items-center rounded-sm bg-saffron font-display text-sm font-bold text-on-saffron">
      {children}
    </span>
  );
}

// The heading over each group of sections, styled as a direction sign.
function GroupHeading({ gate }: { gate: string }) {
  const group = GROUPS.find((item) => item.gate === gate)!;
  return (
    <h2 className="flex items-center gap-3 pt-6 first:pt-0">
      <span className="flex items-center gap-2.5 rounded-md bg-primary py-1 pr-4 pl-1 font-display text-lg font-semibold tracking-wider text-on-primary uppercase">
        <GateLetter>{gate}</GateLetter>
        {group.title}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </h2>
  );
}

// Only LinkedIn is collected automatically; the others wait for job alert
// emails, so they cannot be switched on yet.
const BUILT_SOURCES = new Set(["linkedin", "workable", "indeed", "bayt", "gulftalent", "naukrigulf", "kariyer", "eleman", "techcareer"]);

const SECTION_IDS = GROUPS.flatMap((group) => group.sections.map((section) => section.id));

// Every named field in a section as text, to compare with the saved state.
function sectionValues(form: HTMLFormElement, id: string) {
  const fields = form.querySelectorAll<HTMLInputElement>(`#${id} input[name], #${id} select[name], #${id} textarea[name]`);
  return [...fields].map((field) => `${field.name}=${field.type === "checkbox" ? field.checked : field.value}`).join("\n");
}

export function SettingsForm({
  settings,
  countryOptions,
  extension,
  devices,
  computer,
}: {
  settings: Settings;
  countryOptions: CountryOption[];
  extension: { token: string; folder: string };
  devices: { links: string[]; path: string; lan: { enabled: boolean; open: boolean; links: { link: string; qr: string }[] } };
  computer: React.ComponentProps<typeof ThisComputer>["status"];
}) {
  const [result, action, pending] = useActionState(saveSettings, null);
  const form = useRef<HTMLFormElement>(null);
  const saved = useRef(new Map<string, string>());
  const [changed, setChanged] = useState<Set<string>>(() => new Set());

  // Marks the sections that differ from the saved settings. Runs after React
  // has drawn the change, since chips and rows update hidden fields.
  const check = () =>
    setTimeout(() => {
      if (!form.current) return;
      const next = SECTION_IDS.filter((id) => sectionValues(form.current!, id) !== saved.current.get(id));
      setChanged((current) => (next.length === current.size && next.every((id) => current.has(id)) ? current : new Set(next)));
    }, 0);

  useEffect(() => {
    if (changed.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // Links inside the app do not reload the page, so they are asked about
    // too (before the link acts, hence the capture phase).
    const ask = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a[href]");
      if (!link || link.getAttribute("href")?.startsWith("#") || link.getAttribute("target") === "_blank") return;
      if (!window.confirm("You have unsaved settings. Leave without saving them?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", ask, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", ask, true);
    };
  }, [changed]);

  // Whenever saved settings arrive (on load and after each save), they become
  // what changes are compared with.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!form.current) return;
      saved.current = new Map(SECTION_IDS.map((id) => [id, sectionValues(form.current!, id)]));
      setChanged(new Set());
    }, 0);
    return () => clearTimeout(timer);
  }, [settings]);

  return (
    <ChangedSections.Provider value={changed}>
    <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <div>
        <SideMenu />
      </div>
      <form
        ref={form}
        // Submitted by hand rather than through the form's action, because an
        // action resets the form afterwards, which blanks the country pickers.
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => action(data));
        }}
        // Any of these can change a field; check then compares the values.
        onInput={check}
        onChange={check}
        onDragEnd={check}
        onClick={check}
        onKeyUp={check}
        onBlur={check}
        className="settings min-w-0 space-y-5"
      >
        <GroupHeading gate="A" />

        <Section id="countries" title="Countries" hint="Where to search. Drag ⠿ to reorder: the top country is searched and ranked first.">
          {/* Keyed on the saved list so the rows redraw from it after a save. */}
          <CountryList key={JSON.stringify(settings.countries)} initial={settings.countries} options={countryOptions} />
        </Section>

        <Section id="roles" title="Roles" hint="The kinds of job to look for, best first. Keywords are searched on LinkedIn as written, in any language.">
          <RoleList key={JSON.stringify(settings.roles)} initial={settings.roles} />
        </Section>

        <Section id="experience" title="Experience and work mode" hint="The level of job you are after, from internships to executive roles.">
          <fieldset>
            <legend className="label">Experience levels to search</legend>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map((level) => (
                <Pill key={level.key} name={`level.${level.key}`} label={level.label} checked={settings.experience.levels.includes(level.key)} />
              ))}
            </div>
            <Help>As LinkedIn labels them. Listings at other levels are left out.</Help>
          </fieldset>
          <NumberField
            name="maxYears"
            label="Most experience a listing may ask for"
            value={settings.experience.maxYears}
            unit="years"
            min={0}
            max={50}
            placeholder="No limit"
            help="Listings asking for more are skipped when ranking. Leave empty for no limit."
          />
          <div>
            <label className="label" htmlFor="skipTitles">
              Skip titles containing
            </label>
            <TagInput id="skipTitles" name="skipTitles" initial={settings.experience.skipTitles} placeholder="e.g. senior, or intern, then Enter" />
            <Help>Whole words. Jobs whose title has one are not collected.</Help>
          </div>
          <fieldset>
            <legend className="label">Work modes you accept</legend>
            <div className="flex flex-wrap gap-2">
              {WORK_MODES.map((mode) => (
                <Pill key={mode.key} name={`workMode.${mode.key}`} label={mode.label} checked={settings.workModes.includes(mode.key)} />
              ))}
            </div>
          </fieldset>
        </Section>

        <Section id="skip" title="Skip these listings" hint="Jobs like these are excluded when ranking." flush>
          <SwitchList>
            <SwitchRow name="exclude.nationalsOnly" label="Open to nationals only" hint="For example Emiratisation or Saudization roles" checked={settings.exclusions.nationalsOnly} />
            <SwitchRow
              name="exclude.transferableIqamaRequired"
              label="Need a residence or work permit I do not have"
              hint="For example a transferable iqama in Saudi Arabia"
              checked={settings.exclusions.transferableIqamaRequired}
            />
            <SwitchRow name="exclude.payToApply" label="Ask for a fee to apply" hint="A common sign of a scam" checked={settings.exclusions.payToApply} />
          </SwitchList>
        </Section>

        <GroupHeading gate="B" />

        <Section id="freshness" title="Freshness" hint="Applying early is the point: older postings are skipped, the newest are handled first.">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <NumberField name="maxHours" label="Maximum age" value={settings.freshness.maxHours} unit="hours" min={1} max={168} />
            <NumberField
              name="fastTrackMinutes"
              label="High priority under"
              value={settings.freshness.fastTrackMinutes}
              unit="minutes"
              min={5}
              max={720}
              help="Shown as Boarding on Today."
            />
            <NumberField
              name="archiveAfterDays"
              label="Archive unpicked jobs after"
              value={settings.freshness.archiveAfterDays ?? 7}
              unit="days"
              min={0}
              max={365}
              help="Jobs you never selected, once the posting is this old, go to Jobs → Archived. 0 keeps them."
            />
          </div>
        </Section>

        <Section id="daily" title="Daily selection" hint="How many jobs get full research, and when to follow up.">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <NumberField name="dailyCap" label="Selected at once" value={settings.dailyCap} unit="jobs" min={1} max={50} help="How many jobs can wait for research at the same time." />
            <NumberField name="followUpDays" label="Follow up after" value={settings.followUpDays} unit="days" min={1} max={30} help="Without a reply." />
          </div>
        </Section>

        <Section id="sources" title="Sources" hint="Where new jobs are collected from." flush>
          <SwitchList>
            {settings.sources.map((source) => {
              const built = BUILT_SOURCES.has(source.key);
              return (
                <SwitchRow
                  key={source.key}
                  name={`source.${source.key}`}
                  label={source.name}
                  hint={source.method}
                  checked={source.enabled}
                  disabled={!built}
                  badge={built ? undefined : "Coming later"}
                />
              );
            })}
          </SwitchList>
          <ExtensionSetup {...extension} />
        </Section>

        <Section
          id="schedule"
          title="Schedule"
          hint="While Offerbound is open on this computer: a quick check for fresh postings every few minutes (the fast track), and one full run a day. New fast-track jobs are ranked straight away."
        >
          <div className="-mx-5 -mt-5 border-b border-line/70 md:-mx-6">
            <SwitchRow
              name="schedule.enabled"
              label="Run on a schedule"
              hint="Off until you turn it on. Fast track: LinkedIn and Workable. Daily run: every source, then ranking, then a check of which listings are still open (Indeed's through the extension, every 6 hours). Uses your engine's usage only to rank."
              checked={settings.schedule.enabled}
            />
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <NumberField name="schedule.every" label="Check for new postings every" value={settings.schedule.fastTrackEveryMinutes} unit="minutes" min={15} max={720} />
            <div>
              <span className="label">Between</span>
              <span className="flex items-center gap-2">
                <input aria-label="Checks start at" name="schedule.activeFrom" type="time" defaultValue={settings.schedule.activeFrom ?? "07:00"} className="field w-32 font-mono" />
                <span className="text-sm text-slate">and</span>
                <input aria-label="Checks stop at" name="schedule.activeTo" type="time" defaultValue={settings.schedule.activeTo ?? "23:00"} className="field w-32 font-mono" />
              </span>
            </div>
            <div>
              <label className="label" htmlFor="dailyRunAt">
                Build the daily list at
              </label>
              <input id="dailyRunAt" name="schedule.dailyRunAt" type="time" defaultValue={settings.schedule.dailyRunAt} className="field w-36 font-mono" />
            </div>
          </div>
        </Section>

        <GroupHeading gate="C" />

        <Section id="research" title="Research" hint="What the research step looks into for each job you select, before the documents are written.">
          <fieldset>
            <legend className="label">What to research</legend>
            <div className="-mx-5 divide-y divide-line/70 border-y border-line/70 md:-mx-6">
              {RESEARCH_POINTS.map((point) => (
                <SwitchRow key={point.key} name={`research.${point.key}`} label={point.label} hint={point.hint} checked={settings.research?.points?.[point.key] ?? true} />
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="research-extra">
              Extra points to research
            </label>
            <TagInput id="research-extra" name="research.extraPoints" initial={settings.research?.extraPoints ?? []} placeholder="e.g. Glassdoor rating, then Enter" />
            <Help>Each becomes its own part of the research, for example remote work policy or Arabic-speaking team.</Help>
          </div>
          <div>
            <label className="label" htmlFor="research-rules">
              Research rules
            </label>
            <textarea
              id="research-rules"
              name="research.rules"
              defaultValue={settings.research?.rules ?? ""}
              rows={4}
              placeholder={"Plain sentences, for example:\n- For government jobs, check whether nationals are preferred.\n- For Senior titles, look for the team lead rather than HR."}
              className="field"
              dir="auto"
            />
            <Help>Followed on top of the built-in research; they win when the two disagree.</Help>
          </div>
        </Section>

        <Section
          id="engines"
          title="Engines"
          hint="Which AI runs each step. Claude Code uses your Claude subscription; Codex uses your ChatGPT plan. Leave the model blank for the engine's default."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 text-xs font-medium text-slate">Step</th>
                  <th className="pb-2 text-xs font-medium text-slate">Engine</th>
                  <th className="pb-2 text-xs font-medium text-slate">Model</th>
                  <th className="pb-2 text-xs font-medium text-slate">Effort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {ENGINE_STAGES.map((stage) => {
                  const choice = settings.engines?.[stage.key] ?? { engine: "claude", model: "", effort: "" };
                  return (
                    <tr key={stage.key}>
                      <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                        {stage.label}
                      </th>
                      <td className="py-2.5 pr-3">
                        <select aria-label={`Engine for ${stage.label}`} name={`engine.${stage.key}.engine`} defaultValue={choice.engine} className="field">
                          <option value="claude">Claude Code</option>
                          <option value="codex">Codex</option>
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          aria-label={`Model for ${stage.label}`}
                          name={`engine.${stage.key}.model`}
                          defaultValue={choice.model}
                          placeholder="Default"
                          className="field font-mono"
                        />
                      </td>
                      <td className="py-2.5">
                        <select aria-label={`Effort for ${stage.label}`} name={`engine.${stage.key}.effort`} defaultValue={choice.effort} className="field">
                          {EFFORTS.map((effort) => (
                            <option key={effort.value} value={effort.value}>
                              {effort.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="email" title="Email" hint="Replies from Gmail, and emails opened in Gmail for you to send. Uses the Gmail you are signed into in this browser: no password is stored." flush>
          <SwitchList>
            <SwitchRow
              name="email.watchReplies"
              label="Watch Gmail for replies"
              hint="The Offerbound extension reads your new, unread Gmail every 15 minutes while your browser is open. Only emails about your applications are kept; nothing is marked as read, moved, or changed."
              checked={settings.email.watchReplies}
            />
          </SwitchList>
          <div className="space-y-4 border-t border-line/70 px-5 py-4 md:px-6">
            <div>
              <label className="label" htmlFor="email-account">
                Gmail account
              </label>
              <select id="email-account" name="email.account" defaultValue={String(settings.email.account ?? 0)} className="field w-auto">
                {["First", "Second", "Third", "Fourth", "Fifth"].map((label, index) => (
                  <option key={label} value={index}>
                    {label} account signed in to this browser
                  </option>
                ))}
              </select>
              <Help>The order Gmail lists your accounts in (the account picker at its top right). Used to read replies and to open emails.</Help>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className={settings.mailCheck && !settings.mailCheck.ok ? "text-coral" : "text-slate"}>
                {settings.mailCheck ? (
                  <span suppressHydrationWarning>
                    Last checked {new Date(settings.mailCheck.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {settings.mailCheck.address ? ` (${settings.mailCheck.address})` : ""}: {settings.mailCheck.message}
                  </span>
                ) : (
                  "Not checked yet. Save with watching on, then check once."
                )}
              </span>
              <CheckMailButton />
            </div>
          </div>
        </Section>

        <GroupHeading gate="D" />

        <Section id="appearance" title="Appearance" hint="Light or dark mode, and the two colours the app is built around.">
          <AppearanceSection appearance={settings.appearance} />
        </Section>

        <Section id="devices" title="Other devices" hint="Open Offerbound on your phone: on your home Wi-Fi, or anywhere through Tailscale." flush>
          <SwitchList>
            <SwitchRow
              name="network.lan"
              label="Open on my home Wi-Fi"
              hint="A phone or laptop on the same Wi-Fi can open Offerbound after scanning the pairing code once. Only devices on that Wi-Fi get in, never the internet. The connection is not encrypted, so use it on your own home Wi-Fi only. Windows may ask once whether to allow Node.js: allow it on private networks only, so it stays closed on public Wi-Fi."
              checked={devices.lan.enabled}
            />
          </SwitchList>
          <div className="border-t border-line/70 px-5 py-4 md:px-6">
            <OtherDevices {...devices} />
          </div>
        </Section>

        <Section id="computer" title="This computer" hint="Offerbound as an app on this computer: running in the background, started at sign-in, with its own window." flush>
          <ThisComputer status={computer} />
        </Section>

        <div className="sticky bottom-4 z-10 flex items-center gap-4 rounded-xl border border-line bg-surface/95 px-5 py-3 shadow-lg backdrop-blur">
          <button type="submit" disabled={pending} className="btn btn-primary min-w-32">
            {pending ? "Saving…" : "Save settings"}
          </button>
          {result && !result.ok ? (
            <span role="status" className="text-sm text-coral">
              {result.message}
            </span>
          ) : changed.size > 0 ? (
            <span className="text-sm">
              <span className="text-coral">*</span> Unsaved<span className="hidden sm:inline"> changes in {changed.size} {changed.size === 1 ? "section" : "sections"}</span>
            </span>
          ) : (
            <span role="status" className="text-sm text-slate">
              {result?.ok ? "✓ Saved" : "No unsaved changes"}
            </span>
          )}
        </div>
      </form>
    </div>
    </ChangedSections.Provider>
  );
}
