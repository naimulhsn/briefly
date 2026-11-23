/**
 * Cheap clustering: no embeddings. Union-find on title similarity,
 * shared entities, and a 36-hour window.
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
  ["murder", "হত্যা", "খুন", "killed", "killing"],
  ["arson", "অগ্নিসংযোগ"],
  ["explosion", "বিস্ফোরণ"],
  ["election", "নির্বাচন", "vote", "ballot"],
];

function conflicts(a, b) {
  const ta = normalizeTitle(a.title);
  const tb = normalizeTitle(b.title);
  for (const group of CONFLICT_GROUPS) {
    const inA = group.some((g) => ta.includes(g));
    const inB = group.some((g) => tb.includes(g));
    if (inA !== inB) return true;
  }
  return false;
}

function closeInTime(a, b, hours = 36) {
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

const THRESHOLD = 0.42;

export function clusterArticles(articles) {
  const n = articles.length;
  const uf = new UnionFind(n);
  // Compare within a sliding window by time to keep O(n^2) manageable.
  const order = articles
    .map((a, i) => ({ i, t: Date.parse(a.published_at || 0) || 0 }))
    .sort((x, y) => x.t - y.t);

  for (let x = 0; x < n; x++) {
    const i = order[x].i;
    for (let y = x + 1; y < n; y++) {
      if (order[y].t - order[x].t > 36 * 3600 * 1000 && order[x].t && order[y].t) break;
      const j = order[y].i;
      const A = articles[i];
      const B = articles[j];
      if (!closeInTime(A, B)) continue;
      if (conflicts(A, B)) continue;
      if (similarity(A, B) >= THRESHOLD) uf.union(i, j);
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
    return {
      articles: sorted,
      title: pickTitle(sorted),
      published_at: sorted[0].published_at,
    };
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
