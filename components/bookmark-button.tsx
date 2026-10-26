"use client";
import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";

export function BookmarkButton({ id, initial, withLabel }: { id: number; initial?: boolean; withLabel?: boolean }) {
  const [on, setOn] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} aria-pressed={on} aria-label={on ? "Remove bookmark" : "Bookmark"}
      onClick={async (e) => { e.preventDefault(); setBusy(true); setOn(!on); const r = await fetch(`/api/papers/${id}/bookmark`, { method: "POST" }); if (r.ok) setOn((await r.json()).bookmarked); else setOn(on); setBusy(false); }}
      className={cn("inline-flex items-center gap-1 rounded-lg p-1.5 text-[13px] text-muted hover:bg-navy-soft hover:text-navy", on && "text-navy")}>
      {on ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{withLabel && (on ? "Saved" : "Save")}
    </button>
  );
}
