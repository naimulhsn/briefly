/**
 * Cluster the same event across outlets. Prefers multilingual embeddings
 * (cosine + union-find + a centroid pass) with title/entity heuristics
 * as backup, inside a 72-hour window.
 */
const ALIASES = [
  // Places
  ["gazipur", ["গাজীপুর", "গাজিপুর"]],
  ["tongi", ["টঙ্গী", "টাঙ্গী", "টঙ্গি"]],
  ["pagar", ["পাগার"]],
  ["dhaka", ["ঢাকা"]],
  ["chattogram", ["চট্টগ্রাম", "chittagong"]],
  ["joydebpur", ["জয়দেবপুর", "জয়দেবপুর"]],
  ["kashimpur", ["কাশিমপুর"]],
  ["konabari", ["কোনাবাড়ী", "কোনাবাড়ী"]],
  ["bangladesh", ["বাংলাদেশ"]],
  // Parties and wings
  ["awami", ["আওয়ামী", "আওয়ামী", "আ'লীগ", "আ’লীগ", "ছাত্রলীগ", "যুবলীগ"]],
  ["bnp", ["বিএনপি", "যুবদল", "ছাত্রদল"]],
  ["jamaat", ["জামায়াত", "জামায়াত", "শিবির", "ছাত্রশিবির"]],
  ["ncp", ["এনসিপি", "নাগরিক পার্টি"]],
  // Frequent event terms that help cross-script matches
  ["police", ["পুলিশ"]],
  ["worker", ["শ্রমিক", "workers", "labour", "labor"]],
  ["murder", ["হত্যা", "খুন", "murdered", "killing"]],
  ["arrest", ["গ্রেফতার", "গ্রেপ্তার", "arrested", "arrests"]],
  ["protest", ["বিক্ষোভ", "আন্দোলন", "protesters", "protests"]],
  ["election", ["নির্বাচন", "elections", "electoral"]],
  ["court", ["আদালত", "হাইকোর্ট", "tribunal"]],
  ["fire", ["আগুন", "অগ্নিকাণ্ড", "অগ্নিসংযোগ"]],
  ["student", ["শিক্ষার্থী", "ছাত্র", "students"]],
  ["garment", ["গার্মেন্ট", "পোশাক"]],
  ["leader", ["নেতা", "নেত্রী", "leaders"]],
  ["gauk", ["gauking", "gda", "gazipur development authority"]],
  ["rickshaw", ["e-rickshaw", "erickshaw", "ই-রিক্সা", "রিক্সা"]],
  ["cylinder", ["সিলিন্ডার", "gas cylinder"]],
];

function applyAliases(s) {
  let out = s;
  for (const [canon, list] of ALIASES) {
    for (const a of list) {
      if (out.includes(a)) out += " " + canon;
    }
  }
  return out;
}

const STOP = new Set(`
  the a an of to in on for and or by with from at as is was are were be been
  after over under into about after before during against between through
  this that these those their its his her they he she it we you
  says said say tell told report reports reported according
  new latest update breaking news live
  bangladesh dhaka
  বাংলাদেশ ঢাকা এক জন করে থেকে নিয়ে নিয়ে করা হয়েছে হয়েছে হয়ে জন্য সাথে
  বলেছেন বলে জানিয়েছেন জানিয়েছেন আরও আরো নিহত আহত
`.split(/\s+/).filter(Boolean));

const SOURCE_SUFFIX = /\s+[-–—|]\s+[^-–—|]{2,40}$/;

