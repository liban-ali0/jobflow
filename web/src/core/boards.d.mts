export type Board = { vendor: string; slug: string; url: string; host?: string; tenant?: string; site?: string; lang?: string };
export type BoardJob = { title: string; url: string; location: string; countryCode?: string | null; posted_at: string | null; work_mode?: string | null; description?: string; ref?: string };
export type BoardContext = { fetch(url: string, options?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<{ status: number; text: string }> };
export type FoundBoard = { state: "found" | "check" | "none"; board?: Board; jobs?: BoardJob[]; via?: string; message: string };
export const VENDOR_NAMES: Record<string, string>;
export const SEARCHED: Set<string>;
export const defaultContext: BoardContext;
export function htmlToText(html: string): string;
export function fold(text: string): string;
export function nameWords(name: string): string[];
export function slugCandidates(name: string): string[];
export function sameCompany(a: string, b: string): boolean;
export function boardsIn(text: string): Board[];
export function boardFromUrl(url: string): Board | null;
export function websiteUrl(text: string): string | null;
export function workdayPosted(text: string, now?: number): string | null;
export function readBoard(board: Board, ctx?: BoardContext, keywords?: string[]): Promise<{ jobs?: BoardJob[]; name?: string | null; missing?: boolean; blocked?: boolean; failed?: boolean }>;
export function readDescription(board: Board, job: BoardJob, ctx?: BoardContext): Promise<string | null>;
export function findBoard(
  company: { name: string; website?: string; board?: Board | null },
  options?: { ctx?: BoardContext; loadPage?: ((url: string) => Promise<{ status: number; finalUrl: string; text: string }>) | null; keywords?: string[] },
): Promise<FoundBoard>;
export function jobMatcher(settings: { countries?: { code?: string; name: string; priority: number; cities: string[] }[]; roles?: { key: string; label: string; priority: number; keywords: string[] }[] }, citiesOf?: (code: string) => string[] | null): (job: { title: string; location: string; countryCode?: string | null }) => { role: string; country: string; city: string | null } | null;
export function searchWords(settings: { roles?: { priority: number; keywords: string[] }[] }, perRole?: number, limit?: number): string[];
