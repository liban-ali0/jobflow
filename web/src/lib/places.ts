import { ageMinutes } from "./format";
import type { Job, Settings } from "./types";

// Airport codes for the cities jobs are posted in, shown on the departures
// board. Unknown cities fall back to the country code, and countries without
// one here to their first letters.
const CITY_CODES: Record<string, string> = {
  dubai: "DXB",
  "abu dhabi": "AUH",
  sharjah: "SHJ",
  ajman: "SHJ",
  "ras al khaimah": "RKT",
  "al ain": "AAN",
  riyadh: "RUH",
  jeddah: "JED",
  dammam: "DMM",
  khobar: "DMM",
  "al khobar": "DMM",
  dhahran: "DMM",
  jubail: "DMM",
  neom: "NUM",
  mecca: "JED",
  medina: "MED",
  doha: "DOH",
  ankara: "ESB",
  istanbul: "IST",
  izmir: "ADB",
  antalya: "AYT",
  bursa: "YEI",
};

const COUNTRY_CODES: Record<string, string> = {
  UAE: "UAE",
  "Saudi Arabia": "KSA",
  Qatar: "QAT",
  Turkey: "TUR",
};

export function placeCode(job: Pick<Job, "city" | "country" | "work_mode">) {
  if (job.work_mode === "remote") return "RMT";
  const city = job.city?.toLowerCase().replace(/ (city|emirate|region)$/, "").trim();
  if (city) {
    for (const [name, code] of Object.entries(CITY_CODES)) {
      if (city === name || city.startsWith(`${name} `) || city.endsWith(` ${name}`)) return code;
    }
  }
  if (!job.country) return "---";
  // Other countries show their first three letters, like "GER".
  return COUNTRY_CODES[job.country] ?? job.country.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "-");
}

export type Boarding = { label: string; tone: "boarding" | "ontime" | "lastcall" | "departed" | "unknown" };

// A posting's age read as a flight status: fresh ones are boarding, ones
// close to the age limit are on last call.
export function boarding(job: Pick<Job, "posted_at">, settings: Settings): Boarding {
  const minutes = ageMinutes(job.posted_at);
  if (minutes === null) return { label: "Unknown", tone: "unknown" };
  const limit = settings.freshness.maxHours * 60;
  if (minutes <= settings.freshness.fastTrackMinutes) return { label: "Boarding", tone: "boarding" };
  if (minutes > limit) return { label: "Departed", tone: "departed" };
  if (minutes > limit * 0.75) return { label: "Last call", tone: "lastcall" };
  return { label: "On time", tone: "ontime" };
}
