export type ListingCheck = { state: "open" | "closed" | "unsure"; reason: string; blocked?: boolean };
export function linkedInId(url: string): string | null;
export function listingSite(url: string): string | null;
export function checkListing(url: string): Promise<ListingCheck | null>;
