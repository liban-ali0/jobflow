// Rebuilds web/src/data/places.json, the countries and cities offered in
// Settings, from GeoNames (https://www.geonames.org, CC BY 4.0). Download
// countryInfo.txt and cities15000.zip from https://download.geonames.org/export/dump/,
// unzip them into one folder, then run:
//
//   node scripts/build-places.mjs <that folder> web/src/data/places.json
//
// Cities are those with 15,000 or more people, largest first.
import fs from "node:fs";
import path from "node:path";
const [dir, out] = process.argv.slice(2);
const countries = {};
for (const line of fs.readFileSync(path.join(dir, "countryInfo.txt"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const f = line.split("\t");
  countries[f[0]] = { name: f[4], cities: [] };
}
const KEEP = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLG", "PPLS", "PPLF", "PPLL", "PPLR"]);
const rows = [];
for (const line of fs.readFileSync(path.join(dir, "cities15000.txt"), "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15 || !KEEP.has(f[7]) || !countries[f[8]]) continue;
  rows.push({ name: f[1], code: f[8], pop: Number(f[14]) || 0 });
}
rows.sort((a, b) => b.pop - a.pop);
for (const row of rows) {
  const list = countries[row.code].cities;
  if (!list.includes(row.name)) list.push(row.name);
}
const result = Object.entries(countries)
  .map(([code, { name, cities }]) => ({ code, name, cities }))
  .sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(out, JSON.stringify(result));
console.log(result.length, "countries,", rows.length, "cities,", fs.statSync(out).size, "bytes");
