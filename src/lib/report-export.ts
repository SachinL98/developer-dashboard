// Export a built slide deck to PPTX and PDF. Both use a light, print-friendly palette.
import PptxGenJS from "pptxgenjs";
import PDFDocument from "pdfkit";
import type { Slide } from "./report";

const C = { bg: "FFFFFF", ink: "111827", mute: "58637C", line: "D6DCEB", accent: "0A6985", panel: "F1F4FA", good: "3F6212", bad: "BE123C", s1: "0A6985", s2: "6D28D9" };
const toneColor = (t?: string) => (t === "good" ? C.good : t === "bad" ? C.bad : C.ink);
const fileSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
export const reportFileName = (title: string, ext: string) => `${fileSafe(title) || "report"}.${ext}`;

export async function toPptx(slides: Slide[], deckTitle: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = deckTitle;
  pptx.company = "SpaceIT Labs";
  slides.forEach((s, i) => {
    const sl = pptx.addSlide();
    sl.background = { color: C.bg };
    if (s.layout === "title") {
      sl.addShape("rect", { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: C.accent } });
      sl.addText(s.title, { x: 0.9, y: 2.3, w: 11.5, h: 1.4, fontSize: 40, bold: true, color: C.ink, fontFace: "Calibri", valign: "bottom" });
      sl.addText(s.subtitle, { x: 0.9, y: 3.8, w: 11.5, h: 0.5, fontSize: 20, color: C.accent, fontFace: "Calibri" });
      sl.addText(s.meta.join("\n"), { x: 0.9, y: 4.5, w: 11.5, h: 1, fontSize: 14, color: C.mute, fontFace: "Calibri", valign: "top" });
    } else {
      sl.addText(s.title, { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: C.ink, fontFace: "Calibri" });
      sl.addShape("rect", { x: 0.6, y: 1.15, w: 1.2, h: 0.06, fill: { color: C.accent } });
      sl.addText(`${i + 1}`, { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.mute, align: "right" });
      let bottom = 6.7;
      if (s.note) {
        sl.addShape("rect", { x: 0.6, y: 6.15, w: 12.1, h: 0.75, fill: { color: C.panel }, line: { color: C.line, width: 0.75 } });
        sl.addText(s.note, { x: 0.75, y: 6.15, w: 11.8, h: 0.75, fontSize: 13, italic: true, color: C.ink, valign: "middle", fontFace: "Calibri" });
        bottom = 6.0;
      }
      if (s.layout === "kpis") {
        const n = s.kpis.length, gap = 0.25, w = (12.1 - gap * (n - 1)) / n;
        s.kpis.forEach((k, j) => {
          const x = 0.6 + j * (w + gap);
          sl.addShape("roundRect", { x, y: 1.55, w, h: 1.7, fill: { color: C.panel }, line: { color: C.line, width: 0.75 }, rectRadius: 0.1 });
          sl.addText(k.label.toUpperCase(), { x: x + 0.15, y: 1.62, w: w - 0.3, h: 0.35, fontSize: 10, color: C.mute, bold: true });
          sl.addText(k.value, { x: x + 0.15, y: 1.95, w: w - 0.3, h: 0.7, fontSize: 30, bold: true, color: toneColor(k.tone), fontFace: "Calibri" });
          if (k.sub) sl.addText(k.sub, { x: x + 0.15, y: 2.65, w: w - 0.3, h: 0.45, fontSize: 11, color: C.mute, valign: "top" });
        });
        sl.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 3.55, w: 12.1, h: bottom - 3.55, fontSize: 16, color: C.ink, valign: "top", paraSpaceAfter: 6, fontFace: "Calibri" });
      } else if (s.layout === "bullets") {
        sl.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.5, w: 12.1, h: bottom - 1.5, fontSize: 20, color: C.ink, valign: "top", paraSpaceAfter: 10, fontFace: "Calibri" });
      } else if (s.layout === "table") {
        const head = s.columns.map((c) => ({ text: c, options: { bold: true, color: C.mute, fill: { color: C.panel }, fontSize: 12 } }));
        const body = s.rows.map((r) => r.map((c) => ({ text: c, options: { color: C.ink, fontSize: 12 } })));
        const wide = s.columns.indexOf("Title") >= 0 ? s.columns.indexOf("Title") : s.columns.length >= 4 ? 0 : -1;
        const colW = s.columns.map((_, k) => (wide >= 0 ? (k === wide ? 5.4 : (12.1 - 5.4) / (s.columns.length - 1)) : 12.1 / s.columns.length));
        if (body.length) sl.addTable([head, ...body], { x: 0.6, y: 1.5, w: 12.1, colW, border: { type: "solid", color: C.line, pt: 0.5 }, fontFace: "Calibri", rowH: 0.36 });
        if (s.caption) sl.addText(s.caption, { x: 0.6, y: body.length ? Math.min(bottom - 0.4, 1.5 + 0.36 * (body.length + 1) + 0.15) : 1.6, w: 12.1, h: 0.4, fontSize: 12, color: C.mute, italic: true });
      } else if (s.layout === "chart") {
        if (s.labels.length) sl.addChart(pptx.ChartType.bar, s.series.map((x) => ({ name: x.name, labels: s.labels, values: x.values })), {
          x: 0.6, y: 1.5, w: 12.1, h: bottom - 2.0, barDir: "col", barGrouping: "clustered", chartColors: [C.s1, C.s2], showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: C.ink,
          catAxisLabelColor: C.mute, valAxisLabelColor: C.mute, catAxisLabelFontSize: 11, valGridLine: { color: C.line, size: 0.5 }, showValue: false,
        });
        if (s.caption) sl.addText(s.caption, { x: 0.6, y: bottom - 0.45, w: 12.1, h: 0.4, fontSize: 12, color: C.mute, italic: true });
      }
    }
  });
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

