# career-ops (vendored)

From https://github.com/career-ops-hq/career-ops, MIT licence (see LICENSE).

| File | Used by | Changes |
|---|---|---|
| `verify-ats.mjs` | `lib/template-check.ts` | one regex patched, marked in the file |
| `liveness-core.mjs` | `core/liveness.mjs` | trimmed to the page classifier (tracker and scan-history helpers removed) |
| `verify-cv-facts.mjs` | `core/fact-check.mjs` | `path-resolver.mjs` import replaced by a stub (Offerbound always passes its sources and config); its self-test passes (`node verify-cv-facts.mjs --self-test`) |
| `lib/` | the files above | unchanged |
