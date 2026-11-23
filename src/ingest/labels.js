/** Heuristic category, legal-label, and party tagging (Bangla + English). */

export const CATEGORIES = [
  "politics",
  "crime",
  "accident",
  "economy",
  "health",
  "education",
  "environment",
  "labor",
  "international",
  "sports",
  "culture",
  "technology",
  "disaster",
  "corruption",
  "law_and_justice",
  "other",
];

export const LEGAL_LABELS = [
  "reported_criminal_act",
  "court_legal_action",
  "police_action",
  "political_statement",
  "announcement",
  "accident",
  "other",
];

export const LEGAL_LABEL_TITLES = {
  reported_criminal_act: "Reported criminal act",
  court_legal_action: "Court / legal action",
  police_action: "Police action",
  political_statement: "Political statement",
  announcement: "Announcement",
  accident: "Accident",
  other: "Other",
};

export const PARTIES = [
  {
    name: "Awami League",
    aliases: [
      "awami league", "awami-league", "bangladesh awami",
      "আওয়ামী লীগ", "আওয়ামী লীগ", "আ'লীগ", "আ’লীগ", "আ.লীগ", "আওয়ামীলীগ", "আওয়ামীলীগ",
      "chhatra league", "chatra league", "ছাত্রলীগ", "ছাত্র লীগ",
      "jubo league", "যুবলীগ", "যুব লীগ",
    ],
  },
  {
    name: "BNP",
    aliases: [
      "bnp", "bangladesh nationalist party", "nationalist party",
      "বিএনপি", "বাংলাদেশ জাতীয়তাবাদী দল", "বাংলাদেশ জাতীয়তাবাদী দল",
      "jubo dal", "jubodal", "যুবদল", "যুব দল",
      "chhatra dal", "chatra dal", "ছাত্রদল", "ছাত্র দল",
    ],
  },
  {
    name: "Jamaat-e-Islami",
    aliases: [
      "jamaat-e-islami", "jamaat-e-islam", "jamaat", "jamaate islami",
      "জামায়াতে ইসলামী", "জামায়াতে ইসলামী", "জামায়াত", "জামায়াত",
      "shibir", "chhatra shibir", "ছাত্রশিবির", "ছাত্র শিবির", "শিবির",
    ],
  },
  {
    name: "NCP",
    aliases: [
      "national citizen party", "national citizens party", " ncp ",
      "জাতীয় নাগরিক পার্টি", "জাতীয় নাগরিক পার্টি", "এনসিপি",
    ],
  },
  {
    name: "Jatiya Party",
    aliases: [
      "jatiya party", "jatiyo party", "erashad",
      "জাতীয় পার্টি", "জাতীয় পার্টি",
    ],
  },
  {
    name: "Islami Andolan",
    aliases: ["islami andolan", "ইসলামী আন্দোলন", "islami andolon"],
  },
  {
    name: "Workers Party",
    aliases: ["workers party", "ওয়ার্কার্স পার্টি", "ওয়ার্কার্স পার্টি"],
  },
  {
    name: "Gono Odhikar Parishad",
    aliases: ["gono odhikar", "গণঅধিকার পরিষদ", "গণ অধিকার"],
  },
  {
    name: "AB Party",
    aliases: ["ab party", "এবি পার্টি"],
  },
];

