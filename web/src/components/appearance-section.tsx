"use client";

import { useState } from "react";
import { DEFAULT_APPEARANCE, PRESETS, contrast, isHex, type Mode } from "@/lib/theme";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follows your device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

const textOn = (background: string) => (contrast("#ffffff", background) >= contrast("#0b1220", background) ? "#ffffff" : "#0b1220");

function ColorField({ name, label, hint, value, onChange }: { name: string; label: string; hint: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="min-w-56 flex-1">
      <label className="label" htmlFor={`${name}-text`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setText(event.target.value);
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-field bg-surface p-1"
        />
        <input
          id={`${name}-text`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (isHex(event.target.value)) onChange(event.target.value.toLowerCase());
          }}
          spellCheck={false}
          className="field font-mono uppercase"
        />
        <input type="hidden" name={name} value={value} />
      </div>
      <p className="mt-1 text-xs text-slate">{hint}</p>
    </div>
  );
}

// Choose light or dark mode and the two brand colours. The preview uses the
// same readable-text rule as the app.
export function AppearanceSection({ appearance }: { appearance: { mode: Mode; primary: string; secondary: string } }) {
  const [mode, setMode] = useState<Mode>(appearance.mode ?? DEFAULT_APPEARANCE.mode);
  const [primary, setPrimary] = useState(appearance.primary ?? DEFAULT_APPEARANCE.primary);
  const [secondary, setSecondary] = useState(appearance.secondary ?? DEFAULT_APPEARANCE.secondary);
  // Resetting the text fields when a preset is picked: remount them.
  const [version, setVersion] = useState(0);

  const pick = (nextPrimary: string, nextSecondary: string) => {
    setPrimary(nextPrimary);
    setSecondary(nextSecondary);
    setVersion((value) => value + 1);
  };
  const lowContrast = contrast(primary, secondary) < 3;

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">Mode</legend>
        <div className="inline-flex rounded-md border border-field bg-surface p-1">
          {MODES.map((option) => (
            <label
              key={option.value}
              title={option.hint}
              className={`cursor-pointer rounded px-4 py-1.5 text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-teal ${
                mode === option.value ? "bg-primary text-on-primary" : "hover:bg-mist"
              }`}
            >
              <input
                type="radio"
                name="appearance.mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <span className="label">Palettes</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const active = preset.primary === primary && preset.secondary === secondary;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => pick(preset.primary, preset.secondary)}
                aria-pressed={active}
                className={`chip ${active ? "chip-on" : ""}`}
              >
                <span className="flex overflow-hidden rounded-full border border-field" aria-hidden>
                  <span className="size-3.5" style={{ background: preset.primary }} />
                  <span className="size-3.5" style={{ background: preset.secondary }} />
                </span>
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      <div key={version} className="flex flex-wrap gap-6">
        <ColorField
          name="appearance.primary"
          label="Primary"
          hint="Buttons, the logo panel, active tabs, your messages. The board takes its tint."
          value={primary}
          onChange={setPrimary}
        />
        <ColorField
          name="appearance.secondary"
          label="Secondary"
          hint="The top bar, highlights, top scores, and the next step."
          value={secondary}
          onChange={setSecondary}
        />
      </div>

      <div>
        <span className="label">Preview</span>
        <div className="overflow-hidden rounded-lg border border-field">
          <div className="flex items-stretch" style={{ background: secondary, color: textOn(secondary) }}>
            <span className="flex items-center gap-2 px-3 py-2 font-display font-semibold uppercase" style={{ background: primary, color: textOn(primary) }}>
              <span className="grid size-5 place-items-center rounded-sm text-xs font-bold" style={{ background: secondary, color: textOn(secondary) }}>
                J
              </span>
              Jobflow
            </span>
            <span className="flex items-center px-3 font-display text-sm font-semibold uppercase">Today</span>
            <span className="flex items-center px-3 font-display text-sm font-semibold uppercase">Questions</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ background: "#0d1526" }}>
            <span className="font-display font-semibold tracking-widest uppercase" style={{ color: contrast(secondary, "#0d1526") >= 4.5 ? secondary : "#e9eef7" }}>
              Departures
            </span>
            <span className="rounded-md px-3 py-1 text-xs font-medium" style={{ background: primary, color: textOn(primary) }}>
              Primary button
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate">
          Text colours adjust automatically so everything stays readable. The board is always dark, tinted with the primary colour.
          {lowContrast && " These two colours are close to each other, so tabs and badges will look similar to the bar."}
        </p>
        <button type="button" onClick={() => pick(DEFAULT_APPEARANCE.primary, DEFAULT_APPEARANCE.secondary)} className="mt-2 text-xs text-teal underline">
          Reset to the default colours
        </button>
      </div>
    </div>
  );
}
