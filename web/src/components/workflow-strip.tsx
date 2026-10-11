"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type WorkflowStep = {
  key: string;
  label: string;
  value: string;
  hint: string;
  // Where the step's jobs are shown: a screen, an optional "show" filter, and
  // the section to scroll to.
  path: string;
  show?: string;
  section: string;
  pending: boolean;
};

// The pipeline under the top bar. Each step opens the part of a screen that
// lists its jobs. The first step with work waiting is marked as next, and the
// step you are looking at is underlined.
export function WorkflowStrip({ steps }: { steps: WorkflowStep[] }) {
  const pathname = usePathname();
  const show = useSearchParams().get("show") ?? undefined;
  const next = steps.find((step) => step.pending)?.key;

  return (
    <div className="border-b border-chrome-line bg-chrome text-chrome-text">
      <ol className="flex items-stretch overflow-x-auto px-3 md:px-5" aria-label="Workflow">
        {steps.map((step, index) => {
          const isNext = step.key === next;
          const viewing = Boolean(step.show) && pathname === step.path && show === step.show;
          const href = `${step.path}${step.show ? `?show=${step.show}` : ""}#${step.section}`;
          return (
            <li key={step.key} className="flex shrink-0 items-center">
              {index > 0 && (
                <span className="px-1.5 text-chrome-dim" aria-hidden>
                  ▸
                </span>
              )}
              <Link
                href={href}
                title={step.hint}
                aria-current={viewing ? "page" : undefined}
                className={`my-1.5 flex items-baseline gap-2 rounded-sm border-b-2 px-2.5 py-1 transition-colors ${
                  isNext ? "bg-saffron text-on-saffron" : "hover:bg-white/10"
                } ${viewing ? "border-chrome-signal" : "border-transparent"}`}
              >
                <span className={`font-mono text-[11px] tracking-[0.16em] uppercase ${isNext ? "text-on-saffron" : "text-chrome-dim"}`}>
                  {step.label}
                </span>
                <span className={`font-display text-lg leading-none font-bold ${isNext ? "text-on-saffron" : "text-chrome-signal"}`}>
                  {step.value}
                </span>
                {isNext && <span className="font-mono text-[10px] tracking-wider uppercase">next</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
