import fs from "node:fs";

const d1Id = process.env.D1_ID?.trim();
if (!d1Id) {
  throw new Error("D1_ID environment variable is required");
}

const sourcePath = process.argv[2] || "wrangler.jsonc";
const outputPath = process.argv[3] || "/tmp/wrangler.deploy.jsonc";
const source = fs.readFileSync(sourcePath, "utf8");
const config = JSON.parse(source);

const binding = config.d1_databases?.find((item) => item.binding === "DB");
if (!binding) {
  throw new Error("wrangler config does not contain DB D1 binding");
}

binding.database_id = d1Id;
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared ${outputPath} with D1 database ${d1Id}`);
