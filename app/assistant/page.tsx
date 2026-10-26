import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { ChatUI } from "@/components/client/chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const sb = db();
  const { data: chats } = await sb.from("chats").select("id,title,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  const cid = Number(sp.c) || 0;
  const { data: msgs } = cid ? await sb.from("chat_messages").select("id,role,content,sources,meta").eq("chat_id", cid).order("created_at") : { data: [] as any[] };
  return <ChatUI key={cid || "new"} chats={chats ?? []} chatId={cid} initial={msgs ?? []} autoAsk={sp.q} />;
}
