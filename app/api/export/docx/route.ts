import { withUser, bad } from "@/lib/api";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

const AR = /[؀-ۿ]/;

function runs(line: string, rtl: boolean): TextRun[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => p.startsWith("**") ? new TextRun({ text: p.slice(2, -2), bold: true, rightToLeft: rtl }) : new TextRun({ text: p, rightToLeft: rtl }));
}

/** Markdown (headings, bullets, numbered, bold) → .docx. Arabic paragraphs are set RTL. */
export const POST = withUser(async (req) => {
  const { title, markdown } = await req.json();
  if (!markdown) return bad("Nothing to export");
  const children: Paragraph[] = [new Paragraph({ text: title ?? "Export", heading: HeadingLevel.TITLE })];
  for (const raw of String(markdown).split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const rtl = AR.test(line);
    const base = { bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT };
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { children.push(new Paragraph({ ...base, heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][h[1].length - 1], children: runs(h[2], rtl) })); continue; }
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    if (b) { children.push(new Paragraph({ ...base, bullet: { level: line.search(/\S/) >= 2 ? 1 : 0 }, children: runs(b[1], rtl) })); continue; }
    const n = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (n) { children.push(new Paragraph({ ...base, children: [new TextRun({ text: `${n[1]}. `, bold: true }), ...runs(n[2], rtl)] })); continue; }
    children.push(new Paragraph({ ...base, children: runs(line, rtl), spacing: { after: 120 } }));
  }
  const doc = new Document({ styles: { default: { document: { run: { font: "Calibri", size: 22 } } } }, sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  const name = String(title ?? "export").replace(/[^\w\- ]+/g, "").slice(0, 80) || "export";
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"` } });
});
