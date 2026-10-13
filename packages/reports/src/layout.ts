import PDFDocument from "pdfkit";
import fonts from "@fudo/report-fonts";
import type { ReportLang } from "./lang.js";

export const C = { ink: "#16181d", muted: "#5f5d56", line: "#e2dfd6", band: "#1b1d22", up: "#135c43", down: "#9a1c12", warn: "#7a4b06", soft: "#f4f3ef", brand: "#d42a3c" };

export type Align = "start" | "end" | "center";
export interface Col { title: string; width: number; align?: Align; color?: (row: string[], i: number) => string | undefined }

/* ---------- right-to-left layout ----------
 * pdfkit shapes Arabic words correctly but lays lines out left to right. For right-to-left
 * languages every word is drawn on its own, in visual order: direction runs follow the Unicode
 * bidirectional rules at word level (Latin names and numbers keep their order inside a run).   */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const STRONG_LTR = /[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;
/** A number ("2026", "99.41%", "08:00–18:00"): weak in the bidi rules, it never joins a Latin run. */
const NUMBER = /^[+\-]?\d[\d.,:%\-–/]*%?$/;
export function visualOrder(words: string[]): string[] {
  // R = Arabic, L = Latin/Greek/Cyrillic words, EN = numbers, N = punctuation
  const dir = words.map((w) => (RTL.test(w) ? "R" : NUMBER.test(w) ? "EN" : STRONG_LTR.test(w) ? "L" : "N"));
  // (bidi rule W7) a number after Latin text belongs to it: "Port 3000 open"
  for (let i = 0, last = "R"; i < dir.length; i++) {
    if (dir[i] === "L" || dir[i] === "R") last = dir[i]!;
    else if (dir[i] === "EN" && last === "L") dir[i] = "L";
  }
  // neutrals become L only between two Latin words; numbers count as right-to-left context here
  const strong = (i: number, step: number) => { for (let j = i + step; j >= 0 && j < dir.length; j += step) if (dir[j] !== "N") return dir[j]; return "R"; };
  const resolved = dir.map((d, i) => (d !== "N" ? d : strong(i, -1) === "L" && strong(i, 1) === "L" ? "L" : "R"));
  const runs: Array<{ d: string; w: string[] }> = [];
  resolved.forEach((d, i) => { const last = runs[runs.length - 1]; if (last && last.d === d) last.w.push(words[i]!); else runs.push({ d, w: [words[i]!] }); });
  // runs flow right to left; inside a run, Latin words and numbers keep their order
  return runs.reverse().flatMap((r) => (r.d === "R" ? [...r.w].reverse() : r.w));
}

/**
 * A PDF in the report style (A4, header band, tables, page footers) in a report language,
 * right to left included. Used by availability reports and post-incident reports.
 */
export function createPdf(L: ReportLang, docTitle: string) {
  const t = L.t, rtl = L.dir === "rtl";
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 50, left: 40, right: 40 }, bufferPages: true, info: { Title: docTitle, Author: "Fudo" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("r", fonts.regular);
  doc.registerFont("b", fonts.bold);
  const W = doc.page.width - 80, X = 40;
  const bottom = () => doc.page.height - 50;
  const num = (v: number, digits: number) => new Intl.NumberFormat(L.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(v);
  const fmtPct = (v: number | null) => (v === null ? "—" : `${v >= 99.995 ? num(100, 0) : num(v, 2)}%`);
  const fmtMin = (m: number | null) => (m === null ? "—" : m < 120 ? t("unit.min", { n: m }) : m < 2880 ? t("unit.h", { n: Math.round(m / 6) / 10 }) : t("unit.d", { n: Math.round(m / 144) / 10 }));
  const pdfAlign = (a: Align = "start") => (a === "center" ? "center" : (a === "start") !== rtl ? "left" : "right");

  /** Wraps a right-to-left paragraph into lines of words, in reading order. */
  const rtlLines = (text: string, width: number) => {
    const out: string[][] = [];
    for (const para of text.split("\n")) {
      let line: string[] = [];
      for (const w of para.split(/\s+/).filter(Boolean)) {
        if (line.length && doc.widthOfString([...line, w].join(" ")) > width) { out.push(line); line = []; }
        line.push(w);
      }
      out.push(line);
    }
    return out;
  };
  /** Height of a text block at the current font. */
  const heightOf = (text: string, width: number) =>
    rtl ? rtlLines(text, width).length * doc.currentLineHeight(true) : doc.heightOfString(text, { width });
  /** Draws text; `align` is logical (start = left in LTR, right in RTL). */
  const text = (s: string, x: number, y: number, o: { width: number; align?: Align; lineBreak?: boolean }) => {
    if (!rtl) { doc.text(s, x, y, { width: o.width, align: pdfAlign(o.align), lineBreak: o.lineBreak }); return; }
    const lh = doc.currentLineHeight(true), space = doc.widthOfString(" ");
    rtlLines(s, o.width).forEach((line, li) => {
      const words = visualOrder(line);
      const total = words.reduce((a, w) => a + doc.widthOfString(w), 0) + space * Math.max(0, words.length - 1);
      const a = pdfAlign(o.align);
      let cx = a === "left" ? x : a === "center" ? x + (o.width - total) / 2 : x + o.width - total;
      for (const w of words) { doc.text(w, cx, y + li * lh, { lineBreak: false }); cx += doc.widthOfString(w) + space; }
    });
    doc.x = x;
    doc.y = y + heightOf(s, o.width);
  };

  const heading = (h: string) => {
    if (doc.y > bottom() - 60) doc.addPage();
    doc.fill(C.ink).font("b").fontSize(12); text(h, X, doc.y, { width: W });
    doc.moveDown(0.35);
  };
  const table = (colsIn: Col[], rowsIn: string[][]) => {
    // right-to-left: the first column is on the right
    const order = colsIn.map((_, i) => (rtl ? colsIn.length - 1 - i : i));
    const cols = order.map((i) => colsIn[i]!);
    const rows = rowsIn.map((r) => ({ cells: order.map((i) => r[i] ?? ""), raw: r }));
    const total = cols.reduce((a, c) => a + c.width, 0);
    const ws = cols.map((c) => (c.width / total) * W);
    const header = () => {
      doc.font("b").fontSize(7.5);
      const hh = Math.max(18, ...cols.map((c, i) => heightOf(c.title, ws[i]! - 8) + 9));
      if (doc.y + hh + 16 > bottom()) doc.addPage();
      const y = doc.y;
      doc.rect(X, y, W, hh).fill(C.band);
      let x = X;
      cols.forEach((c, i) => { doc.fill("#ffffff").font("b").fontSize(7.5); text(c.title, x + 4, y + 5, { width: ws[i]! - 8, align: c.align }); x += ws[i]!; });
      doc.y = y + hh;
    };
    const titled = cols.some((c) => c.title); // fact tables have no header band
    if (titled) header();
    rows.forEach(({ cells, raw }, ri) => {
      doc.font("r").fontSize(8.5);
      const h = Math.max(16, ...cells.map((v, i) => heightOf(v || "—", ws[i]! - 8) + 8));
      if (doc.y + h > bottom()) { doc.addPage(); if (titled) header(); }
      const y = doc.y;
      if (ri % 2 === 1) doc.rect(X, y, W, h).fill("#faf9f6");
      let x = X;
      cells.forEach((v, i) => { doc.fill(cols[i]!.color?.(raw, i) ?? C.ink).font("r").fontSize(8.5); text(v || "—", x + 4, y + 4, { width: ws[i]! - 8, align: cols[i]!.align }); x += ws[i]!; });
      doc.moveTo(X, y + h).lineTo(X + W, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = y + h;
    });
    if (!rows.length) { doc.fill(C.muted).font("r").fontSize(9); text(t("report.nothing"), X, doc.y + 6, { width: W }); }
    doc.moveDown(1);
  };

  /** Header band with the logo on the reading-start side. */
  const header = (title: string, subtitle: string) => {
    doc.rect(0, 0, doc.page.width, 92).fill(C.band);
    const tx = rtl ? X : X + 58, tw = W - 58;
    doc.image(fonts.mark, rtl ? X + W - 44 : X, 22, { width: 44 });
    doc.fill("#ffffff").font("b").fontSize(18);
    text(title, tx, 24, { width: tw });
    doc.fill("#c9c7bf").font("r").fontSize(10);
    text(subtitle, tx, 50, { width: tw });
    doc.y = 110;
  };
  /** Page footers ("generated … · page n of m"), then the finished PDF. */
  const finish = (generated: string): Promise<Buffer> => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fill(C.muted).font("r").fontSize(7.5);
      text(t("report.footer", { date: generated, page: i + 1, pages: range.count }), X, doc.page.height - 32, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
    return done;
  };
  return { doc, t, rtl, W, X, bottom, num, fmtPct, fmtMin, text, heightOf, heading, table, header, finish };
}