export async function toPdf(slides: Slide[], deckTitle: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, info: { Title: deckTitle, Author: "SpaceIT Labs" }, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const W = 841.89, H = 595.28, M = 48, CW = W - M * 2;
  const hex = (h: string) => "#" + h;

  slides.forEach((s, i) => {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    if (s.layout === "title") {
      doc.rect(0, 0, 22, H).fill(hex(C.accent));
      doc.fillColor(hex(C.ink)).font("Helvetica-Bold").fontSize(34).text(s.title, 70, 170, { width: W - 140 });
      doc.fillColor(hex(C.accent)).font("Helvetica").fontSize(16).text(s.subtitle, 70, doc.y + 12, { width: W - 140 });
      doc.fillColor(hex(C.mute)).fontSize(12).text(s.meta.join("\n"), 70, doc.y + 18, { width: W - 140 });
      return;
    }
    doc.fillColor(hex(C.ink)).font("Helvetica-Bold").fontSize(22).text(s.title, M, 36, { width: CW });
    doc.rect(M, 70, 60, 3).fill(hex(C.accent));
    doc.fillColor(hex(C.mute)).font("Helvetica").fontSize(9).text(String(i + 1), W - M - 30, H - 28, { width: 30, align: "right" });
    let bottom = H - 44;
    if (s.note) {
      doc.roundedRect(M, H - 100, CW, 52, 4).fillAndStroke(hex(C.panel), hex(C.line));
      doc.fillColor(hex(C.ink)).font("Helvetica-Oblique").fontSize(11).text(s.note, M + 10, H - 92, { width: CW - 20, height: 40, ellipsis: true });
      bottom = H - 112;
    }
    if (s.layout === "kpis") {
      const n = s.kpis.length, gap = 12, w = (CW - gap * (n - 1)) / n;
      s.kpis.forEach((k, j) => {
        const x = M + j * (w + gap);
        doc.roundedRect(x, 92, w, 92, 6).fillAndStroke(hex(C.panel), hex(C.line));
        doc.fillColor(hex(C.mute)).font("Helvetica-Bold").fontSize(8).text(k.label.toUpperCase(), x + 10, 102, { width: w - 20 });
        doc.fillColor(hex(toneColor(k.tone))).font("Helvetica-Bold").fontSize(24).text(k.value, x + 10, 120, { width: w - 20 });
        if (k.sub) doc.fillColor(hex(C.mute)).font("Helvetica").fontSize(9).text(k.sub, x + 10, 154, { width: w - 20 });
      });
      doc.fillColor(hex(C.ink)).font("Helvetica").fontSize(13);
      let y = 210;
      for (const b of s.bullets) { doc.text("•  " + b, M, y, { width: CW, height: bottom - y }); y = doc.y + 6; if (y > bottom - 14) break; }
    } else if (s.layout === "bullets") {
      doc.fillColor(hex(C.ink)).font("Helvetica").fontSize(16);
      let y = 100;
      for (const b of s.bullets) { doc.text("•  " + b, M, y, { width: CW, height: bottom - y }); y = doc.y + 10; if (y > bottom - 16) break; }
    } else if (s.layout === "table") {
      const wide = s.columns.indexOf("Title") >= 0 ? s.columns.indexOf("Title") : s.columns.length >= 4 ? 0 : -1;
      const widths = s.columns.map((_, k) => (wide >= 0 ? (k === wide ? CW * 0.42 : (CW * 0.58) / (s.columns.length - 1)) : CW / s.columns.length));
      let y = 92; const rowH = 24;
      const drawRow = (cells: string[], head: boolean) => {
        if (head) doc.rect(M, y, CW, rowH).fill(hex(C.panel));
        let x = M;
        cells.forEach((c, k) => { doc.fillColor(hex(head ? C.mute : C.ink)).font(head ? "Helvetica-Bold" : "Helvetica").fontSize(head ? 9 : 10).text(c, x + 6, y + 7, { width: widths[k] - 10, height: rowH - 8, ellipsis: true, lineBreak: false }); x += widths[k]; });
        doc.moveTo(M, y + rowH).lineTo(M + CW, y + rowH).lineWidth(0.5).stroke(hex(C.line));
        y += rowH;
      };
      drawRow(s.columns, true);
      for (const r of s.rows) { if (y + rowH > bottom - 20) break; drawRow(r, false); }
      if (s.caption) doc.fillColor(hex(C.mute)).font("Helvetica-Oblique").fontSize(10).text(s.caption, M, Math.min(y + 10, bottom - 14), { width: CW });
    } else if (s.layout === "chart") {
      const top = 100, h = bottom - top - 50, left = M + 30, w = CW - 30;
      const max = Math.max(1, ...s.series.flatMap((x) => x.values));
      doc.moveTo(left, top + h).lineTo(left + w, top + h).lineWidth(0.5).stroke(hex(C.line));
      const groups = s.labels.length || 1, gw = w / groups, bw = Math.min(28, (gw * 0.7) / s.series.length);
      s.labels.forEach((l, g) => {
        s.series.forEach((ser, k) => {
          const v = ser.values[g] ?? 0, bh = (v / max) * h, x = left + g * gw + (gw - bw * s.series.length) / 2 + k * bw;
          doc.rect(x, top + h - bh, bw - 2, bh).fill(hex(k === 0 ? C.s1 : C.s2));
          if (v) doc.fillColor(hex(C.ink)).font("Helvetica").fontSize(8).text(String(v), x - 4, top + h - bh - 11, { width: bw + 6, align: "center" });
        });
        doc.fillColor(hex(C.mute)).font("Helvetica").fontSize(8).text(l, left + g * gw, top + h + 6, { width: gw, align: "center", height: 20, ellipsis: true });
      });
      s.series.forEach((ser, k) => { const lx = M + k * 150; doc.rect(lx, bottom - 18, 9, 9).fill(hex(k === 0 ? C.s1 : C.s2)); doc.fillColor(hex(C.ink)).fontSize(9).text(ser.name, lx + 14, bottom - 18, { width: 130 }); });
      if (s.caption) doc.fillColor(hex(C.mute)).font("Helvetica-Oblique").fontSize(10).text(s.caption, M + 320, bottom - 18, { width: CW - 320 });
    }
  });
  doc.end();
  return done;
}
