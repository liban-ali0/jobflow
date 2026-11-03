export type ListingCheck = { state: "open" | "closed" | "unsure"; reason: string; blocked?: boolean };
export function linkedInId(url: string): string | null;
export function listingSite(url: string): string | null;
export function checkListing(url: string): Promise<ListingCheck | null>;
export function publicAddress(ip: string): boolean;
export function browserListing(url: string): boolean;
export function classifyBrowserPage(page: { url: string; finalUrl?: string; text?: string; controls?: string[] }): ListingCheck;
export function loadPage(url: string): Promise<{ status: number; finalUrl: string; text: string }>;
