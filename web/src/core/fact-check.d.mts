export type FactItem = { kind: string; label: string; value: string; sentence: string | null; advisory: boolean };
export type FactCheck = { items: FactItem[]; forbidden: string[]; note: string | null };
export const FACT_KIND_LABELS: Record<string, string>;
export function factSources(rootDir: string): string[];
export function checkFacts(rootDir: string, text: string): FactCheck;
export function allowFact(rootDir: string, item: { kind: string; value: string }): boolean;
