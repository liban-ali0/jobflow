"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { ROOT, getJob, updateJob } from "@/lib/data";
import { launch } from "@/lib/engine";
import { COMPARISON_FILE, cleanOffer } from "@/lib/offers";
import type { Offer } from "@/lib/types";

// The offer's terms, from the job page's offer form.
export async function saveOffer(jobId: number, input: Partial<Record<keyof Offer, unknown>>): Promise<ActionResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, message: "This job no longer exists." };
  const offer = cleanOffer(input);
  if (!offer.pay) return { ok: false, message: "Enter the base pay as a number." };
  if (!offer.currency) return { ok: false, message: "Enter the currency, for example AED." };
  updateJob(jobId, { offer });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/offers");
  return { ok: true, message: "Offer saved. Compare it on Offers." };
}

// The AI comparison of every offer (and the interviews still running).
export async function compareOffers(): Promise<ActionResult> {
  fs.mkdirSync(path.join(ROOT, path.dirname(COMPARISON_FILE)), { recursive: true });
  try {
    launch("compare-offers", null);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  revalidatePath("/offers");
  return { ok: true, message: "Comparing now. The comparison appears here in a few minutes." };
}
