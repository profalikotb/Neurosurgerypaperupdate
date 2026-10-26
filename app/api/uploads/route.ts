import { withUser, ok, bad } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

/** Step 1: register the document and return a signed upload URL (browser uploads directly to private storage). */
export const POST = withUser(async (req, u) => {
  const b = await req.json();
  const kind = b.kind === "paper_fulltext" ? "paper_fulltext" : b.kind === "other" ? "other" : "textbook";
  if (!b.filename || !/\.pdf$/i.test(b.filename)) return bad("Only PDF files are supported.");
  if (b.size && b.size > 50 * 1024 * 1024) return bad("File exceeds 50 MB (Supabase storage limit). Index large textbooks locally with scripts/index-books.mjs.");
  const sb = db();
  let title = b.title?.trim() || b.filename.replace(/\.pdf$/i, "");
  if (kind === "paper_fulltext") {
    const { data: p } = await sb.from("papers").select("title").eq("id", b.paperId).single();
    if (!p) return bad("Paper not found");
    title = p.title;
  }
  const { data: doc, error } = await sb.from("documents").insert({
    owner: u.id, kind, title, authors: b.authors ?? null, edition: b.edition ?? null, year: b.year ? Number(b.year) : null,
    publisher: b.publisher ?? null, isbn: b.isbn ?? null, subspecialty: b.subspecialty ?? null, paper_id: b.paperId ?? null, source_file: b.filename,
  }).select("id").single();
  if (error) return bad(error.message, 500);
  const path = `${u.id}/${doc.id}-${b.filename.replace(/[^\w.\-]+/g, "_")}`;
  const { data: signed, error: e2 } = await sb.storage.from("uploads").createSignedUploadUrl(path);
  if (e2) return bad(e2.message, 500);
  await sb.from("documents").update({ storage_path: path }).eq("id", doc.id);
  return ok({ documentId: doc.id, path, token: signed.token });
});
