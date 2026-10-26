import { describe, it, expect } from "vitest";
import { classifyPaper, classifyStudy, sampleSize, evidenceLevel } from "@/lib/classify";
import { checkClaim, makeIndex, numbersIn, sanitizeCitations, verifyCore } from "@/lib/ai/verify";
import { chunkPages, titleSimilarity, fmtDate } from "@/lib/text";
import { sm2 } from "@/lib/srs";

describe("classification", () => {
  it("RCT from publication type, multicenter → LoE 1b, practice-change candidate", () => {
    const c = classifyPaper({ title: "MMA embolization for cSDH: a randomized trial", abstract: "A total of 412 patients were randomized at 18 centers (multicenter). Embolization significantly reduced recurrence.", pub_types: ["Journal Article", "Randomized Controlled Trial"], mesh: ["Hematoma, Subdural, Chronic"], journal_tier: "core" });
    expect(c.study_type).toBe("RCT"); expect(c.evidence_level).toBe("1b"); expect(c.sample_size).toBe(412);
    expect(c.practice_change_candidate).toBe(true); expect(c.subspecialties).toContain("Trauma & critical care");
  });
  it("fashionable technology alone does not create a practice-change flag", () => {
    const c = classifyPaper({ title: "Artificial intelligence revolutionizes glioma surgery", abstract: "Our deep learning model dramatically improved prediction in 40 patients retrospectively.", pub_types: ["Journal Article"], mesh: [], journal_tier: "core" });
    expect(c.practice_change_candidate).toBe(false); expect(c.importance_score).toBeLessThan(40);
  });
  it("case report, meta-analysis, guideline, erratum", () => {
    expect(classifyStudy(["Case Reports"], "A rare case", "")).toBe("Case report");
    expect(classifyStudy(["Journal Article"], "Outcomes after X: a systematic review and meta-analysis", "")).toBe("Meta-analysis");
    expect(classifyStudy(["Practice Guideline"], "Congress guideline", "")).toBe("Guideline");
    expect(classifyStudy(["Published Erratum"], "Correction", "")).toBe("Erratum");
    expect(evidenceLevel("Case series", 20, false)).toBe("4");
  });
  it("retraction zeroes score", () => {
    const c = classifyPaper({ title: "X", abstract: "y patients", pub_types: ["Retracted Publication"], mesh: [] });
    expect(c.is_retracted).toBe(true); expect(c.importance_score).toBe(0);
  });
  it("sample size takes the largest plausible n", () => expect(sampleSize("We screened 1,204 patients; n = 312 underwent surgery.")).toBe(1204));
});

describe("verification", () => {
  const src = "Results: Recurrence occurred in 6.8% vs 15.9% (OR 0.39, 95% CI 0.21–0.72; p = 0.003). Mortality was 4.1%.";
  const idx = makeIndex(src);
  it("verbatim quote and numbers present", () => {
    const c = checkClaim(idx, "Recurrence 6.8% vs 15.9% (OR 0.39)", "Recurrence occurred in 6.8% vs 15.9%");
    expect(c.quote_found).toBe(true); expect(c.missing_numbers).toEqual([]);
  });
  it("flags invented numbers", () => {
    const c = checkClaim(idx, "Mortality was 2.3% and recurrence 6.8%", "Mortality was 4.1%");
    expect(c.missing_numbers).toEqual(["2.3"]);
  });
  it("flags fabricated quote", () => expect(checkClaim(idx, "x", "Embolization eliminated all hemorrhagic complications in the cohort").quote_found).toBe(false));
  it("normalises dashes and trailing zeros", () => {
    expect(checkClaim(idx, "CI 0.21-0.72", "95% CI 0.21-0.72").quote_found).toBe(true);
    expect(numbersIn("15.90% and 1,204")).toEqual(["15.9", "1204"]);
  });
  it("verifyCore totals", () => {
    const v = verifyCore({ findings: [{ text: "Recurrence 6.8% vs 15.9%", quote: "Recurrence occurred in 6.8% vs 15.9%" }, { text: "Mortality 9.9%", quote: "made up text that is not in the source at all" }] }, src);
    expect(v.totals).toEqual({ findings: 2, verified: 1, flagged: 1 });
  });
  it("removes citation IDs not supplied", () => {
    const r = sanitizeCitations("A [S1] B [S9] C [L2, S3]", new Set(["S1", "L2"]));
    expect(r.text).toBe("A [S1] B  C [L2]"); expect(r.removed).toEqual(["S9", "S3"]);
  });
});

describe("utilities", () => {
  it("chunking keeps page provenance", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about the retrosigmoid approach and the facial nerve preservation strategy.`).join("\n\n");
    const ch = chunkPages([{ text, label: "214", index: 230, chapter: "Vestibular schwannoma" }], 600);
    expect(ch.length).toBeGreaterThan(2);
    expect(ch.every((c) => c.page_label === "214" && c.chapter === "Vestibular schwannoma")).toBe(true);
  });
  it("title similarity", () => {
    expect(titleSimilarity("MMA embolization for chronic subdural hematoma", "MMA Embolization for Chronic Subdural Hematoma.")).toBe(1);
    expect(titleSimilarity("Glioma surgery outcomes", "Spinal fusion complications")).toBeLessThan(0.2);
  });
  it("dd/MM/yyyy", () => expect(fmtDate("2026-10-27")).toBe("27/10/2026"));
  it("SM-2 schedule", () => {
    const a = sm2({ ease: 2.5, interval_days: 0, reps: 0 }, 4); expect(a.interval_days).toBe(1);
    const b = sm2({ ease: a.ease, interval_days: a.interval_days, reps: a.reps }, 4); expect(b.interval_days).toBe(4);
    const f = sm2({ ease: 2.5, interval_days: 20, reps: 5 }, 0); expect(f.interval_days).toBe(1); expect(f.difficult).toBe(true);
  });
});
