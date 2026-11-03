import Link from "next/link";
import { compareOffers } from "@/app/offer-actions";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { stageReady, stageRunning } from "@/lib/engine";
import { formatDateTime } from "@/lib/format";
import { offerRows, readComparison, type OfferRow } from "@/lib/offers";
import { STATUS_LABELS } from "@/lib/types";

const POSITION = { below: { label: "Below the market range", tone: "text-coral" }, within: { label: "Within the market range", tone: "text-go" }, above: { label: "Above the market range", tone: "text-go" } } as const;
const money = (value: number | null, currency: string) => (value === null ? "Not given" : `${currency} ${value.toLocaleString("en-US")}`.trim());

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 align-top" dir="auto">
      {children}
    </td>
  );
}

// Offers side by side: the terms the user entered, worked out in code, and an
// optional AI comparison with negotiation points.
export default function OffersPage() {
  const { offers, interviewing, currencies } = offerRows();
  const comparison = readComparison();
  const running = stageRunning("compare-offers");
  const rows: { label: string; value: (row: OfferRow) => React.ReactNode }[] = [
    { label: "Status", value: (row) => STATUS_LABELS[row.job.status] },
    { label: "Base pay", value: (row) => (row.offer ? `${money(row.offer.pay, row.offer.currency)} a ${row.offer.period}` : "Not entered") },
    { label: "Allowances", value: (row) => (row.offer?.allowances ? `${money(row.offer.allowances, row.offer.currency)} a ${row.offer.period}` : "—") },
    { label: "Bonus a year", value: (row) => (row.offer?.bonus ? money(row.offer.bonus, row.offer.currency) : "—") },
    { label: "Yearly cash", value: (row) => (row.offer ? <span className="font-mono font-semibold">{money(row.yearly, row.offer.currency)}</span> : "—") },
    {
      label: "Against the market",
      value: (row) =>
        row.market ? (
          <>
            {row.market.position && <span className={`block font-medium ${POSITION[row.market.position].tone}`}>{POSITION[row.market.position].label}</span>}
            {!row.market.position && row.offer?.currency && row.market.currency && row.market.currency !== row.offer.currency && (
              <span className="block text-slate">Range in {row.market.currency}: not compared with an offer in {row.offer.currency}</span>
            )}
            <span className="text-xs text-slate">
              {money(row.market.low, row.market.currency)} to {row.market.high.toLocaleString("en-US")} a {row.market.period}
            </span>
          </>
        ) : (
          <span className="text-slate">No range researched</span>
        ),
    },
    { label: "Title", value: (row) => row.offer?.title || row.job.title },
    { label: "Location", value: (row) => [row.offer?.location || row.job.city || row.job.country, row.offer?.workMode].filter(Boolean).join(" · ") || "—" },
    { label: "Benefits", value: (row) => row.offer?.benefits || "—" },
    { label: "Contract", value: (row) => [row.offer?.contract, row.offer?.probation && `probation ${row.offer.probation}`].filter(Boolean).join(", ") || "—" },
    { label: "Start", value: (row) => row.offer?.start || "—" },
    {
      label: "Answer by",
      value: (row) =>
        row.offer?.deadline ? (
          <span className={row.daysLeft !== null && row.daysLeft <= 2 ? "font-medium text-coral" : ""}>
            {row.offer.deadline}
            {row.daysLeft !== null && <span className="block text-xs text-slate">{row.daysLeft < 0 ? "passed" : row.daysLeft === 0 ? "today" : `${row.daysLeft} ${row.daysLeft === 1 ? "day" : "days"} left`}</span>}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="max-w-6xl">
      <AutoRefresh active={running} />
      <PageHeader
        eyebrow={`${offers.length} ${offers.length === 1 ? "offer" : "offers"}${interviewing.length ? ` · ${interviewing.length} still interviewing` : ""}`}
        title="Offers"
        description="Your offers side by side, with the numbers you entered and where each sits against the market. Nothing is converted between currencies or taxed."
        actions={
          offers.length > 0 ? (
            <ActionButton variant="primary" action={compareOffers} disabled={running || !stageReady("compare-offers")} title="Compares the offers against what matters to you, with negotiation points and questions to ask">
              {running ? "Comparing…" : comparison ? "Compare again" : "Compare with AI"}
            </ActionButton>
          ) : undefined
        }
      />

      <div className="mt-8 space-y-6">
        {offers.length === 0 ? (
          <Panel title="No offers yet">
            <p className="text-sm text-slate">When a job reaches Offer, enter its terms on the job page and it appears here next to the others.</p>
          </Panel>
        ) : (
          <Panel title="Side by side" hint={currencies.length > 1 ? `The offers are in ${currencies.join(" and ")}: compare yearly cash within one currency only.` : "Yearly cash = base pay and allowances for a year, plus the yearly bonus."}>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="w-40 py-2 pr-3" />
                    {offers.map((row) => (
                      <th key={row.job.id} className="px-3 py-2 align-bottom">
                        <Link href={`/jobs/${row.job.id}#offer`} className="font-semibold hover:text-teal" dir="auto">
                          {row.job.company}
                        </Link>
                        <span className="block text-xs font-normal text-slate" dir="auto">
                          {row.job.title}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70 border-t border-line/70">
                  {rows.map((line) => (
                    <tr key={line.label}>
                      <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-slate">
                        {line.label}
                      </th>
                      {offers.map((row) => (
                        <Cell key={row.job.id}>{line.value(row)}</Cell>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {interviewing.length > 0 && (
          <Panel title="Still interviewing" hint="Worth knowing before you answer an offer: ask for more time if one of these matters more.">
            <ul className="space-y-1.5 text-sm">
              {interviewing.map((row) => (
                <li key={row.job.id} className="flex flex-wrap justify-between gap-2">
                  <Link href={`/jobs/${row.job.id}`} className="text-teal hover:underline" dir="auto">
                    {row.job.title} · {row.job.company}
                  </Link>
                  <span className="text-xs text-slate">{row.market ? `Market ${money(row.market.low, row.market.currency)} to ${row.market.high.toLocaleString("en-US")} a ${row.market.period}` : "No range researched"}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {comparison && (
          <Panel title="Comparison" hint={`Written ${formatDateTime(comparison.at)}. A comparison to help you decide, not legal or tax advice.`}>
            <div className="max-w-3xl" dir="auto">
              <Markdown text={comparison.text} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
