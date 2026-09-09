import type { OutputCourse, QuarterTimetable } from "./schedule-output";

export const SCHEDULE_IMAGE_PRESETS = [
  { id: "pc-fhd", label: "PC（1920 × 1080）", width: 1920, height: 1080 },
  { id: "pc-qhd", label: "PC・高解像度（2560 × 1440）", width: 2560, height: 1440 },
  { id: "phone-16-9", label: "スマホ（1080 × 1920）", width: 1080, height: 1920 },
  { id: "phone-20-9", label: "スマホ・縦長（1080 × 2400）", width: 1080, height: 2400 },
] as const;

type ImageOptions = { academicYear?: number; departmentName?: string; year?: number };
type TextSection = { text: string; emphasis?: boolean };
type TextLine = { text: string; size: number; height: number; emphasis: boolean; gap: number };
type TextLayout = { lines: TextLine[]; height: number };
type DetailEntry = { course: OutputCourse; reference?: number; layout: TextLayout };

const fontFamily = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
const colors = {
  ink: "#18382f", secondary: "#476057", muted: "#70857c", grid: "#c9d8d0", paper: "#f3f7f3",
};

function font(ctx: CanvasRenderingContext2D, size: number, emphasis = false) {
  ctx.font = `${emphasis ? 700 : 500} ${size}px ${fontFamily}`;
}

/** Keep classroom codes and other short ASCII words intact across line breaks.
 * Words wider than a complete line fall back to Unicode code-point wrapping.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] | null {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    const tokens = paragraph.match(/[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*|[\s\S]/gu) || [];
    for (const token of tokens) {
      const pieces = ctx.measureText(token).width > width ? Array.from(token) : [token];
      for (const piece of pieces) {
        if (ctx.measureText(piece).width > width) return null;
        if (line && ctx.measureText(line + piece).width > width) {
          lines.push(line);
          line = piece;
        } else line += piece;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textLayout(ctx: CanvasRenderingContext2D, sections: TextSection[], width: number, size: number): TextLayout | null {
  const lines: TextLine[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    const sectionSize = section.emphasis ? size * 1.13 : size;
    font(ctx, sectionSize, section.emphasis);
    const wrapped = wrap(ctx, section.text, width);
    if (!wrapped) return null;
    wrapped.forEach((text, index) => lines.push({
      text, size: sectionSize, height: sectionSize * 1.25,
      emphasis: Boolean(section.emphasis), gap: index === 0 && sectionIndex > 0 ? size * 0.2 : 0,
    }));
  }
  return { lines, height: lines.reduce((sum, line) => sum + line.height + line.gap, 0) };
}

function fitText(ctx: CanvasRenderingContext2D, sections: TextSection[], width: number, height: number, maximum: number, minimum: number) {
  for (let size = maximum; size >= minimum; size -= 0.5) {
    const layout = textLayout(ctx, sections, width, size);
    if (layout && layout.height <= height) return layout;
  }
  return null;
}

function courseSections(course: OutputCourse, reference?: number): TextSection[] {
  return [
    { text: course.title || "科目名未記載", emphasis: true },
    { text: course.campus || "キャンパス要確認" },
    ...(reference ? [{ text: `教室・担当は詳細［${reference}］` }] : [
      { text: `教室：${course.room || "要確認"}` },
      { text: `担当：${course.instructors || "要確認"}` },
    ]),
  ];
}

function paintText(ctx: CanvasRenderingContext2D, layout: TextLayout, x: number, y: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const line of layout.lines) {
    y += line.gap;
    font(ctx, line.size, line.emphasis);
    ctx.fillStyle = line.emphasis ? colors.ink : colors.secondary;
    ctx.fillText(line.text, x, y);
    y += line.height;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function campusColors(campus: string) {
  if (campus === "実籾") return { background: "#e5f0e6", accent: "#49775a" };
  if (campus === "津田沼") return { background: "#e7eef7", accent: "#527296" };
  if (campus === "オンデマンド") return { background: "#f4eddb", accent: "#92773d" };
  return { background: "#edf0ed", accent: "#738078" };
}

const overflowMessage = "時間割の情報量が多く、この画像サイズでは全文を読みやすく配置できません。縦長のスマホサイズを選ぶか、クウォーターごとの印刷をご利用ください。";

/** Draw a complete, opaque quarter wallpaper. The caller owns encoding/download.
 * Long room/teacher lists move to a numbered detail section instead of being
 * truncated. No student number or other private profile fields are accepted.
 */
