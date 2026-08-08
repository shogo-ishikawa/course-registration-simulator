import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function candidateUrls(rawUrl) {
  const original = new URL(rawUrl);
  const download = new URL(original);
  download.searchParams.set("download", "1");

  const candidates = [];
  const boxSharedLink = original.hostname.endsWith(".box.com")
    ? original.pathname.match(/^\/s\/([a-z0-9]+)\/?$/i)
    : null;

  // Boxの /s/ URLは閲覧用HTMLを返すことがある。公開ファイル用の
  // /shared/static/ URLを先に試し、認証不要のダウンロードを利用する。
  if (boxSharedLink) {
    const staticDownload = new URL(original.origin);
    staticDownload.pathname = `/shared/static/${boxSharedLink[1]}.xlsx`;
    candidates.push(staticDownload.href);
  }

  candidates.push(
    ...(original.pathname.toLowerCase().endsWith(".xlsx")
      ? [original.href, download.href]
      : [download.href, original.href]),
  );
  return [...new Set(candidates)];
}

export function looksLikeXlsx(bytes) {
  // XLSX is a ZIP container and must start with a ZIP local-file signature.
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function fetchTimetable(sourceUrl, outputPath = ".cache/timetable.xlsx") {
  if (!sourceUrl) {
    console.error("TIMETABLE_XLSX_URL が設定されていません。");
    return 2;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    const bytes = new Uint8Array(await fs.readFile(sourceUrl));
    if (!looksLikeXlsx(bytes)) {
      console.error("指定したローカルファイルはXLSX形式ではありません。");
      return 1;
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, bytes);
    console.log(JSON.stringify({ outputPath, bytes: bytes.length, source: "local" }, null, 2));
    return 0;
  }

  const failures = [];
  for (const candidate of candidateUrls(sourceUrl)) {
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
      return 0;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  console.error("時間割Excelを取得できませんでした。");
  console.error("Boxの共有設定が『リンクを知っている全員・閲覧およびダウンロード可』になっているか確認してください。");
  console.error(failures.join("\n"));
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceUrl = process.argv[2] || process.env.TIMETABLE_XLSX_URL;
  const outputPath = process.argv[3] || ".cache/timetable.xlsx";
  process.exitCode = await fetchTimetable(sourceUrl, outputPath);
}
