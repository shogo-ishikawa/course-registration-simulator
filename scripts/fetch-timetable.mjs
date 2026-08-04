import fs from "node:fs/promises";
import path from "node:path";

const sourceUrl = process.argv[2] || process.env.TIMETABLE_XLSX_URL;
const outputPath = process.argv[3] || ".cache/timetable.xlsx";

if (!sourceUrl) {
  console.error("TIMETABLE_XLSX_URL が設定されていません。");
  process.exit(2);
}

if (!/^https?:\/\//i.test(sourceUrl)) {
  const bytes = new Uint8Array(await fs.readFile(sourceUrl));
  if (!looksLikeXlsx(bytes)) {
    console.error("指定したローカルファイルはXLSX形式ではありません。");
    process.exit(1);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  console.log(JSON.stringify({ outputPath, bytes: bytes.length, source: "local" }, null, 2));
  process.exit(0);
}

function candidateUrls(rawUrl) {
  const original = new URL(rawUrl);
  const download = new URL(original);
  download.searchParams.set("download", "1");
  return original.pathname.toLowerCase().endsWith(".xlsx")
    ? [original.href, download.href]
    : [download.href, original.href];
}

function looksLikeXlsx(bytes) {
  // XLSX is a ZIP container and must start with a ZIP local-file signature.
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

const failures = [];
for (const candidate of [...new Set(candidateUrls(sourceUrl))]) {
  try {
    const response = await fetch(candidate, {
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.5",
        "user-agent": "Nihon-CIT-Timetable-Updater/1.0 (+GitHub Actions)",
      },
    });
    if (!response.ok) {
      failures.push(`${response.status} ${response.statusText}`);
      continue;
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 100_000_000) {
      failures.push("100MBを超えるため中止");
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 100_000_000 || !looksLikeXlsx(bytes)) {
      const contentType = response.headers.get("content-type") || "不明";
      failures.push(`Excelではない応答（${contentType}, ${bytes.length} bytes）`);
      continue;
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, bytes);
    console.log(JSON.stringify({ outputPath, bytes: bytes.length, finalUrl: response.url }, null, 2));
    process.exit(0);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

console.error("時間割Excelを取得できませんでした。");
console.error("Boxの共有設定が『リンクを知っている全員・閲覧およびダウンロード可』になっているか確認してください。");
console.error(failures.join("\n"));
process.exit(1);