const CATEGORY_RULES = [
  ["disaster", ["flood", "cyclone", "earthquake", "landslide", "heatwave", "বন্যা", "ঘূর্ণিঝড়", "ঘূর্ণিঝড়", "ভূমিকম্প", "ভূমিধস", "SIDR", "remal"]],
  ["accident", ["accident", "crash", "collision", "derail", "drowned", "fired broke out", "building collapse", "দুর্ঘটনা", "সংঘর্ষে নিহত", "বাস উল্টে", "অগ্নিকাণ্ড", "অগ্নিকাণ্ডে", "ডুবে মারা"]],
  ["crime", ["murder", "killed", "stabbed", "robbery", "dacoity", "abduct", "kidnap", "rape", "assault", "hijack", "theft", "extortion", "gunned", "shot dead", "হত্যা", "খুন", "ছাইনতাই", "ছিনতাই", "ডাকাতি", "অপহরণ", "ধর্ষণ", "লুট", "চাঁদা", "গুম", "hamla", "হামলা", "কুপিয়ে", "কুপিয়ে"]],
  ["corruption", ["corruption", "bribe", "embezzle", "acc", "nacc", "দুর্নীতি", "ঘুষ", "মানিলন্ডারিং", "money laundering"]],
  ["law_and_justice", ["court", "verdict", "bail", "indictment", "tribunal", "high court", "supreme court", "আদালত", "রায়", "রায়", "জামিন", "ট্রাইব্যুনাল", "হাইকোর্ট", "সুপ্রিম কোর্ট", "মামলা"]],
  ["labor", ["worker", "wages", "garment", "strike", "trade union", "শ্রমিক", "মজুরি", "গার্মেন্ট", "ধর্মঘট", "পোশাক শিল্প"]],
  ["health", ["hospital", "dengue", "cholera", "covid", "vaccine", "doctor", "outbreak", "হাসপাতাল", "ডেঙ্গু", "টিকা", "চিকিৎসা", "রোগী"]],
  ["education", ["university", "school", "ssc", "hsc", "admission", "student protest", "বিশ্ববিদ্যালয়", "বিশ্ববিদ্যালয়", "স্কুল", "কলেজ", "ভর্তি", "এসএসসি", "এইচএসসি"]],
  ["economy", ["inflation", "economy", "bank", "export", "import", "budget", "tax", "remittance", "share market", "মূল্যস্ফীতি", "অর্থনীতি", "বাজেট", "রপ্তানি", "রেমিট্যান্স", "শেয়ার", "শেয়ার"]],
  ["environment", ["pollution", "river grab", "deforestation", "air quality", "দূষণ", "নদী দখল", "বন উজাড়"]],
  ["technology", ["cyber", "internet", "telecom", "ai ", "startup", "সাইবার", "ইন্টারনেট"]],
  ["sports", ["cricket", "football", "world cup", "bcb", "premier league", "ক্রিকেট", "ফুটবল", "বিশ্বকাপ", "খেলা"]],
  ["culture", ["film", "music", "cinema", "artist", "book fair", "চলচ্চিত্র", "সিনেমা", "সঙ্গীত", "গ্রন্থমেলা", "পূজা", "ঈদ"]],
  ["international", ["united nations", "ukraine", "gaza", "israel", "washington", "beijing", "myanmar", "india ", "pakistan", "আন্তর্জাতিক"]],
  ["politics", ["election", "minister", "parliament", "party", "rally", "protest", "interim government", "advisor", "vote", "campaign", "নির্বাচন", "মন্ত্রী", "সংসদ", "সমাবেশ", "আন্দোলন", "উপদেষ্টা", "সরকার", "রাজনীতি"]],
];

const CRIME_LAWS = [
  { keys: ["murder", "killed", "homicide", "হত্যা", "খুন", "shot dead", "hacked to death"], law: "Penal Code 1860, ss. 299–302 (murder / culpable homicide)", act: "murder or culpable homicide" },
  { keys: ["rape", "ধর্ষণ"], law: "Penal Code 1860, ss. 375–376 (rape); Women and Children Repression Prevention Act 2000", act: "rape" },
  { keys: ["abduct", "kidnap", "অপহরণ", "গুম"], law: "Penal Code 1860, ss. 359–368 (kidnapping and abduction)", act: "kidnapping or abduction" },
  { keys: ["hijack", "highway robbery", "হাইজ্যাক"], law: "Penal Code 1860, ss. 390–392 (robbery); may also engage special statutes depending on the vehicle or context", act: "hijacking / robbery" },
  { keys: ["dacoity", "ডাকাতি"], law: "Penal Code 1860, ss. 391, 395 (dacoity)", act: "dacoity" },
  { keys: ["robbery", "ছিনতাই", "ছাইনতাই", "লুট"], law: "Penal Code 1860, ss. 390–392 (robbery) or s. 379 (theft)", act: "robbery or theft" },
  { keys: ["assault", "stabbed", "beaten", "হামলা", "মারধর", "কুপিয়ে", "কুপিয়ে", "grievous"], law: "Penal Code 1860, ss. 319–326 (hurt / grievous hurt) and ss. 351–355 (assault)", act: "assault or hurt" },
  { keys: ["arson", "set on fire", "অগ্নিসংযোগ"], law: "Penal Code 1860, ss. 435–436 (mischief by fire)", act: "arson" },
  { keys: ["extortion", "চাঁদা"], law: "Penal Code 1860, ss. 383–384 (extortion)", act: "extortion" },
  { keys: ["fraud", "cheat", "scam", "প্রতারণা"], law: "Penal Code 1860, ss. 415–420 (cheating)", act: "cheating / fraud" },
  { keys: ["riot", "danga", "দাঙ্গা"], law: "Penal Code 1860, ss. 146–148 (rioting)", act: "rioting" },
  { keys: ["drug", "narcotic", "মাদক", "yaba", "ইয়াবা"], law: "Narcotics Control Act 2018 (as applicable)", act: "narcotics offence" },
  { keys: ["corruption", "bribe", "দুর্নীতি", "ঘুষ"], law: "Penal Code 1860, ss. 161–165A and the Prevention of Corruption Act 1947; ACC Act 2004", act: "corruption or bribery" },
];

