import { cleanFields } from "@/lib/apply-record";
import { extensionDenied } from "@/lib/capture";
import { answeredFacts, appendFact } from "@/lib/data";

// Answers the user typed into an application form, saved for the next forms
// when they tick them on the extension's bar.
export async function POST(request: Request) {
  const denied = extensionDenied(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const known = new Set(answeredFacts().map((fact) => `${fact.question}\u0000${fact.answer}`.toLowerCase()));
  const fields = cleanFields(body?.facts)
    .filter((field) => field.value.length <= 300)
    .slice(0, 20);
  let saved = 0;
  for (const field of fields) {
    if (known.has(`${field.label}\u0000${field.value}`.toLowerCase())) continue;
    appendFact(field.label, field.value);
    saved += 1;
  }
  return Response.json({ ok: true, message: saved ? `Saved ${saved} ${saved === 1 ? "answer" : "answers"} for next time.` : "Nothing new to save." });
}
