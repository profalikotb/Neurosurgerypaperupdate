// Rule-based, transparent classification. Deliberately NOT AI-scored so that ranking is
// reproducible and cannot be inflated by fashionable wording.

export type StudyType =
  | "Guideline" | "Meta-analysis" | "Systematic review" | "RCT" | "Prospective cohort" | "Retrospective cohort"
  | "Case-control" | "Case series" | "Case report" | "Narrative review" | "Technical note" | "Operative video"
  | "Anatomical study" | "Basic science" | "Editorial / Letter" | "Erratum" | "Other";

export const STUDY_TYPES: StudyType[] = ["Guideline","Meta-analysis","Systematic review","RCT","Prospective cohort","Retrospective cohort","Case-control","Case series","Case report","Narrative review","Technical note","Operative video","Anatomical study","Basic science","Editorial / Letter","Other"];

export const SUBSPECIALTIES: Record<string, RegExp> = {
  "Skull base": /skull base|clivus|clival|petroclival|petrous|cavernous sinus|anterior cranial fossa|jugular foramen|foramen magnum|chordoma|chondrosarcoma|endoscopic endonasal|transsphenoidal|olfactory groove|tuberculum sellae|cerebellopontine/i,
  "Vestibular schwannoma": /vestibular schwannoma|acoustic neuroma|retrosigmoid|translabyrinthine|neurofibromatosis type 2|NF2/i,
  "Meningioma": /meningioma/i,
  "Neuro-oncology": /glioma|glioblastoma|astrocytoma|oligodendroglioma|ependymoma|metasta|medulloblastoma|lymphoma|brain tumou?r|neuro-oncolog|IDH|MGMT|tumou?r treating fields|radiosurgery for (?:brain )?metast/i,
  "Pituitary & sellar": /pituitary|adenoma|craniopharyngioma|sellar|Rathke|acromegaly|Cushing|prolactinoma/i,
  "Vascular": /aneurysm|arteriovenous malformation|\bAVM\b|cavernous malformation|cavernoma|moyamoya|subarachnoid ha?emorrhage|intracerebral ha?emorrhage|\bICH\b|stroke|thrombectomy|carotid|bypass|dural arteriovenous|vasospasm|flow diverter|coiling|clipping/i,
  "Spine": /spine|spinal|lumbar|cervical|thoracic|myelopathy|radiculopathy|disc herniation|discectomy|laminectomy|fusion|spondylo|scoliosis|kyphosis|vertebr|odontoid|sacr/i,
  "Functional": /deep brain stimulation|\bDBS\b|epilepsy|seizure|Parkinson|tremor|dystonia|focused ultrasound|neuromodulation|spinal cord stimulation|trigeminal neuralgia|microvascular decompression|psychosurgery|responsive neurostimulation|laser interstitial/i,
  "Pediatric": /pediatric|paediatric|child|children|infant|neonat|craniosynostosis|myelomeningocele|spina bifida|Chiari/i,
  "Trauma & critical care": /traumatic brain injury|\bTBI\b|head injury|subdural|epidural ha?ematoma|decompressive craniectomy|intracranial pressure|neurocritical|polytrauma|spinal cord injury/i,
  "Hydrocephalus & CSF": /hydrocephalus|shunt|ventriculostomy|third ventriculostomy|\bETV\b|cerebrospinal fluid leak|CSF leak|idiopathic intracranial hypertension|normal pressure/i,
  "Neuroendoscopy": /endoscop/i,
  "Peripheral nerve": /peripheral nerve|brachial plexus|carpal tunnel|nerve transfer|ulnar nerve/i,
  "Surgical anatomy": /cadaver|anatomic(al)? study|microsurgical anatomy|white matter dissection|morphometric/i,
  "Technology & AI": /machine learning|deep learning|artificial intelligence|\bAI\b|large language model|robot|augmented reality|virtual reality|exoscope|navigation|3D print|radiomics/i,
};

const has = (types: string[], re: RegExp) => types.some((t) => re.test(t));

