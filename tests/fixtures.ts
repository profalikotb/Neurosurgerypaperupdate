export const PUBMED_XML = `<?xml version="1.0" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">
<PubmedArticleSet>
<PubmedArticle>
  <MedlineCitation Status="Publisher" Owner="NLM">
    <PMID Version="1">40123456</PMID>
    <Article PubModel="Print-Electronic">
      <Journal>
        <ISSN IssnType="Electronic">1933-0693</ISSN>
        <JournalIssue CitedMedium="Internet"><Volume>145</Volume><Issue>4</Issue><PubDate><Year>2026</Year><Month>Oct</Month><Day>01</Day></PubDate></JournalIssue>
        <Title>Journal of neurosurgery</Title><ISOAbbreviation>J Neurosurg</ISOAbbreviation>
      </Journal>
      <ArticleTitle>Middle meningeal artery embolization versus standard care for chronic subdural hematoma: a multicenter <i>randomized</i> controlled trial.</ArticleTitle>
      <Pagination><MedlinePgn>812-822</MedlinePgn></Pagination>
      <ELocationID EIdType="doi" ValidYN="Y">10.3171/2026.1.JNS26001</ELocationID>
      <Abstract>
        <AbstractText Label="OBJECTIVE" NlmCategory="OBJECTIVE">To compare recurrence after MMA embolization.</AbstractText>
        <AbstractText Label="METHODS" NlmCategory="METHODS">A total of 412 patients were randomized across 18 centers.</AbstractText>
        <AbstractText Label="RESULTS" NlmCategory="RESULTS">Recurrence occurred in 6.8% vs 15.9% (OR 0.39, 95% CI 0.21-0.72; p = 0.003).</AbstractText>
        <AbstractText Label="CONCLUSIONS" NlmCategory="CONCLUSIONS">Embolization significantly reduced recurrence.</AbstractText>
      </Abstract>
      <AuthorList CompleteYN="Y">
        <Author ValidYN="Y"><LastName>Smith</LastName><ForeName>John</ForeName><Initials>J</Initials><AffiliationInfo><Affiliation>Department of Neurosurgery, Example University.</Affiliation></AffiliationInfo></Author>
        <Author ValidYN="Y"><LastName>Doe</LastName><ForeName>Ann</ForeName><Initials>A</Initials></Author>
        <Author ValidYN="Y"><CollectiveName>MMA Trial Group</CollectiveName></Author>
      </AuthorList>
      <Language>eng</Language>
      <PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D016449">Randomized Controlled Trial</PublicationType><PublicationType UI="D016448">Multicenter Study</PublicationType></PublicationTypeList>
      <ArticleDate DateType="Electronic"><Year>2026</Year><Month>09</Month><Day>12</Day></ArticleDate>
    </Article>
    <MedlineJournalInfo><Country>United States</Country><MedlineTA>J Neurosurg</MedlineTA></MedlineJournalInfo>
    <MeshHeadingList><MeshHeading><DescriptorName UI="D020200" MajorTopicYN="Y">Hematoma, Subdural, Chronic</DescriptorName></MeshHeading><MeshHeading><DescriptorName UI="D006801" MajorTopicYN="N">Humans</DescriptorName></MeshHeading></MeshHeadingList>
    <KeywordList Owner="NOTNLM"><Keyword MajorTopicYN="N">chronic subdural hematoma</Keyword><Keyword MajorTopicYN="N">embolization</Keyword></KeywordList>
  </MedlineCitation>
  <PubmedData>
    <History>
      <PubMedPubDate PubStatus="received"><Year>2026</Year><Month>1</Month><Day>5</Day></PubMedPubDate>
      <PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>9</Month><Day>13</Day><Hour>6</Hour><Minute>32</Minute></PubMedPubDate>
    </History>
    <PublicationStatus>aheadofprint</PublicationStatus>
    <ArticleIdList><ArticleId IdType="pubmed">40123456</ArticleId><ArticleId IdType="doi">10.3171/2026.1.JNS26001</ArticleId><ArticleId IdType="pmc">PMC12345678</ArticleId></ArticleIdList>
  </PubmedData>
</PubmedArticle>
<PubmedArticle>
  <MedlineCitation Status="MEDLINE" Owner="NLM">
    <PMID Version="1">40000001</PMID>
    <Article PubModel="Print">
      <Journal><JournalIssue CitedMedium="Internet"><Volume>12</Volume><PubDate><MedlineDate>2026 Jul-Aug</MedlineDate></PubDate></JournalIssue><Title>World neurosurgery</Title><ISOAbbreviation>World Neurosurg</ISOAbbreviation></Journal>
      <ArticleTitle>Retrosigmoid approach for a giant vestibular schwannoma: a case report.</ArticleTitle>
      <AuthorList><Author><LastName>Ali</LastName><Initials>K</Initials></Author></AuthorList>
      <PublicationTypeList><PublicationType UI="D002363">Case Reports</PublicationType></PublicationTypeList>
    </Article>
    <MedlineJournalInfo><MedlineTA>World Neurosurg</MedlineTA></MedlineJournalInfo>
  </MedlineCitation>
  <PubmedData><ArticleIdList><ArticleId IdType="pubmed">40000001</ArticleId></ArticleIdList></PubmedData>
</PubmedArticle>
</PubmedArticleSet>`;

export const JATS_XML = `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
<front><article-meta>
  <permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>CC BY</license-p></license></permissions>
  <abstract><sec><title>Objective</title><p>To compare outcomes.</p></sec></abstract>
</article-meta></front>
<body>
  <sec><title>Introduction</title><p>Chronic subdural hematoma is common <xref ref-type="bibr" rid="b1"><sup>1</sup></xref>.</p></sec>
  <sec><title>Methods</title>
    <sec><title>Patients</title><p>We enrolled 412 patients.</p>
      <table-wrap id="t1"><label>Table 1</label><caption><p>Baseline characteristics</p></caption>
        <table><thead><tr><th>Variable</th><th>MMA</th><th>Control</th></tr></thead><tbody><tr><td>Age</td><td>72.1</td><td>71.8</td></tr></tbody></table>
      </table-wrap>
    </sec>
  </sec>
  <sec><title>Results</title><p>Recurrence was 6.8% versus 15.9% (p = 0.003).</p>
    <fig id="f1"><label>Figure 1</label><caption><p>Kaplan-Meier curve of recurrence.</p></caption></fig>
  </sec>
</body>
</article>`;
