import type { Settings } from "./types";

// Job sites the Offerbound extension reads in the user's own browser (they
// block automated access). Each site: how to search it, which links are job
// ads, and the country it covers. The extension reads the cards around those
// links; the app turns them into jobs. Kept here, not in the extension, so a
// site's rules can change without reinstalling the extension.

export type BrowserSite = {
  key: string;
  name: string;
  // A job ad's address on this site.
  link: string;
  // The country a site covers, or one per country for international sites.
  countries: string[] | "any";
  // Search addresses for a keyword in a country; null when the site has one
  // listing page for everything (searched once).
  search: (keyword: string, country: string) => string | null;
  listing?: string;
  // Keywords in the country's own language are used for these.
  localKeywords?: boolean;
};

const slug = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const INDEED: Record<string, string> = { Turkey: "tr.indeed.com", "United Arab Emirates": "ae.indeed.com", UAE: "ae.indeed.com", "Saudi Arabia": "sa.indeed.com", Qatar: "qa.indeed.com" };

export const BROWSER_SITES: BrowserSite[] = [
  {
    key: "kariyer",
    name: "Kariyer.net",
    link: "kariyer\\.net/is-ilani/",
    countries: ["Turkey"],
    search: (keyword) => `https://www.kariyer.net/is-ilanlari/${slug(keyword).replace(/-/g, "+")}`,
    localKeywords: true,
  },
  {
    key: "eleman",
    name: "Eleman.net",
    link: "eleman\\.net/is-ilani/.+-i\\d+",
    countries: ["Turkey"],
    search: (keyword) => `https://www.eleman.net/is-ilanlari/${slug(keyword)}`,
    localKeywords: true,
  },
  {
    key: "techcareer",
    name: "Techcareer.net",
    link: "techcareer\\.net/jobs/detail/",
    countries: ["Turkey"],
    search: () => null,
    listing: "https://www.techcareer.net/jobs",
  },
  {
    key: "indeed",
    name: "Indeed",
    link: "indeed\\.com/(viewjob|rc/clk|pagead/clk|.*[?&]jk=)",
    countries: Object.keys(INDEED),
    search: (keyword, country) => (INDEED[country] ? `https://${INDEED[country]}/jobs?q=${encodeURIComponent(keyword)}&fromage=1` : null),
    localKeywords: true,
  },
];

// Turkish job titles are searched on Turkish sites, next to the English ones.
const TURKISH = /[çğıöşüÇĞİÖŞÜ]|mühendis|geliştirici|uzman|bilimci|yönetici|sorumlu|destek/i;
const ARABIC = /[؀-ۿ]/;
const PER_ROLE = 2;
// At most this many search pages per site in one run: a slow, human pace.
export const PAGES_PER_SITE = 6;

export type PlannedPage = { url: string; keyword: string; role: string | null; country: string };

// The pages one collect run reads, per enabled site, highest priority first.
export function collectPlan(settings: Settings) {
  const enabled = new Set(settings.sources.filter((source) => source.enabled).map((source) => source.key));
  const countries = [...settings.countries].sort((a, b) => a.priority - b.priority).map((country) => country.name);
  const roles = [...settings.roles].sort((a, b) => a.priority - b.priority);
  return BROWSER_SITES.filter((site) => enabled.has(site.key))
    .map((site) => {
      const covered = site.countries === "any" ? countries : countries.filter((country) => (site.countries as string[]).includes(country));
      const pages: PlannedPage[] = [];
      if (site.listing && covered.length) pages.push({ url: site.listing, keyword: "", role: null, country: covered[0] });
      for (const country of covered) {
        for (const role of roles) {
          const english = role.keywords.filter((keyword) => !TURKISH.test(keyword) && !ARABIC.test(keyword)).slice(0, PER_ROLE);
          const local = site.localKeywords && country === "Turkey" ? role.keywords.filter((keyword) => TURKISH.test(keyword)).slice(0, PER_ROLE) : [];
          for (const keyword of [...local, ...english]) {
            const url = site.search(keyword, country);
            if (url && !pages.some((page) => page.url === url)) pages.push({ url, keyword, role: role.key, country });
          }
        }
      }
      return { key: site.key, name: site.name, link: site.link, pages: pages.slice(0, PAGES_PER_SITE) };
    })
    .filter((site) => site.pages.length > 0);
}

// Lower case without accents, Turkish-aware ("İstanbul" → "istanbul").
export const fold = (text: string) =>
  text.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Turkish and Gulf city names (folded), to tell a card's location line from its company.
const CITY_NAMES: Record<string, string> = {
  istanbul: "Istanbul", ankara: "Ankara", izmir: "Izmir", bursa: "Bursa", antalya: "Antalya", kocaeli: "Kocaeli", konya: "Konya",
  adana: "Adana", gaziantep: "Gaziantep", mersin: "Mersin", kayseri: "Kayseri", eskisehir: "Eskişehir", sakarya: "Sakarya",
  tekirdag: "Tekirdağ", denizli: "Denizli", manisa: "Manisa", samsun: "Samsun", trabzon: "Trabzon", dubai: "Dubai",
  "abu dhabi": "Abu Dhabi", sharjah: "Sharjah", riyadh: "Riyadh", jeddah: "Jeddah", dammam: "Dammam", khobar: "Khobar", doha: "Doha",
};
const CITIES = new RegExp(`(^|[^a-z])(${Object.keys(CITY_NAMES).join("|")})([^a-z]|$)`);
const cityIn = (line: string) => CITY_NAMES[fold(line).match(CITIES)?.[2] ?? ""] ?? null;

// Words that say nothing about the field ("specialist", "senior"), left out
// when matching a title to the user's roles.
const GENERIC = new Set(
  "uzman uzmani specialist senior junior kidemli elemani personeli sorumlusu sorumlu yardimcisi lead head manager muduru mudur staj stajyer intern the and for ile ve engineer muhendis muhendisi destek support yonetici yoneticisi".split(
    " ",
  ),
);
const words = (text: string) => fold(text).split(/[^a-z0-9؀-ۿ]+/).filter(Boolean);

// The words of the user's role keywords. A card whose title has none of them
// is not for these roles (a site's general listings after an unknown search).
export function roleWords(settings: Settings) {
  return new Set(settings.roles.flatMap((role) => role.keywords).flatMap(words).filter((word) => word.length >= 2 && !GENERIC.has(word)));
}
export const titleFits = (title: string, known: Set<string>) => words(title).some((word) => known.has(word));

export type CapturedCard = { url: string; title: string; lines: string[] };

// A card's text as a job: the title the site shows, then the first line that
// is not a location, a date, or the title is the company; a line naming a
// city is the location.
export function cardToJob(card: CapturedCard) {
  const title = card.title.replace(/\s+/g, " ").trim().slice(0, 200);
  const lines = card.lines.map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line && line !== title && line.length < 160);
  const location = lines.find((line) => cityIn(line)) ?? null;
  const company =
    lines.find((line) => line !== location && !/\b(gün|saat|dakika|hafta|ay) önce\b|\bago\b|bugün|today|yeni|new|inceledin|başvur|apply|kaydet|save/i.test(line) && !/^\d/.test(line)) ?? null;
  return { title, company, city: location ? cityIn(location) : null, location };
}