export function normalizeTitle(title) {
  let t = String(title || "");
  t = t.replace(SOURCE_SUFFIX, "");
  t = t.replace(/&amp;/g, "&").replace(/&#\d+;/g, " ");
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
  t = t.toLowerCase().normalize("NFKC");
  t = applyAliases(t);
  t = t.replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function tokens(title) {
  return normalizeTitle(title)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function charNgrams(s, n = 3) {
  const compact = normalizeTitle(s).replace(/\s+/g, "");
  const g = new Set();
  if (compact.length < n) {
    if (compact) g.add(compact);
    return g;
  }
  for (let i = 0; i <= compact.length - n; i++) g.add(compact.slice(i, i + n));
  return g;
}

const ENTITY_RE = /[A-Z][a-zA-Z]+|\d{2,}|গাজীপুর|টঙ্গী|পাগার|ঢাকা|বিএনপি|আওয়ামী|আওয়ামী|জামায়াত|জামায়াত|এনসিপি/g;

export function entities(title) {
  const raw = String(title || "");
  const found = raw.match(ENTITY_RE) || [];
  return new Set(found.map((x) => x.toLowerCase()));
}

const STRONG_BRIDGES = new Set([
  "gazipur", "tongi", "pagar", "joydebpur", "kashimpur", "konabari",
  "awami", "bnp", "jamaat", "ncp",
]);
const ALL_BRIDGES = new Set(ALIASES.map(([canon]) => canon));

export function similarity(a, b) {
  const ta = new Set(tokens(a.title));
  const tb = new Set(tokens(b.title));
  const jac = jaccard(ta, tb);
  const gram = jaccard(charNgrams(a.title), charNgrams(b.title));
  const ea = entities(a.title);
  const eb = entities(b.title);
  const ent = jaccard(ea, eb);
  // Weighted: tokens matter most, char-grams help Bangla/English near-duplicates,
  // entities help cross-language (shared numbers, place and party names).
  let score = jac * 0.5 + gram * 0.3 + ent * 0.2;
  const bridges = [...ta].filter((tok) => ALL_BRIDGES.has(tok) && tb.has(tok));
  const strong = bridges.filter((tok) => STRONG_BRIDGES.has(tok));
  if (strong.length >= 1 && bridges.length >= 3) score = Math.max(score, 0.5);
  if (strong.length >= 2) score = Math.max(score, 0.52);
  return score;
}

const CONFLICT_GROUPS = [
  ["rape", "ধর্ষণ", "gang rape"],
  ["election", "নির্বাচন", "vote", "ballot"],
];

const PLACE_GROUPS = [
  { id: "tongi", keys: ["tongi", "টঙ্গী", "টাঙ্গী"] },
  { id: "pagar", keys: ["pagar", "পাগার"] },
  { id: "joydebpur", keys: ["joydebpur", "জয়দেবপুর", "জয়দেবপুর"] },
  { id: "konabari", keys: ["konabari", "কোনাবাড়ী", "কোনাবাড়ী"] },
  { id: "kashimpur", keys: ["kashimpur", "কাশিমপুর"] },
  { id: "lalbagh", keys: ["lalbagh", "লালবাগ"] },
  { id: "hazaribagh", keys: ["hazaribagh", "হাজারীবাগ"] },
  { id: "gulshan", keys: ["gulshan", "গুলশান"] },
  { id: "malibagh", keys: ["malibagh", "মালিবাগ"] },
  { id: "uttara", keys: ["uttara", "উত্তরা"] },
  { id: "mirpur", keys: ["mirpur", "মিরপুর"] },
  { id: "dhanmondi", keys: ["dhanmondi", "ধানমন্ডি"] },
  { id: "chattogram", keys: ["chattogram", "chittagong", "চট্টগ্রাম"] },
  { id: "sylhet", keys: ["sylhet", "সিলেট"] },
  { id: "narayanganj", keys: ["narayanganj", "নারায়ণগঞ্জ", "নারায়ণগঞ্জ"] },
  { id: "rangpur", keys: ["rangpur", "রংপুর"] },
  { id: "rajshahi", keys: ["rajshahi", "রাজশাহী"] },
  { id: "khulna", keys: ["khulna", "খুলনা"] },
  { id: "benapole", keys: ["benapole", "বেনাপোল"] },
];
const PLACE_FAMILY = {
  tongi: "gazipur", pagar: "gazipur", joydebpur: "gazipur",
  konabari: "gazipur", kashimpur: "gazipur",
};

function placesOf(title) {
  const t = normalizeTitle(title);
  const found = [];
  for (const g of PLACE_GROUPS) {
    if (g.keys.some((k) => t.includes(k))) found.push(g.id);
  }
  return found;
}

function placeConflict(a, b) {
  const pa = placesOf(a.title);
  const pb = placesOf(b.title);
  if (!pa.length || !pb.length) return false;
  for (const x of pa) {
    for (const y of pb) {
      if (x === y) return false;
      const fx = PLACE_FAMILY[x] || x;
      const fy = PLACE_FAMILY[y] || y;
      if (fx === fy) return false;
    }
  }
  return true;
}

const EVENT_CONFLICTS = [
  [["petrol bomb", "পেট্রোলবোমা", "cocktail", "ককটেল"], ["gas leak", "গ্যাস লিকেজ", "cylinder", "সিলিন্ডার", "গ্যাস", "house fire", "বাসায় আগুন", "বসতবাড়ি"]],
];

function eventConflict(a, b) {
  const ta = normalizeTitle(a.title);
  const tb = normalizeTitle(b.title);
  for (const [g1, g2] of EVENT_CONFLICTS) {
    const a1 = g1.some((g) => ta.includes(g));
    const b1 = g1.some((g) => tb.includes(g));
    const a2 = g2.some((g) => ta.includes(g));
    const b2 = g2.some((g) => tb.includes(g));
    if ((a1 && b2) || (a2 && b1)) return true;
  }
  return false;
}

function conflicts(a, b) {
  const ta = normalizeTitle(a.title);
  const tb = normalizeTitle(b.title);
  for (const group of CONFLICT_GROUPS) {
    const inA = group.some((g) => ta.includes(g));
    const inB = group.some((g) => tb.includes(g));
    if (inA !== inB) return true;
  }
  if (placeConflict(a, b)) return true;
  if (eventConflict(a, b)) return true;
  return false;
}

function closeInTime(a, b, hours = 72) {
  const da = Date.parse(a.published_at || 0);
  const db = Date.parse(b.published_at || 0);
  if (!da || !db) return true;
  return Math.abs(da - db) <= hours * 3600 * 1000;
}

class UnionFind {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a, b) {
    const pa = this.find(a);
    const pb = this.find(b);
    if (pa !== pb) this.p[pb] = pa;
  }
}

const HEURISTIC_THRESHOLD = 0.42;
// From a Nov 2026 bake-off on real Briefly Bangla/English pairs with
// gemini-embedding-001 (SEMANTIC_SIMILARITY, 768-d, L2-normalised):
// A threshold sweep on 800 real Briefly articles found that 0.90 keeps
// the 12 Tongi fire (Bangla+English) reports in one cluster without
// chaining unrelated Gazipur stories into a mega-cluster (that started
// at ~0.86 with a centroid second pass). Heuristic 0.42 remains as backup.
export const EMBED_THRESHOLD = Number(process.env.EMBED_THRESHOLD || 0.90);
const EMBED_HEURISTIC_THRESHOLD = Number(process.env.EMBED_HEURISTIC_THRESHOLD || 0.85);
const CENTROID_THRESHOLD = Number(process.env.EMBED_CENTROID_THRESHOLD || 0.99);

function shouldLink(A, B, cos, heur) {
  if (cos >= EMBED_THRESHOLD) return true;
  if (cos >= EMBED_HEURISTIC_THRESHOLD && heur >= 0.24) return true;
  if (heur >= HEURISTIC_THRESHOLD) return true;
  return false;
}

function yieldOften(counter) {
  if (counter % 4000 !== 0) return Promise.resolve();
  return new Promise((r) => setImmediate(r));
}

/**
 * Cluster articles that report the same event.
 * @param {object[]} articles
 * @param {{ hours?: number, embeddings?: Map<any, number[]>, onProgress?: function }} [opts]
 */
export async function clusterArticles(articles, opts = {}) {
  const hours = opts.hours ?? 72;
  const embeddings = opts.embeddings || new Map();
  const n = articles.length;
  const uf = new UnionFind(n);
  const order = articles
    .map((a, i) => ({ i, t: Date.parse(a.published_at || 0) || 0 }))
    .sort((x, y) => x.t - y.t);

  const vecOf = (article) =>
    embeddings.get(article.id) || article.embedding || null;

  let compared = 0;
  for (let x = 0; x < n; x++) {
    const i = order[x].i;
    for (let y = x + 1; y < n; y++) {
      if (order[y].t - order[x].t > hours * 3600 * 1000 && order[x].t && order[y].t) break;
      const j = order[y].i;
      const A = articles[i];
      const B = articles[j];
      if (!closeInTime(A, B, hours)) continue;
      if (conflicts(A, B)) continue;
      const va = vecOf(A);
      const vb = vecOf(B);
      const cos = va && vb ? cosineSim(va, vb) : 0;
      const heur = similarity(A, B);
      if (shouldLink(A, B, cos, heur)) uf.union(i, j);
      compared += 1;
      if (compared % 4000 === 0) await yieldOften(compared);
    }
  }

  // Second pass: merge clusters whose embedding centroids are very close.
  // Recovers same-event pairs that sat just under the pairwise bar (e.g. two
  // English paraphrases of one Gazipur appointment) without chaining every
  // Gazipur story together (unrelated centroids stay lower).
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  const roots = [...groups.keys()];
  const centroids = new Map();
  const timeSpan = new Map();
  for (const r of roots) {
    const members = groups.get(r);
    const vecs = members.map((i) => vecOf(articles[i])).filter(Boolean);
    if (vecs.length) centroids.set(r, mean(vecs));
    const times = members.map((i) => Date.parse(articles[i].published_at || 0) || 0).filter(Boolean);
    timeSpan.set(r, { min: times.length ? Math.min(...times) : 0, max: times.length ? Math.max(...times) : 0 });
  }
  for (let a = 0; a < roots.length; a++) {
    for (let b = a + 1; b < roots.length; b++) {
      const ra = uf.find(roots[a]);
      const rb = uf.find(roots[b]);
      if (ra === rb) continue;
      const ca = centroids.get(ra);
      const cb = centroids.get(rb);
      if (!ca || !cb) continue;
      const ta = timeSpan.get(ra);
      const tb = timeSpan.get(rb);
      if (ta.min && tb.min && (ta.min - tb.max > hours * 3600 * 1000 || tb.min - ta.max > hours * 3600 * 1000)) {
        continue;
      }
      // Refuse the merge if any pair across the clusters is a hard conflict.
      let bad = false;
      for (const i of groups.get(roots[a])) {
        for (const j of groups.get(roots[b])) {
          if (conflicts(articles[i], articles[j])) { bad = true; break; }
        }
        if (bad) break;
      }
      if (bad) continue;
      if (cosineSim(ca, cb) >= CENTROID_THRESHOLD) {
        uf.union(ra, rb);
        const nr = uf.find(ra);
        // refresh centroid of the merged cluster lazily next comparison via find()
        const mergedVecs = [
          ...(groups.get(roots[a]) || []),
          ...(groups.get(roots[b]) || []),
        ].map((i) => vecOf(articles[i])).filter(Boolean);
        if (mergedVecs.length) centroids.set(nr, mean(mergedVecs));
        const ts = [timeSpan.get(ra), timeSpan.get(rb)];
        timeSpan.set(nr, {
          min: Math.min(...ts.map((t) => t.min || Infinity)),
          max: Math.max(...ts.map((t) => t.max || 0)),
        });
      }
    }
  }

  const out = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!out.has(root)) out.set(root, []);
    out.get(root).push(articles[i]);
  }
  return [...out.values()].map((members) => {
    const sorted = members.sort(
      (a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0)
    );
    const vecs = sorted.map((a) => vecOf(a)).filter(Boolean);
    return {
      articles: sorted,
      title: pickTitle(sorted),
      published_at: sorted[0].published_at,
      embedding: vecs.length ? mean(vecs) : null,
    };
  });
}

