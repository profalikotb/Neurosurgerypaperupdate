"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { UploadPdf } from "./upload-pdf";
import { SUBSPECIALTIES } from "@/lib/classify";

const SUGGESTED = [
  ["Youmans and Winn Neurological Surgery", "Winn HR"], ["Greenberg's Handbook of Neurosurgery", "Greenberg MS"],
  ["Schmidek and Sweet Operative Neurosurgical Techniques", "Quiñones-Hinojosa A"], ["Rhoton's Cranial Anatomy and Surgical Approaches", "Rhoton AL"],
  ["Principles of Neurological Surgery", "Ellenbogen RG"], ["Al-Mefty's Meningiomas", "Al-Mefty O"],
];

export function AddTextbook() {
  const [m, setM] = useState({ title: "", authors: "", edition: "", year: "", publisher: "", isbn: "", subspecialty: "" });
  const set = (k: keyof typeof m) => (e: any) => setM({ ...m, [k]: e.target.value });
  return (
    <div className="card p-4">
      <h3 className="font-serif text-lg font-semibold">Add a licensed textbook or reference PDF</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-6">
        <input className="input sm:col-span-4" placeholder="Title *" value={m.title} onChange={set("title")} list="sugg" />
        <datalist id="sugg">{SUGGESTED.map(([t]) => <option key={t} value={t} />)}</datalist>
        <input className="input sm:col-span-2" placeholder="Authors / editors" value={m.authors} onChange={set("authors")} />
        <input className="input" placeholder="Edition (e.g. 8th)" value={m.edition} onChange={set("edition")} />
        <input className="input" placeholder="Year" inputMode="numeric" value={m.year} onChange={set("year")} />
        <input className="input sm:col-span-2" placeholder="Publisher" value={m.publisher} onChange={set("publisher")} />
        <input className="input sm:col-span-2" placeholder="ISBN" value={m.isbn} onChange={set("isbn")} />
        <select className="input sm:col-span-3" value={m.subspecialty} onChange={set("subspecialty")}><option value="">Subspecialty (optional)</option>{Object.keys(SUBSPECIALTIES).map((s) => <option key={s}>{s}</option>)}</select>
        <div className="flex items-center sm:col-span-3"><UploadPdf meta={{ kind: "textbook", ...m }} label="Choose PDF & upload" variant="primary" /></div>
      </div>
      <p className="mt-2 text-[12px] text-muted">PDF ≤ 50 MB. Text is extracted in 40-page batches in the background with chapter (PDF outline) and printed page numbers where the PDF provides them. For whole textbooks larger than 50 MB, run <code className="font-mono">npm run index-books</code> on your PC — only text is uploaded, never the PDF.</p>
    </div>
  );
}

export function DeleteDoc({ id }: { id: number }) {
  const router = useRouter();
  return <button title="Remove from library" onClick={async () => { if (!confirm("Remove this document and its indexed text?")) return; await fetch(`/api/documents/${id}`, { method: "DELETE" }); router.refresh(); }} className="p-1 text-muted hover:text-bad"><Trash2 size={15} /></button>;
}
