// Builds printable PDF files in the browser with jsPDF.
// exportCookbook(): cover page, table of contents, then one recipe per page.
// exportRecipe(): a single recipe.

import { parseBlocks, paragraphs, CATEGORIES } from "./text.js";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const M = 54; // margin
const TOP = M + 18;
const BOTTOM = PAGE_H - M - 10;
const TEXT_W = PAGE_W - M * 2;

const INK = [33, 37, 41];
const MUTED = [96, 104, 112];
const COBALT = [31, 78, 140];
const RED = [192, 57, 43];
const RULE = [157, 180, 211];

// Characters the embedded fonts don't include.
const SUBS = { "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5", "♦": "•", "​": "", "️": "" };
const clean = (s) => (s || "").replace(/[⅓⅔⅛⅜⅝⅞⅕♦​️]/g, (c) => SUBS[c]).replace(/[\u{1F000}-\u{1FFFF}]/gu, "");

let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const files = {
    body: "PTSans-Regular.ttf",
    bodyBold: "PTSans-Bold.ttf",
    bodyItalic: "PTSans-Italic.ttf",
    head: "ZillaSlab-Bold.ttf",
    headSemi: "ZillaSlab-SemiBold.ttf",
  };
  const out = {};
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => {
      const buf = await (await fetch(`/fonts/${file}`)).arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      out[key] = { file, data: btoa(bin) };
    })
  );
  fontCache = out;
  return out;
}

async function newDoc() {
  const { jsPDF } = await import("jspdf");
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const reg = (key, family, style) => {
    doc.addFileToVFS(fonts[key].file, fonts[key].data);
    doc.addFont(fonts[key].file, family, style);
  };
  reg("body", "PTSans", "normal");
  reg("bodyBold", "PTSans", "bold");
  reg("bodyItalic", "PTSans", "italic");
  reg("head", "Zilla", "bold");
  reg("headSemi", "ZillaSemi", "normal");
  return doc;
}

function set(doc, family, style, size, color = INK) {
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function runningHeader(doc, recipe, continued) {
  set(doc, "PTSans", "normal", 8.5, MUTED);
  doc.text("Deakin Family Recipes", M, M);
  doc.text(continued ? `${clean(recipe.title)} (continued)` : recipe.category, PAGE_W - M, M, { align: "right" });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(M, M + 6, PAGE_W - M, M + 6);
}

// Draws one recipe starting on the current page. Returns nothing; adds pages as needed.
function drawRecipe(doc, r) {
  let y = TOP + 14;
  runningHeader(doc, r, false);

  const ensure = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      runningHeader(doc, r, true);
      y = TOP + 10;
    }
  };

  // Title
  set(doc, "Zilla", "bold", 24);
  const titleLines = doc.splitTextToSize(clean(r.title), TEXT_W);
  titleLines.forEach((l) => { doc.text(l, M, y + 18); y += 27; });

  // Meta
  set(doc, "PTSans", "italic", 10.5, MUTED);
  const meta = [`From ${clean(r.contributorName) || "the family"}`];
  if (r.prep) meta.push(`Prep/cook time: ${clean(r.prep)}`);
  doc.text(meta.join("     "), M, y + 6);
  y += 16;
  doc.setDrawColor(...RED);
  doc.setLineWidth(1.4);
  doc.line(M, y, PAGE_W - M, y);
  y += 22;

  const sectionHead = (label) => {
    ensure(40);
    set(doc, "ZillaSemi", "normal", 13.5, COBALT);
    doc.text(label, M, y);
    y += 16;
  };

  const LEAD = 14.2;
  const listBlock = (blocks, numbered) => {
    let n = 0;
    blocks.forEach((b) => {
      if (b.type === "head") {
        n = 0;
        ensure(LEAD * 3);
        y += 3;
        set(doc, "PTSans", "bold", 10.5);
        doc.text(clean(b.text), M, y);
        y += LEAD;
        return;
      }
      n += 1;
      const indent = numbered ? 22 : 14;
      set(doc, "PTSans", "normal", 10.5);
      const lines = doc.splitTextToSize(clean(b.text), TEXT_W - indent);
      ensure(LEAD * Math.min(lines.length, 2));
      if (numbered) {
        set(doc, "PTSans", "bold", 10.5, COBALT);
        doc.text(`${n}.`, M, y);
        set(doc, "PTSans", "normal", 10.5);
      } else {
        set(doc, "PTSans", "normal", 10.5, COBALT);
        doc.text("•", M + 2, y);
        set(doc, "PTSans", "normal", 10.5);
      }
      lines.forEach((l, i) => {
        if (i > 0) ensure(LEAD);
        doc.text(l, M + indent, y);
        y += LEAD;
      });
      if (numbered) y += 4;
    });
  };

  const ing = parseBlocks(r.ingredients);
  if (ing.length) {
    sectionHead("Ingredients");
    listBlock(ing, false);
    y += 12;
  }
  const dir = parseBlocks(r.directions);
  if (dir.length) {
    sectionHead("Directions");
    listBlock(dir, true);
    y += 10;
  }
  const notes = paragraphs(r.notes);
  if (notes.length) {
    sectionHead("Notes");
    set(doc, "PTSans", "normal", 10.5);
    notes.forEach((p) => {
      p.split("\n").forEach((line) => {
        const lines = doc.splitTextToSize(clean(line.trim()), TEXT_W - 12);
        lines.forEach((l) => {
          ensure(LEAD);
          doc.setDrawColor(...RULE);
          doc.setLineWidth(2);
          doc.line(M + 1, y - 10, M + 1, y + 4);
          set(doc, "PTSans", "normal", 10.5);
          doc.text(l, M + 12, y);
          y += LEAD;
        });
      });
      y += 6;
    });
  }
}

