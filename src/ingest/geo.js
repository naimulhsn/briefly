/** Geographic priority: home area > city > country > world. */

const LOCAL_AREA = [
  "pagar", "পাগার", "পাগাড়",
  "tongi", "টঙ্গী", "টাঙ্গী", "টঙ্গি",
  "nishat nagar", "nishatnagar", "নিশাত নগর", "নিশাতনগর",
  "ershad nagar", "ershadnagar", "এরশাদনগর", "এরশাদ নগর",
  "milgate", "mill gate", "মিলগেট", "মিল গেট",
  "tongi bazar", "টঙ্গী বাজার", "টঙ্গীবাজার",
  "tongi station", "টঙ্গী স্টেশন",
  "tongi west", "tongi east", "টঙ্গী পশ্চিম", "টঙ্গী পূর্ব",
  "station road tongi",
  "chowrasta tongi", "টঙ্গী চৌরাস্তা",
];

const CITY = [
  "gazipur", "গাজীপুর", "গাজিপুর",
  "joydebpur", "জয়দেবপুর", "জয়দেবপুর",
  "kaliakair", "কালিয়াকৈর", "কালিয়াকৈর",
  "kapasia", "কাপাসিয়া", "কাপাসিয়া",
  "sreepur", "শ্রীপুর",
  "kaliganj", "কালীগঞ্জ", "কালীগন্জ",
  "konabari", "কোনাবাড়ী", "কোনাবাড়ী",
  "kashimpur", "কাশিমপুর",
  "pubail", "পুবাইল",
  "salna", "সালনা",
  "bhawal", "ভাওয়াল", "ভাওয়াল",
  "hotapara", "হোতাপাড়া",
  "chandana chowrasta", "চান্দনা",
  "board bazar", "বোর্ড বাজার", "বোর্ডবাজার",
  "national university", "জাতীয় বিশ্ববিদ্যালয়", "জাতীয় বিশ্ববিদ্যালয়",
  "gazipur city corporation", "gcc",
  "maleker bari",
  "signboard",
];

const COUNTRY = [
  "bangladesh", "বাংলাদেশ",
  "dhaka", "ঢাকা",
  "chittagong", "chattogram", "চট্টগ্রাম",
  "rajshahi", "রাজশাহী",
  "khulna", "খুলনা",
  "sylhet", "সিলেট",
  "barishal", "barisal", "বরিশাল",
  "rangpur", "রংপুর",
  "mymensingh", "ময়মনসিংহ", "ময়মনসিংহ",
  "cumilla", "comilla", "কুমিল্লা",
  "narayanganj", "নারায়ণগঞ্জ", "নারায়ণগঞ্জ",
  "narsingdi", "নরসিংদী",
  "tangail", "টাঙ্গাইল",
  "kishoreganj", "কিশোরগঞ্জ",
  "coxs bazar", "cox's bazar", "কক্সবাজার",
  "chittagong hill",
  "rohingya", "রোহিঙ্গা",
  "padma", "পদ্মা",
  "bangabhaban", "বঙ্গভবন",
  "jatiya sangsad", "জাতীয় সংসদ", "সংসদ ভবন",
  "hasina", "yunus", "tarique",
];

export const LOCATION_LEVELS = ["local_area", "city", "country", "world"];

export const GEO_SCORES = {
  local_area: 100,
  city: 70,
  country: 40,
  world: 10,
};

function includesAny(text, list) {
  return list.some((t) => text.includes(t));
}

function tokenizeArea(area) {
  return String(area || "")
    .split(/[,;/|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
}

export function classifyLocation(text, sourceLevel, homeArea = "Pagar, Tongi, Gazipur") {
  const hay = String(text || "").toLowerCase();
  const homeTokens = tokenizeArea(homeArea);
  // Most-specific home tokens (first two parts) count as local area.
  const specific = homeTokens.slice(0, 2);

  if (specific.length && specific.some((t) => hay.includes(t))) {
    return { level: "local_area", name: pickName(hay, [...specific, ...LOCAL_AREA], homeArea) };
  }
  if (includesAny(hay, LOCAL_AREA)) {
    return { level: "local_area", name: pickName(hay, LOCAL_AREA, "Tongi") };
  }
  if (includesAny(hay, CITY)) {
    return { level: "city", name: pickName(hay, CITY, "Gazipur") };
  }
  // A local outlet may still cover other districts; only trust the text.
  if (includesAny(hay, COUNTRY) || sourceLevel === "country") {
    if (looksForeign(hay) && !includesAny(hay, COUNTRY)) {
      return { level: "world", name: "World" };
    }
    return { level: "country", name: pickName(hay, COUNTRY, "Bangladesh") };
  }
  if (looksForeign(hay)) {
    return { level: "world", name: "World" };
  }
  if (sourceLevel === "world") return { level: "world", name: "World" };
  return { level: "country", name: "Bangladesh" };
}

function looksForeign(hay) {
  const foreign = [
    "ukraine", "russia", "gaza", "israel", "iran", "washington", "white house",
    "beijing", "moscow", "london", "paris", "brussels", "nato", "pentagon",
    "trump", "putin", "netanyahu", "zelensky", "european union",
    "united states", "u.s.", "ukrain", "yemen", "sudan", "myanmar junta",
  ];
  const hasBd = includesAny(hay, ["bangladesh", "বাংলাদেশ", "dhaka", "ঢাকা", "gazipur", "tongi"]);
  return !hasBd && includesAny(hay, foreign);
}

function pickName(hay, list, fallback) {
  const hit = list.find((t) => hay.includes(t));
  if (!hit) return fallback;
  const pretty = {
    pagar: "Pagar",
    পাগার: "Pagar",
    tongi: "Tongi",
    টঙ্গী: "Tongi",
    টাঙ্গী: "Tongi",
    gazipur: "Gazipur",
    গাজীপুর: "Gazipur",
    joydebpur: "Joydebpur",
    জয়দেবপুর: "Joydebpur",
    bangladesh: "Bangladesh",
    বাংলাদেশ: "Bangladesh",
    dhaka: "Dhaka",
    ঢাকা: "Dhaka",
    "nishat nagar": "Nishat Nagar",
    "board bazar": "Board Bazar",
    kashimpur: "Kashimpur",
    konabari: "Konabari",
    pubail: "Pubail",
    kaliakair: "Kaliakair",
    kapasia: "Kapasia",
    sreepur: "Sreepur",
    kaliganj: "Kaliganj",
  };
  return pretty[hit] || fallback;
}

export function geoScoreFor(level) {
  return GEO_SCORES[level] || 20;
}
