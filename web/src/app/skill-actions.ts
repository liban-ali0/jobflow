"use server";

import { revalidatePath } from "next/cache";
import { confirmSkill } from "@/lib/data";
import { dismissSkill } from "@/lib/skill-gaps";
import type { ActionResult } from "./actions";

// Profile → Skills your jobs ask for.

const clean = (text: string, max: number) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The candidate has it: written to facts.md, so research and tailoring use it.
export async function haveSkill(skill: string, evidence: string): Promise<ActionResult> {
  const name = clean(skill, 80);
  const where = clean(evidence, 300);
  if (!name) return { ok: false, message: "No skill given." };
  if (!where) return { ok: false, message: "Say where you used it, so the CV can show it truthfully." };
  confirmSkill(name, where);
  revalidatePath("/profile");
  return { ok: true, message: `${name} added to your facts. Rebuild the profile to put it in your base CVs; tailored CVs use it from now on.` };
}

export async function lackSkill(skill: string): Promise<ActionResult> {
  dismissSkill(clean(skill, 80));
  revalidatePath("/profile");
  return { ok: true, message: `${clean(skill, 80)} hidden.` };
}

export async function restoreSkill(skill: string): Promise<ActionResult> {
  dismissSkill(clean(skill, 80), true);
  revalidatePath("/profile");
  return { ok: true, message: `${clean(skill, 80)} shown again.` };
}