function footers(doc, startPage) {
  const total = doc.getNumberOfPages();
  for (let p = startPage; p <= total; p++) {
    doc.setPage(p);
    set(doc, "PTSans", "normal", 8.5, MUTED);
    doc.text(String(p), PAGE_W / 2, PAGE_H - M + 16, { align: "center" });
  }
}

function sortForBook(recipes) {
  const order = (c) => { const i = CATEGORIES.indexOf(c); return i === -1 ? 99 : i; };
  return [...recipes].sort((a, b) => order(a.category) - order(b.category) || a.title.localeCompare(b.title));
}

// Lays out the table of contents. With dry=true it only counts pages.
function drawToc(doc, entries, firstPage, dry) {
  let page = 0;
  let y = 0;
  const start = () => {
    if (!dry) doc.setPage(firstPage + page);
    y = TOP + (page === 0 ? 40 : 10);
    if (!dry && page === 0) {
      set(doc, "Zilla", "bold", 22);
      doc.text("Contents", M, TOP + 16);
    }
  };
  start();
  const next = (h) => {
    if (y + h > BOTTOM) { page += 1; start(); }
  };
  let lastCat = null;
  entries.forEach((e) => {
    if (e.category !== lastCat) {
      next(40);
      y += lastCat ? 10 : 0;
      if (!dry) {
        set(doc, "ZillaSemi", "normal", 13, COBALT);
        doc.text(e.category, M, y);
      }
      y += 17;
      lastCat = e.category;
    }
    next(15);
    if (!dry) {
      set(doc, "PTSans", "normal", 10.5);
      const title = doc.splitTextToSize(clean(e.title), TEXT_W - 70)[0];
      doc.text(title, M + 10, y);
      const tw = doc.getTextWidth(title);
      const num = String(e.page);
      const nw = doc.getTextWidth(num);
      set(doc, "PTSans", "normal", 10.5, RULE);
      const dotStart = M + 10 + tw + 6;
      const dotEnd = PAGE_W - M - nw - 6;
      if (dotEnd > dotStart) {
        const dots = ".".repeat(Math.max(0, Math.floor((dotEnd - dotStart) / doc.getTextWidth("."))));
        doc.text(dots, dotEnd, y, { align: "right" });
      }
      set(doc, "PTSans", "normal", 10.5);
      doc.text(num, PAGE_W - M, y, { align: "right" });
      doc.link(M, y - 11, TEXT_W, 15, { pageNumber: e.page });
    }
    y += 15;
  });
  return page + 1;
}

function fileSafe(s) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function exportCookbook(recipes, { label = "The complete collection" } = {}) {
  const doc = await newDoc();
  const list = sortForBook(recipes);

  // Cover
  set(doc, "Zilla", "bold", 44);
  doc.text("Deakin Family", M, 240);
  doc.text("Recipes", M, 290);
  doc.setDrawColor(...RED);
  doc.setLineWidth(2);
  doc.line(M, 312, PAGE_W - M, 312);
  set(doc, "PTSans", "normal", 13, MUTED);
  doc.text(label, M, 340);
  doc.text(`${list.length} recipe${list.length === 1 ? "" : "s"}`, M, 360);
  const printed = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  set(doc, "PTSans", "normal", 10, MUTED);
  doc.text(`Printed ${printed}`, M, PAGE_H - M);

  // Reserve pages for the contents, then draw recipes and record their pages.
  const tocPages = drawToc(doc, list.map((r) => ({ ...r, page: 999 })), 2, true);
  for (let i = 0; i < tocPages; i++) doc.addPage();
  const entries = [];
  list.forEach((r) => {
    doc.addPage();
    entries.push({ title: r.title, category: r.category, page: doc.getNumberOfPages() });
    drawRecipe(doc, r);
  });
  drawToc(doc, entries, 2, false);
  footers(doc, 2);

  doc.setProperties({ title: "Deakin Family Recipes" });
  doc.save(`Deakin-Family-Recipes${label === "The complete collection" ? "" : "-" + fileSafe(label)}.pdf`);
}

export async function exportRecipe(recipe) {
  const doc = await newDoc();
  drawRecipe(doc, recipe);
  if (doc.getNumberOfPages() > 1) footers(doc, 1);
  doc.setProperties({ title: recipe.title });
  doc.save(`${fileSafe(recipe.title)}.pdf`);
}