export function classifyStudy(pubTypes: string[], title: string, abstract: string): StudyType {
  const t = `${title} ${abstract}`;
  const ti = title;
  if (has(pubTypes, /^(Published )?Erratum$/i)) return "Erratum";
  if (has(pubTypes, /Practice Guideline|^Guideline$|Consensus Development Conference/i) || /\b(guideline|consensus statement|position statement|recommendations? from|practice parameter)\b/i.test(ti)) return "Guideline";
  if (has(pubTypes, /^Meta-Analysis$/i) || /meta-?analys/i.test(ti)) return "Meta-analysis";
  if (has(pubTypes, /^Systematic Review$/i) || /systematic (literature )?review|scoping review/i.test(ti)) return "Systematic review";
  if (has(pubTypes, /Randomized Controlled Trial/i) || /\brandomi[sz]ed\b.*\btrial\b|\bRCT\b/i.test(ti)) return "RCT";
  if (has(pubTypes, /^(Letter|Editorial|Comment|News)$/i) && !abstract) return "Editorial / Letter";
  if (has(pubTypes, /Video-Audio Media/i) || /operative video|video (case|article)|2-dimensional operative video|\bvideo\b.*technique/i.test(ti)) return "Operative video";
  if (/cadaver|anatomic(al)? (study|dissection)|microsurgical anatomy|morphometric|white matter dissection/i.test(t)) return "Anatomical study";
  if (/technical note|surgical technique|how I do it|technical (report|nuance)/i.test(ti)) return "Technical note";
  if (has(pubTypes, /Case Reports/i) || /\bcase report\b|: a case\b|report of (a|two|three) cases?/i.test(ti)) return "Case report";
  if (/\bmice\b|\bmouse\b|\brats?\b|in vitro|cell line|xenograft|murine|zebrafish|organoid/i.test(t) && !/patients/i.test(abstract)) return "Basic science";
  if (has(pubTypes, /Observational Study|Comparative Study|Clinical Trial|Multicenter/i) || /cohort|registry|retrospective|prospective/i.test(t)) {
    if (/case-control/i.test(t)) return "Case-control";
    if (/prospective(ly)?|clinical trial/i.test(t) && !/retrospective/i.test(t)) return "Prospective cohort";
    if (/retrospective|database|registry|cohort/i.test(t)) return "Retrospective cohort";
  }
  if (/case series|consecutive patients|single[- ]surgeon|single[- ]cent(er|re) experience|our experience/i.test(t)) return "Case series";
  if (has(pubTypes, /^Review$/i) || /\breview\b/i.test(ti)) return "Narrative review";
  if (has(pubTypes, /^(Letter|Editorial|Comment)$/i)) return "Editorial / Letter";
  if (/\bpatients\b/i.test(abstract)) return "Case series";
  return "Other";
}

/** Design-based level (Oxford CEBM-style). Labelled in the UI as "design-based", not an appraisal. */
export function evidenceLevel(type: StudyType, n: number | null, multicenter: boolean): string {
  switch (type) {
    case "Guideline": return "Guideline";
    case "Meta-analysis": case "Systematic review": return "1a";
    case "RCT": return (n ?? 0) >= 100 || multicenter ? "1b" : "2b";
    case "Prospective cohort": return "2b";
    case "Retrospective cohort": case "Case-control": return "3";
    case "Case series": return "4";
    default: return "5";
  }
}

const DESIGN_WEIGHT: Record<StudyType, number> = {
  Guideline: 40, "Meta-analysis": 33, "Systematic review": 28, RCT: 40, "Prospective cohort": 24, "Retrospective cohort": 15,
  "Case-control": 15, "Case series": 9, "Case report": 3, "Narrative review": 14, "Technical note": 9, "Operative video": 8,
  "Anatomical study": 8, "Basic science": 6, "Editorial / Letter": 0, Erratum: 0, Other: 5,
};

/** Extract the largest plausible sample size reported in the abstract. */
export function sampleSize(abstract: string): number | null {
  if (!abstract) return null;
  const nums: number[] = [];
  const res = [
    /\b[nN]\s*=\s*([\d,]{1,7})/g,
    /\b([\d,]{2,7})\s+(?:consecutive\s+|adult\s+|pediatric\s+|paediatric\s+)?(?:patients|participants|subjects|children|cases|individuals|procedures|eyes)\b/g,
    /\b(?:total of|included|enrolled|randomi[sz]ed)\s+([\d,]{2,7})\b/g,
  ];
  for (const re of res) for (const m of abstract.matchAll(re)) { const v = Number(m[1].replace(/,/g, "")); if (v >= 2 && v < 5_000_000) nums.push(v); }
  return nums.length ? Math.max(...nums) : null;
}

