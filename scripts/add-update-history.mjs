import fs from "node:fs/promises";

const historyPath = "src/data/update-history.json";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const message = option("--message")?.trim();
const updatedAt = option("--date") || new Date().toISOString();

if (!message) {
  console.error("使い方: npm run history:add -- --message \"更新内容\" [--date ISO日時]");
  process.exit(2);
}
if (Number.isNaN(new Date(updatedAt).getTime())) {
  console.error("--date には有効なISO日時を指定してください。");
  process.exit(2);
}

const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
history.unshift({ updatedAt: new Date(updatedAt).toISOString(), message, source: "manual" });
await fs.writeFile(historyPath, `${JSON.stringify(history.slice(0, 100), null, 2)}\n`);
console.log(`更新履歴を追加しました: ${message}`);
