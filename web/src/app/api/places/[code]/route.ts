import { citiesOf } from "@/lib/countries";

// The cities of one country, for the city picker in Settings.
export async function GET(_request: Request, ctx: RouteContext<"/api/places/[code]">) {
  const { code } = await ctx.params;
  const cities = citiesOf(code);
  if (!cities) return Response.json({ error: "Unknown country" }, { status: 404 });
  return Response.json(cities, { headers: { "Cache-Control": "public, max-age=86400" } });
}
