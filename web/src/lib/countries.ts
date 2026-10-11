import "server-only";
import places from "@/data/places.json";

// Countries and their cities (15,000+ people, largest first) from GeoNames,
// built by scripts/build-places.mjs. Server only: the cities are sent to the
// browser one country at a time.
type Place = { code: string; name: string; cities: string[] };
const PLACES = places as Place[];
const BY_CODE = new Map(PLACES.map((place) => [place.code, place]));

export type CountryOption = { code: string; name: string };
export const COUNTRY_OPTIONS: CountryOption[] = PLACES.map(({ code, name }) => ({ code, name }));

export const citiesOf = (code: string) => BY_CODE.get(code.toUpperCase())?.cities ?? null;
export const countryName = (code: string) => BY_CODE.get(code.toUpperCase())?.name ?? null;

// Short and older names people use, for countries saved before the picker.
const ALIASES: Record<string, string> = {
  uae: "AE",
  emirates: "AE",
  ksa: "SA",
  turkey: "TR",
  türkiye: "TR",
  turkiye: "TR",
  usa: "US",
  us: "US",
  uk: "GB",
  england: "GB",
};

export function codeFor(name: string) {
  const key = name.trim().toLowerCase();
  return ALIASES[key] ?? PLACES.find((place) => place.name.toLowerCase() === key)?.code ?? null;
}
