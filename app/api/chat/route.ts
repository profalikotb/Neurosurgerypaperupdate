import { requireApiUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { retrieve, answerStream, coverageLine } from "@/lib/ai/rag";
import { sanitizeCitations } from "@/lib/ai/verify";
import { hasLLM } from "@/lib/env";
import type { Msg } from "@/lib/llm";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** NDJSON stream: {type:"chat"|"status"|"sources"|"delta"|"done"|"error"} */
export async function POST(req: Request) {
  const u = await requireApiUser();
  if (u instanceof NextResponse) return u;
  if (!hasLLM()) return NextResponse.json({ error: "No AI provider configured." }, { status: 400 });
  const { chatId: cid, message, live } = await req.json();
  const q = String(message ?? "").trim();
  if (!q) return NextResponse.json({ error: "Empty question" }, { status: 400 });
  const sb = db();

  let chatId = Number(cid) || 0;
  if (!chatId) {
    const { data } = await sb.from("chats").insert({ user_id: u.id, title: q.slice(0, 90) }).select("id").single();
    chatId = data!.id;
  } else {
    const { data } = await sb.from("chats").select("id").eq("id", chatId).eq("user_id", u.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  const { data: hist } = await sb.from("chat_messages").select("role,content").eq("chat_id", chatId).order("created_at").limit(20);
  await sb.from("chat_messages").insert({ chat_id: chatId, role: "user", content: q });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        send({ type: "chat", chatId });
        send({ type: "status", text: "Retrieving evidence from your library and PubMed…" });
        const r = await retrieve(q, { live: live === false ? false : undefined });
        const sources = r.sources.map((s) => ({ ...s, text: undefined }));
        const coverage = coverageLine(r);
        send({ type: "sources", sources, coverage, pubmedQuery: r.pubmedQuery });
        let full = "";
        for await (const d of answerStream(q, (hist ?? []) as Msg[], r)) { full += d; send({ type: "delta", text: d }); }
        const { text, removed } = sanitizeCitations(full, new Set(r.sources.map((s) => s.id)));
        const { data: m } = await sb.from("chat_messages").insert({ chat_id: chatId, role: "assistant", content: text, sources, meta: { coverage, removed, pubmedQuery: r.pubmedQuery } }).select("id").single();
        send({ type: "done", messageId: m?.id, removed, text: removed.length ? text : undefined });
      } catch (e: any) {
        send({ type: "error", error: e?.message ?? "Failed" });
      } finally { ctrl.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
