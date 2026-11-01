export type RepostSibling = { id: number; title: string; status: string; found_at: string; applied_at: string | null; excluded_reason: string | null; url: string };
export function companyKey(company: string): string;
export function titleKey(title: string): string;
export function siteOf(url: string): string;
export function findReposts(jobs: { id: number; title: string; company: string; url: string | null; found_at: string; status: string; applied_at: string | null; excluded_reason: string | null }[]): Map<number, RepostSibling[]>;
