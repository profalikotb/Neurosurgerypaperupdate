import { describe, it, expect } from "vitest";
import { parsePubmedXml, journalClause } from "@/lib/sources/pubmed";
import { parseJats } from "@/lib/sources/europepmc";
import { PUBMED_XML, JATS_XML } from "./fixtures";

describe("PubMed XML parser", () => {
  const recs = parsePubmedXml(PUBMED_XML);
  it("parses all articles", () => expect(recs).toHaveLength(2));
  const r = recs[0];
  it("extracts identifiers", () => {
    expect(r.pmid).toBe("40123456");
    expect(r.doi).toBe("10.3171/2026.1.JNS26001");
    expect(r.pmcid).toBe("PMC12345678");
  });
  it("strips inline markup from title", () => expect(r.title).toContain("multicenter randomized controlled trial"));
  it("keeps structured abstract", () => {
    expect(r.abstract_sections?.map((s) => s.label)).toEqual(["OBJECTIVE", "METHODS", "RESULTS", "CONCLUSIONS"]);
    expect(r.abstract).toContain("OR 0.39, 95% CI 0.21-0.72");
  });
  it("authors incl. collective", () => {
    expect(r.authors.map((a) => a.name)).toEqual(["Smith J", "Doe A", "MMA Trial Group"]);
    expect(r.authors[0].affiliation).toContain("Example University");
  });
  it("separates publication date (earliest of epub/issue) from Entrez indexing date", () => {
    expect(r.pub_date).toBe("2026-09-12");
    expect(r.indexed_at).toBe("2026-09-13T06:32:00Z");
  });
  it("journal + types + mesh + keywords", () => {
    expect(r.journal_abbr).toBe("J Neurosurg");
    expect(r.pub_types).toContain("Randomized Controlled Trial");
    expect(r.mesh).toContain("Hematoma, Subdural, Chronic");
    expect(r.keywords).toEqual(["chronic subdural hematoma", "embolization"]);
    expect(r.volume).toBe("145"); expect(r.pages).toBe("812-822");
  });
  it("handles MedlineDate and missing abstract", () => {
    expect(recs[1].pub_date).toBe("2026-07-01");
    expect(recs[1].abstract).toBeNull();
    expect(recs[1].doi).toBeNull();
  });
  it("builds journal clause with alternatives", () => {
    expect(journalClause("Oper Neurosurg (Hagerstown)|Oper Neurosurg")).toBe('("Oper Neurosurg (Hagerstown)"[ta] OR "Oper Neurosurg"[ta])');
  });
});

describe("JATS parser", () => {
  const { sections, license } = parseJats(JATS_XML);
  it("license", () => expect(license).toBe("https://creativecommons.org/licenses/by/4.0/"));
  it("abstract + nested sections with path labels", () => {
    expect(sections[0]).toMatchObject({ label: "Abstract", kind: "abstract" });
    expect(sections.find((s) => s.label === "Methods › Patients")?.text).toBe("We enrolled 412 patients.");
    expect(sections.find((s) => s.label === "Results")?.text).toContain("6.8% versus 15.9%");
  });
  it("removes citation superscripts from body text", () => expect(sections.find((s) => s.label === "Introduction")?.text).toBe("Chronic subdural hematoma is common."));
  it("tables as rows; figures as captions", () => {
    const t = sections.find((s) => s.kind === "table")!;
    expect(t.label).toBe("Table 1"); expect(t.text).toContain("Age | 72.1 | 71.8");
    expect(sections.find((s) => s.kind === "figure")?.text).toContain("Kaplan-Meier");
  });
});
