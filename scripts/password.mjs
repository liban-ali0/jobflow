#!/usr/bin/env node
// The password for opening Offerbound, from a terminal on this computer:
//
//   node scripts/password.mjs status   whether one is set
//   node scripts/password.mjs off      remove it (for a forgotten password)
//
// Set or change it in Settings → This computer.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearPassword, hasPassword } from "../web/src/core/password.mjs";

const ROOT = process.env.JOBFLOW_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
if (command === "off") {
  clearPassword(ROOT);
  console.log("The password is removed: Offerbound opens without one. Set a new one in Settings → This computer.");
} else if (command === "status") {
  console.log(hasPassword(ROOT) ? "A password is set." : "No password is set.");
} else {
  console.log("Use: node scripts/password.mjs status | off");
}