export function subspecialtiesOf(title: string, abstract: string, mesh: string[]): string[] {
  const t = `${title} ${abstract.slice(0, 1500)} ${mesh.join(" ")}`;
  return Object.entries(SUBSPECIALTIES).filter(([, re]) => re.test(t)).map(([k]) => k);
}

export const NEURO_RELEVANCE = /neurosurg|craniotomy|craniectomy|brain tumou?r|glioma|glioblastoma|meningioma|aneurysm|arteriovenous|hydrocephalus|spinal|spine|deep brain stimulation|subarachnoid|intracerebral ha?emorrhage|traumatic brain injury|pituitary|schwannoma|epilepsy surgery|thrombectomy|subdural|radiosurgery|neuro-oncolog|skull base|neuromodulation|focused ultrasound|middle meningeal artery/i;

export type Classified = {
  study_type: StudyType; evidence_level: string; subspecialties: string[]; sample_size: number | null;
  importance_score: number; practice_change_candidate: boolean; debated: boolean; is_retracted: boolean; hidden: boolean;
};

export function classifyPaper(p: { title: string; abstract: string | null; pub_types: string[]; mesh: string[]; journal_tier?: "core" | "additional"; journal_abbr?: string | null; }): Classified {
  const abstract = p.abstract ?? "";
  const study_type = classifyStudy(p.pub_types, p.title, abstract);
  const n = sampleSize(abstract);
  const multicenter = /multi-?cent(er|re)|multi-?institution|international|nationwide/i.test(`${p.title} ${abstract}`) || p.pub_types.some((x) => /Multicenter/i.test(x));
  const is_retracted = p.pub_types.some((x) => /Retracted Publication|Retraction of Publication/i.test(x));
  const hidden = study_type === "Erratum" || (study_type === "Editorial / Letter" && !abstract);

  let score = DESIGN_WEIGHT[study_type];
  if (/^(N Engl J Med|Lancet Neurol|JAMA Neurol)$/.test(p.journal_abbr ?? "")) score += 12;
  else if (p.journal_tier === "core") score += 8; else score += 5;
  if (n) score += Math.min(14, Math.round(Math.log10(n) * 4.5));
  if (multicenter) score += 6;
  if (/prospective/i.test(abstract)) score += 3;
  if (!abstract) score -= 10;
  if (is_retracted) score = 0;
  const importance_score = Math.max(0, Math.min(100, score));

  const strongDesign = ["RCT", "Meta-analysis", "Guideline"].includes(study_type) || (study_type === "Prospective cohort" && (n ?? 0) >= 300 && multicenter);
  const directional = /\b(significantly|superior|inferior|non-?inferior|reduc(ed|tion)|improv(ed|ement)|increased risk|did not (improve|reduce)|no significant difference|recommend)/i.test(abstract);
  const practice_change_candidate = !is_retracted && strongDesign && directional;
  const debated = /controvers|debate|\bversus\b|\bvs\.?\b|compar(ison|ed|ative)|pro and con|dilemma|which is better/i.test(p.title) && DESIGN_WEIGHT[study_type] >= 9;

  return {
    study_type, evidence_level: evidenceLevel(study_type, n, multicenter),
    subspecialties: subspecialtiesOf(p.title, abstract, p.mesh), sample_size: n,
    importance_score, practice_change_candidate, debated, is_retracted, hidden,
  };
}

/** Personalised ranking used at read time (never stored). */
export function personalScore(p: { importance_score: number; subspecialties: string[]; indexed_at?: string | null; pub_date?: string | null }, interests: Record<string, number>, journalPriority = 0): number {
  const interest = p.subspecialties.reduce((m, s) => Math.max(m, interests[s] ?? 0), 0); // 0..3
  const ageDays = (Date.now() - new Date(p.indexed_at ?? p.pub_date ?? Date.now()).getTime()) / 864e5;
  const recency = Math.max(0, 10 - ageDays / 3);
  return p.importance_score + interest * 6 + journalPriority * 0.6 + recency;
}