const COURT_KEYS = ["court", "verdict", "bail", "sentenced", "tribunal", "indicted", "charges framed", "আদালত", "রায়", "রায়", "জামিন", "সাজা", "ত্রাইব্যুনাল", "ট্রাইব্যুনাল", "মামলা"];
const POLICE_KEYS = ["police", "rabs", "arrested", "raid", "detained", "remand", "পুলিশ", "র‌্যাব", "গ্রেফতার", "গ্রেপ্তার", "অভিযান", "রিমান্ড", "আটক"];
const STATEMENT_KEYS = ["said", "says", "told reporters", "speech", "rally", "called for", "demanded", "criticized", "announced", "বলেন", "মন্তব্য", "সমাবেশ", "দাবি", "ঘোষণা", "সমালোচনা"];
const ACCIDENT_KEYS = ["accident", "crash", "collision", "drowned", "lightning", "দুর্ঘটনা", "সংঘর্ষ", "ডুবে"];

function includesAny(text, keys) {
  return keys.some((k) => text.includes(k));
}

export function detectParties(text) {
  const hay = ` ${String(text || "").toLowerCase()} `;
  const found = [];
  for (const party of PARTIES) {
    if (party.aliases.some((a) => hay.includes(a.toLowerCase()))) {
      found.push(party.name);
    }
  }
  return found;
}

export function inferPartyRoles(text, parties) {
  const hay = String(text || "").toLowerCase();
  const victimHints = ["attacked", "assaulted", "killed", "victim", "targeted", "shot", "hacked", "হত্যা", "আক্রমণ", "হামলা", "নিহত", "আহত", "শিকার"];
  const perpHints = ["attacked a", "hacked", "opened fire", "vandal", "set fire", "stabbed", "shot dead", "হামলা করে", "অগ্নিসংযোগ", "ভাঙচুর", "গুলি"];
  return parties.map((name) => {
    const around = hay; // document-level heuristic only
    let role = "mentioned";
    if (includesAny(around, victimHints) && includesAny(around, [name.toLowerCase(), ...partyAliases(name)])) {
      // If both victim and perp hints exist, default to mentioned — AI should refine.
      if (!includesAny(around, perpHints)) role = "victim";
    }
    return { name, role };
  });
}

function partyAliases(name) {
  return (PARTIES.find((p) => p.name === name)?.aliases || []).map((a) => a.toLowerCase());
}

export function classifyCategory(text) {
  const hay = String(text || "").toLowerCase();
  for (const [cat, keys] of CATEGORY_RULES) {
    if (includesAny(hay, keys)) return cat;
  }
  return "other";
}

export function classifyLegal(text) {
  const hay = String(text || "").toLowerCase();
  const lawHit = CRIME_LAWS.find((r) => includesAny(hay, r.keys));
  const isCourt = includesAny(hay, COURT_KEYS);
  const isPolice = includesAny(hay, POLICE_KEYS);
  const isAccident = includesAny(hay, ACCIDENT_KEYS) && !lawHit;
  const isStatement = includesAny(hay, STATEMENT_KEYS);

  if (lawHit && !isAccident) {
    return {
      legal_label: "reported_criminal_act",
      legal_note:
        `Sources report an alleged ${lawHit.act}. This is a reported account, not a finding of guilt.`,
      law_suggestion:
        `Possibly applicable, alleged/reported until confirmed: Bangladesh ${lawHit.law}. The app does not declare anyone guilty.`,
    };
  }
  if (isCourt) {
    return {
      legal_label: "court_legal_action",
      legal_note: "Coverage of a court process, filing, or judgment. Treat parties as alleged until a final judgment says otherwise.",
      law_suggestion: null,
    };
  }
  if (isPolice) {
    return {
      legal_label: "police_action",
      legal_note: "Coverage of a police or law-enforcement operation. An arrest is not a conviction.",
      law_suggestion: null,
    };
  }
  if (isAccident) {
    return {
      legal_label: "accident",
      legal_note: "Reported as an accident rather than an intentional criminal act.",
      law_suggestion: null,
    };
  }
  if (isStatement) {
    return {
      legal_label: "political_statement",
      legal_note: "A statement, speech, rally, or political claim — not in itself a criminal act.",
      law_suggestion: null,
    };
  }
  return { legal_label: "other", legal_note: null, law_suggestion: null };
}

export function heuristicProcess(clusterText, title) {
  const blob = `${title || ""}\n${clusterText || ""}`;
  const category = classifyCategory(blob);
  const legal = classifyLegal(blob);
  const parties = inferPartyRoles(blob, detectParties(blob));
  return { category, ...legal, parties };
}

export const DISCLAIMER =
  "Labels are based on published reports. Criminal tags are alleged/reported until confirmed by police or a court. This app never declares guilt.";
