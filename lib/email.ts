import "server-only";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { fetchRetry } from "@/lib/http";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Sends the weekly report via Resend to every user who enabled the digest. */
export async function sendDigest(weekStart: string, content: any) {
  if (!env.resendKey || !env.digestFrom) return;
  const { data: subs } = await db().from("settings").select("digest_email").eq("email_digest", true);
  const to = (subs ?? []).map((s: any) => s.digest_email).filter(Boolean);
  if (!to.length) return;
  const src = new Map((content.sources ?? []).map((s: any) => [s.id, s]));
  const items = (content.ai?.top_papers ?? []).map((t: any) => {
    const s: any = src.get(t.id);
    return s ? `<li style="margin-bottom:12px"><a href="${esc(s.url ?? "#")}" style="color:#1e3a8a;font-weight:600">${esc(s.title)}</a><br><span style="color:#64748b;font-size:12px">${esc(s.meta)} · ${esc(s.design ?? "")}</span><br>${esc(t.takeaway ?? "")}</li>` : "";
  }).join("");
  const html = `<div style="font-family:Georgia,serif;max-width:640px"><h2 style="color:#1e3a8a">Weekly Neurosurgery Intelligence Report</h2><p style="color:#64748b">${esc(content.period.from)} → ${esc(content.period.to)}</p><p>${esc(content.ai?.headline ?? "")}</p><ol>${items}</ol></div>`;
  await fetchRetry("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.digestFrom, to, subject: `Neurosurgery Intelligence Report — week of ${weekStart}`, html }),
  });
}
