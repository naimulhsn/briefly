const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  user: null,
  prefs: null,
  meta: null,
};

const LEVEL_LABEL = {
  local_area: "Local area",
  city: "City / district",
  country: "Bangladesh",
  world: "World",
};
const LEGAL_LABEL = {
  reported_criminal_act: "Reported criminal act",
  court_legal_action: "Court / legal action",
  police_action: "Police action",
  political_statement: "Political statement",
  announcement: "Announcement",
  accident: "Accident",
  other: "Other",
};
const CAT_LABEL = {
  politics: "Politics",
  crime: "Crime",
  accident: "Accident",
  economy: "Economy",
  health: "Health",
  education: "Education",
  environment: "Environment",
  labor: "Labor",
  international: "International",
  sports: "Sports",
  culture: "Culture",
  technology: "Technology",
  disaster: "Disaster",
  corruption: "Corruption",
  law_and_justice: "Law & justice",
  other: "Other",
};
const ROLE_LABEL = {
  alleged_perpetrator: "alleged perpetrator",
  victim: "reported victim",
  mentioned: "mentioned",
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function route() {
  const hash = location.hash.slice(1) || "/";
  const [path, qs] = hash.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  return { path: "/" + (parts.join("/") || ""), parts, params };
}

function navActive() {
  const { path } = route();
  $$(".nav a").forEach((a) => {
    const href = a.getAttribute("href").slice(1) || "/";
    a.classList.toggle("active", href === path || (href !== "/" && path.startsWith(href)));
  });
}

function renderAuth() {
  const slot = $("#authSlot");
  if (state.user) {
    slot.innerHTML = `<a href="#/settings">${esc(state.user.name)}</a>
      · <button class="linkish" id="logoutBtn" type="button">Sign out</button>`;
    $("#logoutBtn").onclick = async () => {
      await api("/api/auth/logout", { method: "POST" });
      state.user = null;
      state.prefs = null;
      renderAuth();
      render();
    };
  } else {
    slot.innerHTML = `<a href="#/login">Sign in</a> · <a href="#/signup">Create account</a>`;
  }
}

function dhakaTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso)) + " Dhaka time";
  } catch {
    return iso;
  }
}

function badges(s) {
  const bits = [];
  bits.push(`<span class="badge ${esc(s.location_level)}">${esc(LEVEL_LABEL[s.location_level] || s.location_level)}${s.location_name ? " · " + esc(s.location_name) : ""}</span>`);
  if (s.category) bits.push(`<span class="badge ${esc(s.category)}">${esc(CAT_LABEL[s.category] || s.category)}</span>`);
  if (s.legal_label && s.legal_label !== "other") {
    bits.push(`<span class="badge ${esc(s.legal_label)}">${esc(LEGAL_LABEL[s.legal_label] || s.legal_label)}</span>`);
  }
  if (s.fact_checked) {
    const href = s.fact_check_url ? ` href="${esc(s.fact_check_url)}" target="_blank" rel="noopener"` : "";
    bits.push(`<span class="badge fact"><a${href}>Fact-checked${s.fact_check_source ? " · " + esc(s.fact_check_source) : ""}</a></span>`);
  }
  return `<div class="badges">${bits.join("")}</div>`;
}

function partyChips(parties) {
  if (!parties?.length) return "";
  return `<div class="parties">${parties
    .map((p) => {
      const cls = p.role === "alleged_perpetrator" ? "perp" : p.role === "victim" ? "victim" : "";
      return `<span class="chip ${cls}">${esc(p.name)} · ${esc(ROLE_LABEL[p.role] || p.role)}</span>`;
    })
    .join("")}</div>`;
}