function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function mean(vectors) {
  const dim = vectors[0].length;
  const acc = new Array(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  const n = vectors.length || 1;
  let norm = 0;
  const out = acc.map((x) => x / n);
  for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return out.map((x) => x / norm);
}

/** Synchronous heuristic-only path, used when embeddings are unavailable. */
export function clusterArticlesHeuristic(articles, hours = 72) {
  const n = articles.length;
  const uf = new UnionFind(n);
  const order = articles
    .map((a, i) => ({ i, t: Date.parse(a.published_at || 0) || 0 }))
    .sort((x, y) => x.t - y.t);
  for (let x = 0; x < n; x++) {
    const i = order[x].i;
    for (let y = x + 1; y < n; y++) {
      if (order[y].t - order[x].t > hours * 3600 * 1000 && order[x].t && order[y].t) break;
      const j = order[y].i;
      if (!closeInTime(articles[i], articles[j], hours)) continue;
      if (conflicts(articles[i], articles[j])) continue;
      if (similarity(articles[i], articles[j]) >= HEURISTIC_THRESHOLD) uf.union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(articles[i]);
  }
  return [...groups.values()].map((members) => {
    const sorted = members.sort(
      (a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0)
    );
    return { articles: sorted, title: pickTitle(sorted), published_at: sorted[0].published_at };
  });
}

function pickTitle(arts) {
  // Prefer an English title when one exists, else the longest.
  const scored = arts.map((a) => {
    const t = a.title || "";
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    const bangla = (t.match(/[\u0980-\u09FF]/g) || []).length;
    return { t, score: (latin > bangla ? 50 : 0) + Math.min(t.length, 140) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].t;
}

export function factCheckLikelyMatch(fcTitle, storyTitle) {
  return similarity({ title: fcTitle }, { title: storyTitle }) >= 0.32;
}
