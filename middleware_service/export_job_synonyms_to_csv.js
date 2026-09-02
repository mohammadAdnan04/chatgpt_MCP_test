const fs = require("fs");
const path = require("path");

const INPUT_PATH = path.resolve(__dirname, "job_synonyms.json");
const OUTPUT_PATH = path.resolve(__dirname, "..", "job_synonyms_groups.csv");

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function main() {
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const dict = JSON.parse(raw);

  const keys = Object.keys(dict).sort((a, b) => a.localeCompare(b));
  const rows = [["group_key", "synonym"]];

  let groups = 0;
  let pairs = 0;

  for (const key of keys) {
    const values = dict[key];
    if (!Array.isArray(values)) continue;
    groups += 1;

    const unique = Array.from(
      new Set(
        values
          .filter((v) => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    for (const synonym of unique) {
      rows.push([csvCell(key), csvCell(synonym)]);
      pairs += 1;
    }
  }

  const csv = rows.map((r) => r.join(",")).join("\n") + "\n";
  fs.writeFileSync(OUTPUT_PATH, csv, "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        input: INPUT_PATH,
        output: OUTPUT_PATH,
        groups,
        pairs,
      },
      null,
      2
    ) + "\n"
  );
}

main();