function sourceLinks(sources) {
  const unique = [];
  const seen = new Set();
  for (const a of sources || []) {
    const key = a.source_name + a.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }
  if (!unique.length) return "";
  return `<div class="sources-row">Sources:
    ${unique
      .map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.source_name)}</a>`)
      .join('<span aria-hidden="true"> · </span>')}
  </div>`;
}

function storyCard(s, { heading = "h3" } = {}) {
  const facts = (s.key_facts || []).filter(Boolean);
  const bookmark = state.user
    ? `<button class="btn ghost small bookmark" data-id="${s.id}" type="button">${s.bookmarked ? "Saved" : "Save"}</button>`
    : "";
  return `<article class="story" data-id="${s.id}">
    ${badges(s)}
    <${heading}><a href="#/story/${s.id}">${esc(s.title)}</a></${heading}>
    <p class="summary">${esc(s.summary || "")}</p>
    ${facts.length ? `<ul class="facts">${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${s.source_differences ? `<p class="diff">${esc(s.source_differences)}</p>` : ""}
    ${s.law_suggestion || s.legal_note ? `<div class="legal-box">${s.legal_note ? `<p>${esc(s.legal_note)}</p>` : ""}${s.law_suggestion ? `<p>${esc(s.law_suggestion)}</p>` : ""}</div>` : ""}
    ${partyChips(s.parties)}
    <div class="story-foot">
      ${sourceLinks(s.sources)}
      <span>${esc(dhakaTime(s.published_at))} · ${s.article_count || s.sources?.length || 1} source${(s.article_count || 1) === 1 ? "" : "s"} ${bookmark}</span>
    </div>
  </article>`;
}

function bindBookmarks(root) {
  $$(".bookmark", root).forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const saved = btn.textContent.trim() === "Saved";
      if (saved) await api(`/api/bookmarks/${id}`, { method: "DELETE" });
      else await api(`/api/bookmarks/${id}`, { method: "POST" });
      btn.textContent = saved ? "Save" : "Saved";
    };
  });
}

