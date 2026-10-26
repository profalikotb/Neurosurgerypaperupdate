import { withUser, ok, bad } from "@/lib/api";
import { db } from "@/lib/supabase/admin";
import { esearch, journalClause } from "@/lib/sources/pubmed";

export const POST = withUser(async (req) => {
  const b = await req.json();
  if (!b.name || !b.nlm_abbr) return bad("Name and PubMed abbreviation required");
  const { count } = await esearch(journalClause(b.nlm_abbr), { retmax: 0 });
  if (!count) return bad(`PubMed returns no articles for "${b.nlm_abbr}"[ta]. Use the exact NLM abbreviation (see the NLM Catalog).`);
  const { error } = await db().from("journals").insert({ name: b.name, nlm_abbr: b.nlm_abbr, tier: b.tier === "core" ? "core" : "additional", neuro_filter: Boolean(b.neuro_filter), priority: Number(b.priority ?? 5) });
  if (error) return bad(error.message);
  return ok({ pubmedCount: count });
});

export const PATCH = withUser(async (req) => {
  const b = await req.json();
  const upd: Record<string, unknown> = {};
  for (const k of ["enabled", "neuro_filter"]) if (typeof b[k] === "boolean") upd[k] = b[k];
  if (b.priority !== undefined) upd.priority = Math.max(0, Math.min(10, Number(b.priority)));
  if (b.tier) upd.tier = b.tier === "core" ? "core" : "additional";
  await db().from("journals").update(upd).eq("id", b.id);
  return ok();
});

export const DELETE = withUser(async (req) => {
  const { id } = await req.json();
  await db().from("journals").delete().eq("id", id);
  return ok();
});
