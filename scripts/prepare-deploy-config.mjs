import fs from "node:fs";

const d1Id = process.env.D1_ID?.trim();
const pulseD1Id = process.env.PULSE_D1_ID?.trim();
if (!d1Id) {
  throw new Error("D1_ID environment variable is required");
}
if (!pulseD1Id) {
  throw new Error("PULSE_D1_ID environment variable is required");
}

const sourcePath = process.argv[2] || "wrangler.jsonc";
const outputPath = process.argv[3] || ".wrangler.deploy.jsonc";
const source = fs.readFileSync(sourcePath, "utf8");
const config = JSON.parse(source);

const binding = config.d1_databases?.find((item) => item.binding === "DB");
if (!binding) {
  throw new Error("wrangler config does not contain DB D1 binding");
}
const pulseBinding = config.d1_databases?.find((item) => item.binding === "PULSE_DB");
if (!pulseBinding) {
  throw new Error("wrangler config does not contain PULSE_DB D1 binding");
}

binding.database_id = d1Id;
pulseBinding.database_id = pulseD1Id;
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared ${outputPath} with Radar D1 ${d1Id} and Pulse D1 ${pulseD1Id}`);