export function drawScheduleImage(
  ctx: CanvasRenderingContext2D,
  model: QuarterTimetable,
  width: number,
  height: number,
  options: ImageOptions = {},
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 600 || height < 600 || !model.days.length || !model.rows.length) {
    throw new Error("画像のサイズと出力するクウォーターを確認してください。");
  }
  const portrait = height > width;
  const scale = portrait ? width / 1080 : width / 1920;
  const margin = (portrait ? 34 : 48) * scale;
  const innerWidth = width - margin * 2;
  const top = (portrait ? 160 : 40) * scale;
  const gridTop = top + (portrait ? 180 : 124) * scale;
  const headerHeight = (portrait ? 66 : 52) * scale;
  const bottom = height - (portrait ? 115 : 72) * scale;
  const labelWidth = (portrait ? 52 : 66) * scale;
  const columnWidth = (innerWidth - labelWidth) / model.days.length;
  const padding = (portrait ? 10 : 12) * scale;
  const courseGap = 8 * scale;
  const maximumText = (portrait ? 23 : 20) * scale;
  const minimumText = (portrait ? 18 : 14) * scale;
  const detailText = (portrait ? 20 : 17) * scale;
  const detailGap = 9 * scale;
  const detailHeadingHeight = 34 * scale;
  const referenceIds = new Map<string, number>();
  const allCourses = [...new Map(model.rows.flatMap((row) => row.cells.flatMap((cell) => cell.courses)).map((course) => [course.id, course])).values()];
  let detailEntries: DetailEntry[] = [];
  let detailHeight = 0;
  let rowHeight = 0;
  let layouts: TextLayout[][][] = [];

  // Reserving a detail section can make another crowded cell need a reference;
  // iterate monotonically until every cell and every metadata field fits.
  for (let attempt = 0; attempt <= allCourses.length; attempt += 1) {
    detailEntries = [
      ...allCourses.filter((course) => referenceIds.has(course.id))
        .sort((first, second) => referenceIds.get(first.id)! - referenceIds.get(second.id)!)
        .map((course) => ({ course, reference: referenceIds.get(course.id) })),
      ...model.extraCourses.map((course) => ({ course, reference: undefined })),
    ].map(({ course, reference }) => {
      const sections: TextSection[] = [
        { text: `${reference ? `［${reference}］` : ""}${course.title}${reference ? "" : `（${course.term || "時期要確認"}）`}`, emphasis: true },
        { text: `キャンパス：${course.campus || "要確認"}　教室：${course.room || "要確認"}　担当：${course.instructors || "要確認"}` },
        ...(!reference && course.slots.length ? [{ text: `参考時限：${course.slots.map((slot) => slot.label || `${slot.day}${slot.period}限`).join("・")}（実施日程は別途確認）` }] : []),
      ];
      const layout = textLayout(ctx, sections, innerWidth - padding * 2, detailText);
      if (!layout) throw new Error(overflowMessage);
      return { course, reference, layout };
    });
    detailHeight = detailEntries.length ? detailHeadingHeight + detailEntries.reduce((sum, entry) => sum + entry.layout.height + detailGap, 0) + 14 * scale : 0;
    rowHeight = (bottom - gridTop - headerHeight - detailHeight) / model.rows.length;
    if (rowHeight < 64 * scale) throw new Error(overflowMessage);
    let addedReference = false;
    layouts = model.rows.map((row) => row.cells.map((cell) => {
      const availableHeight = (rowHeight - courseGap * Math.max(0, cell.courses.length - 1)) / Math.max(1, cell.courses.length) - padding * 2;
      return cell.courses.map((course) => {
        const layout = fitText(ctx, courseSections(course, referenceIds.get(course.id)), columnWidth - padding * 2 - 5 * scale, availableHeight, maximumText, minimumText);
        if (layout) return layout;
        if (referenceIds.has(course.id)) throw new Error(overflowMessage);
        referenceIds.set(course.id, referenceIds.size + 1);
        addedReference = true;
        return { lines: [], height: 0 };
      });
    }));
    if (!addedReference) break;
  }

  const metadata = [options.academicYear ? `${options.academicYear}年度` : "", options.departmentName || "", options.year ? `${options.year}年` : ""].filter(Boolean).join("  /  ");
  const metaLayout = fitText(ctx, [{ text: metadata }], innerWidth, 52 * scale, (portrait ? 25 : 22) * scale, 16 * scale);
  if (!metaLayout) throw new Error(overflowMessage);
  // Clear to an opaque background so both PNG and JPEG have the same appearance.
  ctx.save();
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  font(ctx, (portrait ? 22 : 17) * scale, true);
  ctx.fillStyle = colors.muted;
  ctx.fillText("MY TIMETABLE", margin, top);
  font(ctx, (portrait ? 62 : 46) * scale, true);
  ctx.fillStyle = colors.ink;
  ctx.fillText(model.title, margin, top + (portrait ? 38 : 26) * scale);
  paintText(ctx, metaLayout, margin, top + (portrait ? 116 : 82) * scale);

  ctx.fillStyle = colors.ink;
  roundedRect(ctx, margin, gridTop, innerWidth, headerHeight, 9 * scale);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  font(ctx, (portrait ? 25 : 21) * scale, true);
  ctx.fillText("時限", margin + labelWidth / 2, gridTop + headerHeight / 2);
  model.days.forEach((day, index) => ctx.fillText(day, margin + labelWidth + columnWidth * (index + 0.5), gridTop + headerHeight / 2));

  model.rows.forEach((row, rowIndex) => {
    const rowTop = gridTop + headerHeight + rowIndex * rowHeight;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    font(ctx, (portrait ? 30 : 25) * scale, true);
    ctx.fillStyle = colors.secondary;
    ctx.fillText(String(row.period), margin + labelWidth / 2, rowTop + rowHeight / 2);
    row.cells.forEach((cell, columnIndex) => {
      const x = margin + labelWidth + columnIndex * columnWidth;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, rowTop, columnWidth, rowHeight);
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(x, rowTop, columnWidth, rowHeight);
      if (!cell.courses.length) {
        ctx.fillStyle = "#c8d4cc";
        font(ctx, 18 * scale);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("—", x + columnWidth / 2, rowTop + rowHeight / 2);
      }
      const courseHeight = (rowHeight - courseGap * Math.max(0, cell.courses.length - 1)) / Math.max(1, cell.courses.length);
      cell.courses.forEach((course, courseIndex) => {
        const y = rowTop + courseIndex * (courseHeight + courseGap);
        const palette = campusColors(course.campus);
        ctx.fillStyle = palette.background;
        ctx.fillRect(x + 2 * scale, y + 2 * scale, columnWidth - 4 * scale, courseHeight - 4 * scale);
        ctx.fillStyle = palette.accent;
        ctx.fillRect(x + 2 * scale, y + 2 * scale, 4 * scale, courseHeight - 4 * scale);
        paintText(ctx, layouts[rowIndex][columnIndex][courseIndex], x + padding + 5 * scale, y + padding);
      });
    });
  });

  if (detailEntries.length) {
    let y = bottom - detailHeight + 14 * scale;
    font(ctx, (portrait ? 22 : 19) * scale, true);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = colors.ink;
    ctx.fillText(referenceIds.size && model.extraCourses.length ? "授業の詳細・集中講義など" : referenceIds.size ? "授業の詳細" : "集中講義・別途日程を確認する科目", margin, y);
    y += detailHeadingHeight;
    for (const entry of detailEntries) {
      paintText(ctx, entry.layout, margin + padding, y);
      y += entry.layout.height + detailGap;
    }
  }
  font(ctx, (portrait ? 19 : 17) * scale);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = colors.secondary;
  ctx.fillText("履修計画用・正式な履修登録はポータルで完了してください。", margin, bottom + 24 * scale);
  ctx.restore();
}
