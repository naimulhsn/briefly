import { config } from "../config.js";
import { heuristicProcess } from "../ingest/labels.js";
import { classifyLocation } from "../ingest/geo.js";
import { availableProcessor, generateWithFallback, configuredProviders } from "./providers.js";

export { availableProcessor, configuredProviders };

const SYSTEM = `You are a careful news editor for a Bangladesh briefing app.
Write ONLY in clear, neutral English (even when source text is Bangla).
Cluster items already group multiple outlets' versions of the SAME event.
Never declare anyone guilty. Use "alleged", "reported", "according to sources".
Distinguish a political statement or rhetoric from a reported criminal act.
When a Bangladesh law may apply, suggest it as:
"Possibly applicable, alleged/reported until confirmed: ..."
Political parties to recognise when present: Awami League, BNP, Jamaat-e-Islami, NCP (National Citizen Party), Jatiya Party, Islami Andolan, Workers Party, and others clearly named.
Roles: alleged_perpetrator | victim | mentioned.
Location levels: local_area (Pagar, Tongi and immediate neighbourhoods) | city (Gazipur district/city, including Kaliakair, Kapasia, Sreepur, Joydebpur, Konabari, Kashimpur, Pubail, etc.) | country (elsewhere in Bangladesh) | world.
Categories: politics, crime, accident, economy, health, education, environment, labor, international, sports, culture, technology, disaster, corruption, law_and_justice, other.
Legal labels: reported_criminal_act, court_legal_action, police_action, political_statement, announcement, accident, other.
Return ONLY valid JSON.`;

function clusterPrompt(clusters) {
  const payload = clusters.map((c, i) => ({
    id: i,
    title: c.title,
    articles: c.articles.slice(0, 8).map((a) => ({
      source: a.source_name,
      title: a.title,
      published_at: a.published_at,
      excerpt: String(a.description || "").slice(0, 500),
    })),
    is_fact_check_source: c.articles.some((a) => a.source_type === "factcheck"),
  }));
  return `${SYSTEM}

For each cluster, produce an object with:
{
  "id": <same id>,
  "title": "short English headline",
  "summary": "2-4 sentence neutral English summary of the event",
  "key_facts": ["up to 5 short factual bullets"],
  "source_differences": "how outlets differ, or empty string if a single source or they agree",
  "category": "...",
  "legal_label": "...",
  "legal_note": "plain-English caution, or empty",
  "law_suggestion": "Possibly applicable, alleged/reported until confirmed: ... or empty",
  "location_level": "local_area|city|country|world",
  "location_name": "place name",
  "parties": [{"name":"BNP","role":"mentioned"}],
  "is_fact_check": false
}

Clusters JSON:
${JSON.stringify(payload)}

Reply with a JSON array only.`;
}

