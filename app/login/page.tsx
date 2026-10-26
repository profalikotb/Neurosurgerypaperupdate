"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="mx-auto mt-[12vh] max-w-sm">
      <div className="text-center">
        <div className="font-serif text-3xl font-bold text-navy">Neurosurgery Update</div>
        <div className="kicker mt-1">Prof. Ali Kotb — Knowledge & Literature Update</div>
        <p className="mt-3 text-[13.5px] text-muted">Your Intelligent Neurosurgical Library, Research Updates & Revision Assistant.</p>
      </div>
      <form className="card mt-8 space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
        setBusy(false);
        if (error) setErr(error.message); else { router.push("/"); router.refresh(); }
      }}>
        <input className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <p className="text-[13px] text-bad">{err}</p>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Sign in</Button>
      </form>
      <p className="mt-4 text-center text-[11.5px] text-muted">Private academic workspace. Access restricted to authorised accounts.</p>
    </div>
  );
}
