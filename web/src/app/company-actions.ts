"use server";

import { revalidatePath } from "next/cache";
import { boardFromUrl } from "@/core/boards.mjs";
import { MAX_COMPANIES, add, followed, lookUp, lookUpMany, parseCompanies, remove, setMaxDays, store, suggestions, update } from "@/lib/companies";
import type { FollowedCompany } from "@/lib/types";
import type { ActionResult } from "./actions";

// Settings → Sources → Companies you follow. Nothing here uses AI.

const done = (message: string, ok = true): ActionResult => {
  revalidatePath("/settings");
  return { ok, message };
};

const summary = (list: FollowedCompany[]) => {
  const found = list.filter((company) => company.state === "found").length;
  const check = list.filter((company) => company.state === "check").length;
  const none = list.filter((company) => company.state === "none").length;
  return [found && `${found} found`, check && `${check} to check`, none && `${none} without a board found`].filter(Boolean).join(", ");
};

// Adds the companies typed in and looks for their boards straight away.
export async function followCompanies(text: string): Promise<ActionResult> {
  const entries = parseCompanies(String(text ?? "").slice(0, 10000));
  if (!entries.length) return { ok: false, message: "Type a company name, one per line or separated by commas." };
  const added = add(entries);
  if (!added.length) return { ok: false, message: followed().list.length >= MAX_COMPANIES ? `You can follow up to ${MAX_COMPANIES} companies.` : "Those companies are already on the list." };
  const looked = await lookUpMany(added);
  store(looked);
  return done(`Added ${added.length}: ${summary(looked)}.`);
}

// Follows up to ten companies from the saved jobs and looks for their boards.
export async function followFromJobs(): Promise<ActionResult> {
  const picked = suggestions(10);
  if (!picked.length) return { ok: false, message: "No new companies in your jobs yet. Collect some jobs first." };
  const added = add(picked.map((company) => ({ name: company.name })));
  const looked = await lookUpMany(added);
  store(looked);
  return done(`Looked at ${added.length} companies from your jobs: ${summary(looked)}.`);
}

export async function checkCompany(name: string): Promise<ActionResult> {
  const company = followed().list.find((item) => item.name === name);
  if (!company) return { ok: false, message: "That company is not on the list." };
  const looked = await lookUp(company);
  store([looked]);
  return done(`${company.name}: ${looked.message}`, looked.state !== "none");
}

export async function checkAllCompanies(): Promise<ActionResult> {
  const list = followed().list;
  if (!list.length) return { ok: false, message: "No companies yet." };
  const looked = await lookUpMany(list);
  store(looked);
  return done(`Checked ${list.length}: ${summary(looked)}.`);
}

// The user opened a "check" board and says it is the right company.
export async function confirmCompanyBoard(name: string): Promise<ActionResult> {
  update(name, { state: "found", message: "You confirmed this board." });
  return done(`${name}: board confirmed.`);
}

// A board or careers page link the user pastes for a company.
export async function setCompanyLink(name: string, link: string): Promise<ActionResult> {
  const text = String(link ?? "").trim();
  const board = boardFromUrl(/^https?:/i.test(text) ? text : `https://${text}`);
  const company = followed().list.find((item) => item.name === name);
  if (!company) return { ok: false, message: "That company is not on the list." };
  // Not a board link: treat it as the website and look there.
  const next: FollowedCompany = board ? { ...company, board } : { ...company, website: text, board: null };
  const looked = await lookUp(next);
  store([looked]);
  return done(`${name}: ${looked.message}`, looked.state !== "none");
}

export async function unfollowCompany(name: string): Promise<ActionResult> {
  remove(name);
  return done(`${name} removed. Jobs already collected from it stay.`);
}

export async function setCompanyMaxDays(days: number): Promise<ActionResult> {
  const value = Math.round(Number(days));
  if (!Number.isFinite(value) || value < 1 || value > 90) return { ok: false, message: "Choose between 1 and 90 days." };
  setMaxDays(value);
  return done(`Jobs posted in the last ${value} days are collected from company boards.`);
}