function extractJson(text) {
  if (!text) throw new Error("empty model response");
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[\[{]/);
  if (start < 0) throw new Error("no JSON in model response");
  s = s.slice(start);
  return JSON.parse(s);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mockFromCluster(cluster, homeArea) {
  const blob = cluster.articles
    .map((a) => `${a.title}\n${a.description || ""}`)
    .join("\n");
  const heur = heuristicProcess(blob, cluster.title);
  const loc = classifyLocation(
    `${cluster.title}\n${blob}\n${cluster.articles.map((a) => a.source_level).join(" ")}`,
    cluster.articles[0]?.source_level,
    homeArea
  );
  const englishTitle = /[A-Za-z]{4,}/.test(cluster.title)
    ? cluster.title
    : `Reported development: ${cluster.title}`;
  const sources = [...new Set(cluster.articles.map((a) => a.source_name))];
  const summary = heur.legal_note
    ? `Multiple outlets reported this event (${sources.slice(0, 4).join(", ")}). ${heur.legal_note} A full English summary will replace this heuristic card once an AI model processes the cluster.`
    : `Coverage from ${sources.join(", ")}. Original headlines are shown below. A model-written English summary was not available for this cluster.`;
  return {
    processor: "heuristic",
    title: englishTitle.slice(0, 200),
    summary,
    key_facts: cluster.articles.slice(0, 3).map((a) => a.title),
    source_differences: sources.length > 1 ? `Covered by ${sources.join(", ")}.` : "",
    category: heur.category,
    legal_label: heur.legal_label,
    legal_note: heur.legal_note,
    law_suggestion: heur.law_suggestion,
    location_level: loc.level,
    location_name: loc.name,
    parties: heur.parties,
    is_fact_check: cluster.articles.some((a) => a.source_type === "factcheck"),
  };
}

export function heuristicAnalyze(cluster, homeArea) {
  return mockFromCluster(cluster, homeArea);
}

async function analyzeBatchWithModel(clusters, homeArea, prefer) {
  const prompt = clusterPrompt(clusters);
  const { text, processor } = await generateWithFallback(prompt);
  return { data: extractJson(text), processor };
}

export async function analyzeClusters(clusters, { homeArea, onBatch } = {}) {
  const prefer = availableProcessor();
  if (prefer === "heuristic") {
    return {
      results: clusters.map((c) => heuristicAnalyze(c, homeArea)),
      processor: "heuristic",
      aiCount: 0,
    };
  }

  const limit = Math.min(clusters.length, config.maxAiClustersPerRun);
  // Caller is expected to sort clusters by priority first.
  const selected = clusters.map((c, idx) => ({ c, idx })).slice(0, limit);
  const results = new Array(clusters.length);
  let processorUsed = prefer;
  let aiCount = 0;
  const batchSize = Math.max(1, config.aiBatchSize);

  for (let i = 0; i < selected.length; i += batchSize) {
    const slice = selected.slice(i, i + batchSize);
    try {
      const { data, processor } = await analyzeBatchWithModel(
        slice.map((s) => s.c),
        homeArea,
        prefer
      );
      processorUsed = processor;
      const arr = Array.isArray(data) ? data : [data];
      slice.forEach((item, j) => {
        const raw = arr.find((x) => Number(x.id) === j) || arr[j];
        results[item.idx] = { ...normalizeAi(raw, item.c, homeArea), processor };
        aiCount += 1;
      });
      onBatch?.({ done: i + slice.length, total: selected.length, processor });
    } catch (err) {
      // Fall back this batch only.
      slice.forEach((item) => {
        results[item.idx] = { ...heuristicAnalyze(item.c, homeArea), processor: "heuristic" };
      });
      onBatch?.({
        done: i + slice.length,
        total: selected.length,
        error: String(err.message || err).slice(0, 200),
      });
    }
    if (i + batchSize < selected.length) await sleep(2500);
  }

  for (let i = 0; i < clusters.length; i++) {
    if (!results[i]) results[i] = { ...heuristicAnalyze(clusters[i], homeArea), processor: "heuristic" };
  }
  return { results, processor: processorUsed, aiCount };
}

function normalizeAi(raw, cluster, homeArea) {
  if (!raw || typeof raw !== "object") return heuristicAnalyze(cluster, homeArea);
  const fallback = heuristicAnalyze(cluster, homeArea);
  const loc = raw.location_level;
  const level = ["local_area", "city", "country", "world"].includes(loc)
    ? loc
    : fallback.location_level;
  const parties = Array.isArray(raw.parties)
    ? raw.parties
        .filter((p) => p && p.name)
        .map((p) => ({
          name: String(p.name).trim(),
          role: ["alleged_perpetrator", "victim", "mentioned"].includes(p.role)
            ? p.role
            : "mentioned",
        }))
    : fallback.parties;
  return {
    title: String(raw.title || fallback.title).slice(0, 240),
    summary: String(raw.summary || fallback.summary).slice(0, 2500),
    key_facts: Array.isArray(raw.key_facts)
      ? raw.key_facts.map((x) => String(x).slice(0, 400)).slice(0, 6)
      : fallback.key_facts,
    source_differences: String(raw.source_differences || ""),
    category: raw.category || fallback.category,
    legal_label: raw.legal_label || fallback.legal_label,
    legal_note: raw.legal_note || fallback.legal_note,
    law_suggestion: raw.law_suggestion || fallback.law_suggestion,
    location_level: level,
    location_name: raw.location_name || fallback.location_name,
    parties,
    is_fact_check: Boolean(raw.is_fact_check) || fallback.is_fact_check,
  };
}