function filtersHtml(params) {
  const opts = (obj, cur) =>
    Object.entries(obj)
      .map(([k, v]) => `<option value="${esc(k)}" ${cur === k ? "selected" : ""}>${esc(v)}</option>`)
      .join("");
  const parties = (state.meta?.parties || []).map((p) => p.name || p).filter(Boolean);
  const sources = [...new Set((state.meta?.sources || []).map((s) => s.name))];
  return `<aside class="filters" id="filters">
    <h2>Filter</h2>
    <label>Location</label>
    <select name="location">
      <option value="">All locations</option>
      ${opts(LEVEL_LABEL, params.get("location"))}
    </select>
    <label>Category</label>
    <select name="category">
      <option value="">All categories</option>
      ${opts(CAT_LABEL, params.get("category"))}
    </select>
    <label>Legal label</label>
    <select name="legal">
      <option value="">All labels</option>
      ${opts(LEGAL_LABEL, params.get("legal"))}
    </select>
    <label>Party</label>
    <select name="party">
      <option value="">All parties</option>
      ${parties.map((p) => `<option ${params.get("party") === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
    </select>
    <label>Source</label>
    <select name="source">
      <option value="">All sources</option>
      ${sources.map((p) => `<option ${params.get("source") === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
    </select>
    <label>From</label>
    <input type="date" name="from" value="${esc(params.get("from") || "")}" />
    <label>To</label>
    <input type="date" name="to" value="${esc(params.get("to") || "")}" />
    <label>Sort</label>
    <select name="sort">
      <option value="priority" ${params.get("sort") !== "newest" && params.get("sort") !== "sources" ? "selected" : ""}>Local priority</option>
      <option value="newest" ${params.get("sort") === "newest" ? "selected" : ""}>Newest</option>
      <option value="sources" ${params.get("sort") === "sources" ? "selected" : ""}>Most sources</option>
    </select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px;">
      <input type="checkbox" name="fact_checked" ${params.get("fact_checked") === "1" ? "checked" : ""} />
      Fact-checked only
    </label>
    <div class="filter-actions">
      <button class="btn small" type="button" id="applyFilters">Apply</button>
      <button class="btn ghost small" type="button" id="clearFilters">Clear</button>
    </div>
  </aside>`;
}

function collectFilters() {
  const f = $("#filters");
  const p = new URLSearchParams();
  const q = $("input[name=q]")?.value?.trim();
  if (q) p.set("q", q);
  if (!f) return p;
  for (const name of ["location", "category", "legal", "party", "source", "from", "to", "sort"]) {
    const v = f.querySelector(`[name="${name}"]`)?.value;
    if (v) p.set(name, v);
  }
  if (f.querySelector("[name=fact_checked]")?.checked) p.set("fact_checked", "1");
  return p;
}

async function renderFeed() {
  const { params } = route();
  const offset = Number(params.get("offset") || 0);
  const qs = new URLSearchParams(params);
  qs.set("limit", "20");
  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <h1>Today’s briefing</h1>
      <p class="lede">Stories are clustered across outlets, summarised in English, and ranked for ${esc(state.prefs?.home_area || "Pagar, Tongi, Gazipur")} first — then the rest of the country, then the world.</p>
      <p class="meta-line" id="runMeta"></p>
    </div>
    <div class="search-row">
      <input type="search" name="q" placeholder="Search stories, places, people…" value="${esc(params.get("q") || "")}" />
      <button class="btn" type="button" id="searchBtn">Search</button>
    </div>
    <button class="btn ghost small filter-toggle" id="filterToggle" type="button">Filters</button>
    <div class="layout">
      ${filtersHtml(params)}
      <div id="list"><p class="status">Loading briefing…</p></div>
    </div>`;

  const latest = state.meta?.latest_run;
  if (latest?.finished_at) {
    $("#runMeta").textContent = `Last update ${dhakaTime(latest.finished_at)} · ${state.meta.counts?.stories || 0} stories from ${state.meta.counts?.articles || 0} articles`;
  }

  $("#filterToggle").onclick = () => $("#filters").classList.toggle("open");
  const go = () => {
    const p = collectFilters();
    location.hash = "#/?" + p.toString();
  };
  $("#applyFilters").onclick = go;
  $("#searchBtn").onclick = go;
  $("input[name=q]").addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  $("#clearFilters").onclick = () => {
    location.hash = "#/";
  };

  try {
    const data = await api("/api/stories?" + qs.toString());
    const list = $("#list");
    if (!data.stories.length) {
      list.innerHTML = `<p class="empty">No stories match these filters yet. ${state.meta?.counts?.stories ? "Try clearing a filter." : "The first briefing is still being prepared."}</p>`;
      return;
    }
    list.innerHTML = `<div class="story-list">${data.stories.map((s) => storyCard(s)).join("")}</div>
      <div class="pager">
        <button class="btn ghost small" ${offset <= 0 ? "disabled" : ""} id="prevPage">Previous</button>
        <span>${offset + 1}–${Math.min(offset + data.stories.length, data.total)} of ${data.total}</span>
        <button class="btn ghost small" ${offset + data.stories.length >= data.total ? "disabled" : ""} id="nextPage">Next</button>
      </div>`;
    bindBookmarks(list);
    $("#prevPage").onclick = () => {
      const p = new URLSearchParams(params);
      p.set("offset", Math.max(0, offset - 20));
      location.hash = "#/?" + p.toString();
    };
    $("#nextPage").onclick = () => {
      const p = new URLSearchParams(params);
      p.set("offset", offset + 20);
      location.hash = "#/?" + p.toString();
    };
  } catch (err) {
    $("#list").innerHTML = `<p class="error">Could not load stories. ${esc(err.message)}</p>`;
  }
}

async function renderStory(id) {
  const main = $("#main");
  main.innerHTML = `<p class="status">Loading story…</p>`;
  try {
    const { story } = await api(`/api/stories/${id}`);
    main.innerHTML = `<p class="back"><a href="#/">← Back to briefing</a></p>
      <article class="story story-detail">${storyCard(story, { heading: "h1" }).replace("<article class=\"story\"", "<div").replace("</article>", "</div>")}</article>`;
    // Fix: storyCard wraps in article - that's ok actually. Let me just use storyCard.
    main.innerHTML = `<p class="back"><a href="#/">← Back to briefing</a></p>
      ${storyCard(story, { heading: "h1" }).replace("<h1>", '<div class="page-head"><h1>').replace("</h1>", "</h1></div>")}`;
    bindBookmarks(main);
  } catch {
    main.innerHTML = `<p class="error">That story was not found.</p>`;
  }
}

function barRows(rows, key, val, cls = "") {
  const max = Math.max(1, ...rows.map((r) => r[val] || r.count || 0));
  return rows
    .map((r) => {
      const n = r[val] || r.count || 0;
      const label = r[key];
      const pretty = LEVEL_LABEL[label] || LEGAL_LABEL[label] || CAT_LABEL[label] || label;
      return `<div class="bar-row"><span>${esc(pretty)}</span><div class="bar ${cls}"><span style="width:${(n / max) * 100}%"></span></div><span>${n}</span></div>`;
    })
    .join("");
}

async function renderStats() {
  const { params } = route();
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <h1>Statistics</h1>
      <p class="lede">Counts of reported party roles, topics and places. These are extracted from coverage, not findings of guilt.</p>
    </div>
    <form class="range" id="rangeForm">
      <div class="field"><label>From</label><input type="date" name="from" value="${esc(from)}" /></div>
      <div class="field"><label>To</label><input type="date" name="to" value="${esc(to)}" /></div>
      <button class="btn" type="submit">Update</button>
    </form>
    <p class="status" id="statLoad">Loading…</p>
    <div id="statBody"></div>`;
  $("#rangeForm").onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    const f = e.target.from.value;
    const t = e.target.to.value;
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    location.hash = "#/stats" + (p.toString() ? "?" + p : "");
  };
  try {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const data = await api("/api/stats?" + qs.toString());
    $("#statLoad").remove();
    const matrix = data.party_matrix || [];
    $("#statBody").innerHTML = `
      <div class="stat-grid">
        <section class="panel">
          <h2>Parties and reported roles</h2>
          <p class="help">${esc(data.disclaimer)}</p>
          <table class="data">
            <thead><tr><th>Party</th><th>Alleged perpetrator</th><th>Reported victim</th><th>Mentioned</th><th>Total</th></tr></thead>
            <tbody>
              ${
                matrix.length
                  ? matrix
                      .map(
                        (r) =>
                          `<tr><td>${esc(r.party)}</td><td>${r.alleged_perpetrator}</td><td>${r.victim}</td><td>${r.mentioned}</td><td>${r.total}</td></tr>`
                      )
                      .join("")
                  : "<tr><td colspan='5'>No party tags in this range.</td></tr>"
              }
            </tbody>
          </table>
        </section>
        <section class="panel">
          <h2>By category</h2>
          ${barRows(data.by_category, "category", "count")}
        </section>
        <section class="panel">
          <h2>By location</h2>
          ${barRows(data.by_location, "location", "count", "teal")}
        </section>
        <section class="panel">
          <h2>By legal label</h2>
          ${barRows(data.by_legal, "legal_label", "count", "navy")}
        </section>
        <section class="panel" style="grid-column:1/-1">
          <h2>Stories by day</h2>
          ${barRows(data.by_day, "day", "count", "teal")}
          <p class="help">${data.fact_checked?.checked || 0} of ${data.fact_checked?.total || 0} stories in this range carry a fact-check badge.</p>
        </section>
      </div>`;
  } catch (err) {
    $("#statLoad").textContent = "Could not load statistics. " + err.message;
  }
}

async function renderSaved() {
  const main = $("#main");
  if (!state.user) {
    main.innerHTML = `<div class="page-head"><h1>Saved stories</h1><p class="lede">Sign in to keep a private reading list.</p></div>
      <p><a class="btn" href="#/login">Sign in</a></p>`;
    return;
  }
  main.innerHTML = `<div class="page-head"><h1>Saved stories</h1></div><p class="status">Loading…</p>`;
  try {
    const data = await api("/api/bookmarks");
    if (!data.stories.length) {
      main.innerHTML = `<div class="page-head"><h1>Saved stories</h1><p class="lede">Nothing saved yet. Open a story and press Save.</p></div>`;
      return;
    }
    main.innerHTML = `<div class="page-head"><h1>Saved stories</h1></div>
      <div class="story-list">${data.stories.map((s) => storyCard(s)).join("")}</div>`;
    bindBookmarks(main);
  } catch (err) {
    main.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

async function renderSettings() {
  const main = $("#main");
  if (!state.user) {
    location.hash = "#/login";
    return;
  }
  const p = state.prefs || (await api("/api/prefs")).prefs;
  state.prefs = p;
  main.innerHTML = `<div class="settings-card">
    <h1>Preferences</h1>
    <p class="help">Stories matching your home area rise to the top. Categories and parties you follow are boosted. Muted words are hidden.</p>
    <form id="prefsForm">
      <div class="field"><label>Home area</label>
        <input name="home_area" value="${esc(p.home_area || "Pagar, Tongi, Gazipur")}" />
      </div>
      <div class="field"><label>Followed categories (comma-separated)</label>
        <input name="categories" value="${esc((p.categories || []).join(", "))}" placeholder="politics, crime, labor" />
      </div>
      <div class="field"><label>Followed parties</label>
        <input name="followed_parties" value="${esc((p.followed_parties || []).join(", "))}" placeholder="BNP, NCP" />
      </div>
      <div class="field"><label>Followed sources</label>
        <input name="followed_sources" value="${esc((p.followed_sources || []).join(", "))}" placeholder="The Daily Star, Prothom Alo" />
      </div>
      <div class="field"><label>Muted topics</label>
        <input name="muted_topics" value="${esc((p.muted_topics || []).join(", "))}" placeholder="sports, celebrity" />
      </div>
      <p class="form-error" id="prefsErr" hidden></p>
      <button class="btn" type="submit">Save preferences</button>
    </form>
  </div>`;
  $("#prefsForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const split = (k) =>
      String(fd.get(k) || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    try {
      const data = await api("/api/prefs", {
        method: "PUT",
        body: {
          home_area: fd.get("home_area"),
          categories: split("categories"),
          followed_parties: split("followed_parties"),
          followed_sources: split("followed_sources"),
          muted_topics: split("muted_topics"),
        },
      });
      state.prefs = data.prefs;
      $("#prefsErr").hidden = false;
      $("#prefsErr").style.color = "var(--trust)";
      $("#prefsErr").textContent = "Saved.";
    } catch (err) {
      $("#prefsErr").hidden = false;
      $("#prefsErr").textContent = err.message;
    }
  };
}

function renderSources() {
  const sources = state.meta?.sources || [];
  const groups = { local: [], national: [], factcheck: [], world: [] };
  for (const s of sources) (groups[s.type] || groups.national).push(s);
  const block = (title, list) =>
    `<h2>${esc(title)}</h2>
     <div class="source-list">${list
       .map(
         (s) => `<article class="source-card">
           <h3>${s.homepage ? `<a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</h3>
           <p>${esc(s.language === "bn" ? "Bangla" : "English")}${s.via === "google-news" ? " · via Google News RSS" : " · RSS"} · ${esc(s.location_level || "")}</p>
         </article>`
       )
       .join("")}</div>`;
  $("#main").innerHTML = `<div class="page-head">
      <h1>Sources</h1>
      <p class="lede">National papers and broadcasters, Gazipur and Tongi outlets, fact-checkers, and a short world desk. Where a site has no open RSS feed, we use a Google News site search and still credit the original outlet.</p>
    </div>
    ${block("Local — Gazipur & Tongi", groups.local)}
    ${block("National", groups.national)}
    ${block("Fact-checkers", groups.factcheck)}
    ${block("World", groups.world)}`;
}

function renderAbout() {
  $("#main").innerHTML = `<div class="page-head">
    <h1>About Briefly</h1>
    <p class="lede">Most of us cannot read every version of every story. Briefly gathers the day’s reporting, groups the same event into one card, and writes a short English summary.</p>
  </div>
  <div class="panel" style="max-width:70ch">
    <p>Priority is geographic: news from your home area first (default: Pagar, Tongi), then Gazipur, then Bangladesh, then the world. You can change that in preferences after you create an account.</p>
    <p>Each card carries a topic label and a legal-nature label — so a political speech is not filed next to a reported abduction. When a Bangladesh law may apply, we show it as <em>possibly applicable, alleged or reported until confirmed</em>. The app never declares guilt.</p>
    <p>If a fact-checker such as Rumor Scanner, Dismislab, Fact-Watch, BOOM Bangladesh or AFP has covered the claim, the card gets a badge and a link.</p>
    <p>The briefing is refreshed twice a day, at 6:00 and 18:00 Asia/Dhaka time.</p>
    <p>Source articles may be in Bangla or English; summaries and labels are always in English.</p>
  </div>`;
}

function renderAuthForm(kind) {
  const isSignup = kind === "signup";
  $("#main").innerHTML = `<form class="auth-card" id="authForm">
    <h1>${isSignup ? "Create an account" : "Sign in"}</h1>
    <p class="help">${isSignup ? "Your briefing will use Pagar, Tongi, Gazipur as the default home area. You can change it later." : "Welcome back."}</p>
    ${isSignup ? `<div class="field"><label>Name</label><input name="name" required minlength="2" autocomplete="name" /></div>` : ""}
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" /></div>
    <div class="field"><label>Password</label><input name="password" type="password" required minlength="8" autocomplete="${isSignup ? "new-password" : "current-password"}" /></div>
    <p class="form-error" id="authErr" hidden></p>
    <button class="btn" type="submit">${isSignup ? "Create account" : "Sign in"}</button>
    <p class="help" style="margin-top:16px">${
      isSignup ? `Already have an account? <a href="#/login">Sign in</a>` : `New here? <a href="#/signup">Create an account</a>`
    }</p>
  </form>`;
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { email: fd.get("email"), password: fd.get("password") };
    if (isSignup) body.name = fd.get("name");
    try {
      const data = await api(isSignup ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body });
      state.user = data.user;
      try {
        state.prefs = (await api("/api/prefs")).prefs;
      } catch {
        /* ignore */
      }
      renderAuth();
      location.hash = "#/";
    } catch (err) {
      $("#authErr").hidden = false;
      $("#authErr").textContent = err.message;
    }
  };
}

async function render() {
  navActive();
  const { path, parts } = route();
  if (path === "/") return renderFeed();
  if (path.startsWith("/story/") && parts[1]) return renderStory(parts[1]);
  if (path === "/stats") return renderStats();
  if (path === "/saved") return renderSaved();
  if (path === "/settings") return renderSettings();
  if (path === "/sources") return renderSources();
  if (path === "/about") return renderAbout();
  if (path === "/login") return renderAuthForm("login");
  if (path === "/signup") return renderAuthForm("signup");
  $("#main").innerHTML = `<p class="empty">Page not found. <a href="#/">Go to the briefing</a>.</p>`;
}

$("#menuBtn").onclick = () => document.body.classList.toggle("nav-open");
$$(".nav a").forEach((a) =>
  a.addEventListener("click", () => document.body.classList.remove("nav-open"))
);

window.addEventListener("hashchange", render);

(async function boot() {
  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    if (state.user) {
      try {
        state.prefs = (await api("/api/prefs")).prefs;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* signed out */
  }
  try {
    state.meta = await api("/api/stats/meta");
  } catch {
    state.meta = { sources: [], parties: [], counts: {} };
  }
  renderAuth();
  render();
})();
