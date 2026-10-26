#!/usr/bin/env node
// Local textbook indexer — runs on YOUR PC. Extracts text from licensed PDFs locally and uploads
// only text passages (+ embeddings) to Supabase. The PDF itself never leaves your computer.
//
// Usage (Windows PowerShell / cmd, inside the project folder):
//   npm install
//   copy .env.example .env.local   (fill Supabase + embedding keys)
//   npm run index-books -- "E:\Neurosurgical Books"
//
// Optional metadata: put books.json in the folder:
//   { "Youmans 8e.pdf": { "title": "Youmans and Winn Neurological Surgery", "edition": "8th", "year": 2022,
//                          "authors": "Winn HR", "publisher": "Elsevier", "isbn": "9780323661928", "subspecialty": "Skull base" } }
// Re-running is safe: already-indexed files (same name + size) are skipped. Use --force to re-index.

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = process.argv.slice(2);
const force = args.includes("--force");
const folder = args.find((a) => !a.startsWith("--"));
if (!folder || !fs.existsSync(folder)) { console.error('Usage: npm run index-books -- "E:\\Neurosurgical Books" [--force]'); process.exit(1); }

const { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env;
if (!URL_ || !KEY) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const EMB = { base: (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""), key: process.env.EMBEDDING_API_KEY, model: process.env.EMBEDDING_MODEL || "text-embedding-3-small", dims: Number(process.env.EMBEDDING_DIMENSIONS || 512) };
if (!EMB.key) console.warn("⚠ EMBEDDING_API_KEY not set — indexing keyword search only.");

const meta = fs.existsSync(path.join(folder, "books.json")) ? JSON.parse(fs.readFileSync(path.join(folder, "books.json"), "utf8")) : {};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.pdf$/i.test(e.name) ? [path.join(d, e.name)] : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embed(texts) {
  if (!EMB.key) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${EMB.base}/embeddings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMB.key}` }, body: JSON.stringify({ model: EMB.model, input: texts.map((t) => t.slice(0, 8000)), dimensions: EMB.dims }) });
    if (r.ok) return (await r.json()).data.map((d) => d.embedding);
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`Embedding error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error("Embedding failed after retries");
}

function chunk(pages, target = 1400, overlap = 150) {
  const out = [];
  for (const p of pages) {
    const paras = p.text.split(/\n{2,}/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    let buf = "";
    const flush = () => { if (buf.trim().length > 80) out.push({ ...p, text: buf.trim() }); buf = buf.length > overlap ? buf.slice(-overlap) : ""; };
    for (const para of paras) {
      if ((buf + " " + para).length > target && buf.length > 200) flush();
      buf += (buf ? " " : "") + para;
      while (buf.length > target * 1.5) { const head = buf.slice(0, target); out.push({ ...p, text: head }); buf = buf.slice(target - overlap); }
    }
    if (buf.trim().length > 80) out.push({ ...p, text: buf.trim() });
  }
  return out;
}

async function outlineOf(pdf) {
  const res = [];
  try {
    for (const it of (await pdf.getOutline()) ?? []) {
      try {
        let dest = it.dest; if (typeof dest === "string") dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) res.push({ title: String(it.title).trim(), page: (typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0])) + 1 });
      } catch {}
    }
  } catch {}
  return res.sort((a, b) => a.page - b.page);
}

async function pageText(pdf, i) {
  const page = await pdf.getPage(i);
  const tc = await page.getTextContent();
  let t = "", lastY = null;
  for (const it of tc.items) {
    if (typeof it.str !== "string") continue;
    const y = it.transform?.[5] ?? 0, h = it.height || 10;
    if (lastY !== null && Math.abs(y - lastY) > h * 1.9) t += "\n\n"; else if (lastY !== null && Math.abs(y - lastY) > 1) t += "\n";
    t += it.str; if (it.hasEOL) t += "\n"; lastY = y;
  }
  page.cleanup();
  return t.replace(/[ \t]+/g, " ").replace(/-\n(\w)/g, "$1").trim();
}

const files = walk(folder);
console.log(`Found ${files.length} PDF(s) in ${folder}`);
for (const file of files) {
  const name = path.basename(file), size = fs.statSync(file).size, key = `${name}|${size}`;
  const { data: existing } = await sb.from("documents").select("id,status").eq("source_file", key).maybeSingle();
  if (existing && existing.status === "ready" && !force) { console.log(`✓ skip ${name}`); continue; }
  if (existing) await sb.from("documents").delete().eq("id", existing.id);
  const m = meta[name] ?? {};
  try {
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    let labels = null; try { labels = await pdf.getPageLabels(); } catch {}
    const outline = await outlineOf(pdf);
    const { data: doc, error } = await sb.from("documents").insert({ kind: "textbook", title: m.title ?? name.replace(/\.pdf$/i, ""), authors: m.authors ?? null, edition: m.edition ?? null, year: m.year ?? null, publisher: m.publisher ?? null, isbn: m.isbn ?? null, subspecialty: m.subspecialty ?? null, source_file: key, status: "processing", pages_total: pdf.numPages, chapters: outline }).select("id").single();
    if (error) throw error;
    const chapterAt = (i) => { let c = null; for (const o of outline) if (o.page <= i) c = o.title; return c; };
    let ord = 0;
    for (let start = 1; start <= pdf.numPages; start += 25) {
      const pages = [];
      for (let i = start; i < Math.min(start + 25, pdf.numPages + 1); i++) {
        const text = await pageText(pdf, i);
        if (text.length > 50) pages.push({ text, page_label: labels?.[i - 1] ?? String(i), page_index: i, chapter: chapterAt(i) });
      }
      const chunks = chunk(pages);
      const embs = chunks.length ? await embed(chunks.map((c) => `${c.chapter ? c.chapter + ": " : ""}${c.text}`)) : null;
      const rows = chunks.map((c, j) => ({ document_id: doc.id, chapter: c.chapter, page_label: c.page_label, page_index: c.page_index, ord: ord++, text: c.text, embedding: embs ? `[${embs[j].join(",")}]` : null }));
      for (let k = 0; k < rows.length; k += 100) { const { error: e } = await sb.from("chunks").insert(rows.slice(k, k + 100)); if (e) throw e; }
      const done = Math.min(start + 24, pdf.numPages);
      await sb.from("documents").update({ pages_done: done }).eq("id", doc.id);
      process.stdout.write(`\r  ${name}: ${done}/${pdf.numPages} pages`);
    }
    await sb.from("documents").update({ status: "ready" }).eq("id", doc.id);
    console.log(`\n✓ ${name} indexed (${ord} passages)${pdf.numPages && ord < pdf.numPages / 4 ? " — very little text: this PDF may be scanned images (OCR it first)" : ""}`);
  } catch (e) {
    console.error(`\n✗ ${name}: ${e.message ?? e}`);
  }
}
console.log("Done.");
