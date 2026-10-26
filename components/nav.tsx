"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Newspaper, Search, MessageSquareText, BookOpenCheck, Library, LayoutList, CalendarRange, Settings, Moon, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/search", label: "Search", icon: Search },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
  { href: "/topics", label: "Topics", icon: LayoutList },
  { href: "/revision", label: "Revision", icon: BookOpenCheck },
  { href: "/library", label: "Library", icon: Library },
  { href: "/weekly", label: "Weekly", icon: CalendarRange },
];
const MOBILE = ["/", "/search", "/assistant", "/revision", "/library"];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  if (path === "/login" || path === "/setup") return null;
  const active = (h: string) => (h === "/" ? path === "/" : path?.startsWith(h));
  const toggle = () => {
    const d = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", d ? "dark" : "light"); } catch {}
  };
  return (
    <>
      <header className="site no-print sticky top-0 z-30 border-b rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-serif text-[19px] font-bold tracking-tight text-navy">Neurosurgery Update</span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[.16em] text-muted lg:inline">Prof. Ali Kotb</span>
          </Link>
          <nav className="ml-3 hidden items-center gap-0.5 md:flex">
            {ITEMS.slice(1).map((it) => (
              <Link key={it.href} href={it.href} className={cn("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-navy-soft", active(it.href) && "bg-navy-soft text-navy")}>{it.label}</Link>
            ))}
          </nav>
          <form className="ml-auto hidden w-64 lg:block" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <input className="input h-9 py-1 text-sm" placeholder="Search papers, PMID, DOI…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="ml-auto flex items-center gap-1 lg:ml-1">
            <Link href="/topics" className="rounded-lg p-2 text-ink-2 hover:bg-navy-soft md:hidden" aria-label="Topics"><LayoutList size={18} /></Link>
            <Link href="/weekly" className="rounded-lg p-2 text-ink-2 hover:bg-navy-soft md:hidden" aria-label="Weekly"><CalendarRange size={18} /></Link>
            <button onClick={toggle} className="rounded-lg p-2 text-ink-2 hover:bg-navy-soft" aria-label="Toggle dark mode"><Moon size={18} className="dark:hidden" /><Sun size={18} className="hidden dark:block" /></button>
            <Link href="/settings" className={cn("rounded-lg p-2 text-ink-2 hover:bg-navy-soft", active("/settings") && "text-navy")} aria-label="Settings"><Settings size={18} /></Link>
          </div>
        </div>
      </header>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t rule bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {ITEMS.filter((i) => MOBILE.includes(i.href)).map((it) => (
            <Link key={it.href} href={it.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted", active(it.href) && "text-navy")}>
              <it.icon size={20} strokeWidth={active(it.href) ? 2.2 : 1.7} />{it.label.split(" ")[0]}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
