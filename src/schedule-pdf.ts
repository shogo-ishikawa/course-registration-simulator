import { PDFDocument, PageSizes } from "pdf-lib";
import type { QuarterTimetable } from "./schedule-output";

/** A4 landscape, rendered at 10 pixels per millimetre for clear classroom and
 * instructor labels. The page image uses the same renderer as PNG exports.
 */
export const SCHEDULE_PDF_PAGE = {
  width: PageSizes.A4[1],
  height: PageSizes.A4[0],
  imageWidth: 2970,
  imageHeight: 2100,
} as const;

type PdfOptions = { title?: string };

/** Build the entire document before the caller downloads anything. Each supplied
 * quarter is a separate page, in the supplied order. Embedding rendered PNGs
 * preserves Japanese glyphs without depending on a downloaded PDF font.
 * Page text is visual content; use the existing print route for selectable text.
 */
export async function createSchedulePdf(
  models: readonly QuarterTimetable[],
  renderPage: (model: QuarterTimetable) => Promise<Uint8Array>,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  if (!models.length) {
    throw new Error("PDFに出力する学期・クウォーターを選択してください。");
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(options.title || "時間割");
  pdf.setSubject("履修計画用・正式な履修登録はポータルで完了してください。");
  pdf.setCreator("Course Registration Simulator");

  // Render sequentially to limit peak canvas memory, especially on smartphones.
  // A failure rejects the whole export rather than returning a partial document.
  for (const model of models) {
    const png = await renderPage(model);
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([SCHEDULE_PDF_PAGE.width, SCHEDULE_PDF_PAGE.height]);
    const fitted = image.scaleToFit(SCHEDULE_PDF_PAGE.width, SCHEDULE_PDF_PAGE.height);
    page.drawImage(image, {
      x: (SCHEDULE_PDF_PAGE.width - fitted.width) / 2,
      y: (SCHEDULE_PDF_PAGE.height - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
  }

  return pdf.save();
}
