/* 제주 청년 문화예술 공급·수요 대시보드 — data.js(window.CULT)를 읽어 필터·지표·차트를 갱신한다. */
(function () {
  "use strict";
  const D = window.CULT;
  const $ = (id) => document.getElementById(id);
  if (!D) {
    document.querySelector(".main").innerHTML = '<p class="notice">data.js를 찾을 수 없습니다. scripts/build_data.py를 먼저 실행하세요.</p>';
    return;
  }
  const HAS_CHART = typeof window.Chart !== "undefined";
  const HAS_L = typeof window.L !== "undefined";

  // ---------- 공통 유틸 ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 표기 규칙: 집계표에 값이 없으면 NA, 개별 행의 정보가 비어 있으면 UNK
  const NA = "집계 자료 없음", UNK = "알 수 없음";
  const f1 = (v, d = 1) => (v == null || !Number.isFinite(+v) ? NA : Number(v).toFixed(d));
  const pct = (v, d = 1) => (v == null ? NA : f1(v, d) + "%");
  const int = (v) => (v == null ? NA : Math.round(v).toLocaleString("ko-KR"));
  const naBox = (why) => `<p class="na-box"><b>${NA}</b>${why ? `<small>${esc(why)}</small>` : ""}</p>`;
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
  // 색약 검증(validate_palette)을 통과한 조합: 최근 관람(파랑)↔희망(분홍) ΔE 13.9, 공연(보라)↔전시(청록) ΔE 19.9
  const C = { purple: "#6d4fd8", pink: "#e0569b", view: "#1f4e9c", teal: "#14a3a0", amber: "#e8962e", gray: "#b9b4cc" };
  const YEAR_COLORS = { 2023: "#b9b4cc", 2024: "#6d4fd8", 2025: "#e0569b", 2026: "#b8720f" };
  if (HAS_CHART) {
    Chart.defaults.font.family = '"Pretendard", "Malgun Gothic", sans-serif';
    Chart.defaults.color = "#6b6488";
    Chart.defaults.borderColor = "#ece8f8";
  }
  function table(cols, rows, hlFn) {
    if (!rows.length) return '<p class="fine">표시할 데이터가 없습니다.</p>';
    const th = cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
    const tr = rows.map((r, i) => `<tr class="${hlFn && hlFn(r) ? "hl" : ""}"${r._id ? ` data-id="${esc(r._id)}"` : ""}>` +
      cols.map((c) => `<td class="${c.num ? "num" : ""}${c.cls ? " " + c.cls : ""}">${c.html ? c.html(r, i) : esc(c.get(r, i))}</td>`).join("") + "</tr>").join("");
    return `<div class="tbl-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }
  const html = (id, s) => { $(id).innerHTML = s; };
  function show(id, msg) { const el = $(id); el.hidden = !msg; if (msg) el.innerHTML = msg; }

  const charts = {};
  function drawChart(key, canvasId, cfg) {
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    const cv = $(canvasId);
    cv.parentElement.hidden = !cfg || !HAS_CHART;
    if (!cfg || !HAS_CHART) return;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, cfg.options);
    charts[key] = new Chart(cv, cfg);
  }

  // 마우스를 올렸을 때의 설명. EX[차트 id](행) → {what, num: 비교수(분자), den: 기준수(분모), note}
  const EX = {};
  // 계산식 줄: 비율이면 '이름 = 비교수 ÷ 기준수 × 100', 건수면 '비율이 아닌 건수'를 밝힌다
  const tipLines = (x) => (x ? "<hr>" + [x.what, x.f && `<b>계산식</b> ${x.f}`, x.calc && `<b>계산</b> ${x.calc}`, x.num && `<b>비교수(분자)</b> ${x.num}`, x.den && `<b>기준수(분모)</b> ${x.den}`, x.note].filter(Boolean).map((t) => `<small>${t}</small>`).join("<br>") : "");
  const RT = (name, num, den, mult = " × 100") => `${name} = ${num} ÷ ${den}${mult}`;
  const PCT = (a, b, u = "") => (a != null && b ? `${int(a)}${u} ÷ ${int(b)}${u} × 100 = ${f1((a / b) * 100)}%` : "");
  const COUNT = "비율이 아닌 건수라 분모가 없습니다";
  const explain = (id, r) => (EX[id] ? tipLines(EX[id](r || {})) : "");
  const setTip = (id, h) => { const el = $(id); (el.closest(".card") || el).setAttribute("data-tip", h); };

  // 가로 막대: rows = {k, v, hl, ref, tip}. o: {cls, fmt, max, naWhy}
  function hbars(id, rows, o = {}) {
    const fmtv = o.fmt || ((v) => pct(v));
    if (!rows.length || rows.every((r) => r.v == null)) { html(id, naBox(o.naWhy)); return; }
    const vals = rows.map((r) => Math.max(r.v || 0, r.ref || 0));
    const max = o.max || Math.max(...vals, 1e-9);
    const body = rows.map((r) => {
      if (r.v == null) return `<li class="na" data-tip="${esc(`<b>${esc(r.k)}</b><br>${NA}` + explain(id, r))}"><span class="hb-k">${esc(r.k)}</span><span class="hb-t"></span><span class="hb-v">${NA}</span></li>`;
      const tip = (r.tip || `<b>${esc(r.k)}</b><br>${esc(fmtv(r.v))}${r.ref != null ? `<br><small>세로선 값 ${esc(fmtv(r.ref))}</small>` : ""}`) + explain(id, r);
      return `<li class="${r.hl ? "hl" : ""} ${r.cls || ""}" data-tip="${esc(tip)}"><span class="hb-k">${esc(r.k)}</span><span class="hb-t"><i style="width:${(r.v / max) * 100}%"></i>` +
        (r.ref != null ? `<b class="hb-ref" style="left:${(r.ref / max) * 100}%"></b>` : "") + `</span><span class="hb-v">${esc(fmtv(r.v))}</span></li>`;
    }).join("");
    html(id, `<ul class="hb ${o.cls || ""}">${body}</ul>`);
  }
  // 두 값 막대: rows = {k, a, b}. o: {la, lb, ca, cb, fmt}
  function pairbars(id, rows, o) {
    const fmtv = o.fmt || ((v) => f1(v));
    if (!rows.length || rows.every((r) => r.a == null && r.b == null)) { html(id, naBox(o.naWhy)); return; }
    const max = Math.max(...rows.map((r) => Math.max(r.a || 0, r.b || 0)), 1e-9);
    const row = (v, c, lab, r, side) => `<div class="r" data-tip="${esc(`<b>${esc(r.k)}</b><br>${esc(lab)} ${v == null ? NA : esc(fmtv(v)) + (o.unit || "%")}` + explain(id, { ...r, side, v }))}"><div class="t">${v == null ? "" : `<i style="width:${(v / max) * 100}%;background:${c}"></i>`}</div><span class="v${v == null ? " na" : ""}">${esc(fmtv(v))}</span></div>`;
    html(id, `<div class="lg"><span><i style="background:${o.ca}"></i>${esc(o.la)}</span><span><i style="background:${o.cb}"></i>${esc(o.lb)}</span></div>` +
      `<ul class="pb">${rows.map((r) => `<li><span>${esc(r.k)}</span><div class="rows">${row(r.a, o.ca, o.la, r, "a")}${row(r.b, o.cb, o.lb, r, "b")}</div></li>`).join("")}</ul>`);
  }
  const ring = (p, label, sub, c, tip) => `<div class="ring-card"${tip ? ` data-tip="${esc(tip)}"` : ""}><div class="ring" style="--p:${p == null ? 0 : Math.min(100, p)};--c:${c}"><b class="${p == null ? "na" : ""}">${p == null ? NA : `${Math.round(p)}%`}</b></div><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;

  // ---------- 필터 ----------
  const FKEY = {
    period: { label: "기간", color: "#6d4fd8" }, genre: { label: "장르", color: "#d6336c" }, area: { label: "지역", color: "#0f9d94" },
    target: { label: "대상", color: "#e8590c" }, price: { label: "요금", color: "#2f6fe0" }, tour: { label: "상설", color: "#5f6b85" },
    year: { label: "연도", color: "#7a4fd0" }, group: { label: "청년 집단", color: "#b5179e" }, cohort: { label: "연령", color: "#c2410c" },
  };
  const GALL = "전체|전체(19~39세)", G1934 = "연령|19~34세";
  const MONTHS = [];
  for (let y = 2024, m = 8; y * 100 + m <= 202512;) { MONTHS.push(y * 100 + m); m++; if (m === 13) { y++; m = 1; } }
  const DEFAULT = { start: 202501, end: 202512, genre: "all", area: "all", target: "all", price: "all", tour: true, year: 2025, group: GALL, cohort: "20" };
  const S = Object.assign({ lmode: "main", dmode: "1", metric: "see_all", kmetric: "sold", apop: "제주 전 연령", wsel: null, detail: null }, DEFAULT);
  const GENRES = [["all", "전체 장르"], ["연극·뮤지컬", "연극+뮤지컬"], ["뮤지컬", "뮤지컬"], ["연극", "연극"], ["대중음악/연예", "대중음악/연예"], ["서양음악", "서양음악"],
    ["전통예술", "전통예술"], ["무용", "무용"], ["9분야 외(복합)", "복합(9분야 외)"], ["미술 전시회", "미술 전시회(공공 전시장 3곳)"], ["박물관 전시", "박물관 전시(국립제주박물관)"]];
  const AREAS = [["all", "전체 지역"], ["제주시", "제주시"], ["제주시|동", "제주시 동지역"], ["제주시|읍면", "제주시 읍면"], ["서귀포시", "서귀포시"], ["서귀포시|동", "서귀포시 동지역"], ["서귀포시|읍면", "서귀포시 읍면"]];
  const ymText = (m) => `${Math.floor(m / 100)}년 ${m % 100}월`;
  const ymShort = (m) => `${String(Math.floor(m / 100)).slice(2)}.${String(m % 100).padStart(2, "0")}`;
  const dS = () => `${Math.floor(S.start / 100)}-${String(S.start % 100).padStart(2, "0")}-01`;
  const dE = () => { const y = Math.floor(S.end / 100), m = S.end % 100; return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
  const groupOf = (id) => D.groups.find((g) => g.id === id);
  const cohortName = () => (S.cohort === "1934" ? "19~34세" : D.culture.cohorts[S.cohort]);

  function narrowing(k) {
    switch (k) {
      case "period": return S.start !== MONTHS[0] || S.end !== MONTHS[MONTHS.length - 1];
      case "genre": return S.genre !== "all";
      case "area": return S.area !== "all";
      case "target": return S.target !== "all";
      case "price": return S.price !== "all";
      case "tour": return S.tour;
      case "year": return true;
      case "group": return S.group !== GALL;
      case "cohort": return S.cohort !== "all";
    }
    return false;
  }
  function fValue(k) {
    switch (k) {
      case "period": return `${ymText(S.start)} ~ ${ymText(S.end)}`;
      case "genre": return GENRES.find((g) => g[0] === S.genre)[1];
      case "area": return AREAS.find((a) => a[0] === S.area)[1];
      case "target": return { all: "전체", noChild: "아동·가족 제외", child: "아동·가족만" }[S.target];
      case "price": return { all: "전체", free: "무료", paid: "유료" }[S.price];
      case "tour": return S.tour ? "관광 상설 제외" : "관광 상설 포함";
      case "year": return `${S.year}년`;
      case "group": return groupOf(S.group).label;
      case "cohort": return cohortName();
    }
    return "";
  }
  function badges(id, list) {
    html(id, list.map(([t, on, key]) => {
      const f = FKEY[key];
      const cls = !on ? "off" : narrowing(key) ? "on" : "idle";
      const tip = !on ? `${f.label}: 이 패널의 자료에는 이 정보가 없어 필터가 적용되지 않습니다` : `${f.label}: ${fValue(key)}`;
      return `<span class="badge ${cls}" style="--fc:${f.color}" title="${esc(tip)}">${esc(t)}</span>`;
    }).join(""));
  }

  // ---------- 공급 목록 계산 ----------
  const ALL = D.shows.concat(D.exhibits);
  const BY_ID = Object.fromEntries(ALL.map((x) => [x.id, x]));
  const genreOk = (x) => S.genre === "all" || x.g === S.genre || (S.genre === "연극·뮤지컬" && (x.g === "연극" || x.g === "뮤지컬"));
  function match(x, o = {}) {
    if (x.en < dS() || x.st > dE()) return false;
    if (S.tour && x.tour) return false;
    if (S.area !== "all") {
      const [c, l] = S.area.split("|");
      if (x.city !== c || (l && x.loc !== l)) return false;
    }
    if (!o.noTarget) {
      if (S.target === "noChild" && x.ch) return false;
      if (S.target === "child" && !x.ch) return false;
    }
    if (S.price === "free" && x.pr !== "무료") return false;
    if (S.price === "paid" && (x.pr === "무료" || x.pr === UNK)) return false;
    return o.noGenre || genreOk(x);
  }
  const sel = (o) => ALL.filter((x) => match(x, o));
  const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const isoD = (d) => d.toISOString().slice(0, 10);
  const addDay = (s, n) => isoD(new Date(+toDate(s) + n * 864e5));
  function saturdays() {
    let d = dS();
    while (toDate(d).getUTCDay() !== 6) d = addDay(d, 1);
    const out = [], end = dE();
    for (; d <= end; d = addDay(d, 7)) out.push(d);
    return out;
  }
  const openOn = (x, date, bit) => x.st <= date && x.en >= date && (x.dow & bit);
  const onWeekend = (list, sat) => { const sun = addDay(sat, 1); return list.filter((x) => openOn(x, sat, 32) || openOn(x, sun, 64)); };
  const emptyWeekends = (list, sats) => sats.filter((s) => onWeekend(list, s).length === 0).length;
  const adultPlay = () => D.shows.filter((x) => match(x, { noGenre: true, noTarget: true }) && !x.ch && (x.g === "연극" || x.g === "뮤지컬"));

  // ---------- 문화지표 값 ----------
  const T = D.culture.tables;
  const row = (key, coh) => T[key].rows[coh || S.cohort] || T[key].cols.map(() => null);
  const cmap = (keys, coh) => {
    const m = {};
    keys.forEach((k) => T[k].cols.forEach((c, i) => { m[c] = row(k, coh)[i]; }));
    return m;
  };
  const viewMap = (coh) => cmap(["view_1a", "view_1b"], coh);
  const wantMap = (coh) => cmap(["want_1a", "want_1b"], coh);
  const Y = D.youth;
  const leisureVal = (year, mode, group) => { const L = Y.leisure[year]; return L && L[mode][group] ? L[mode][group] : null; };
  const rankOf = (vals, i) => 1 + vals.filter((v) => (v || 0) > (vals[i] || 0)).length;
  const M = (id) => D.regions.metrics.find((m) => m.id === id);
  const metricText = (m, v) => (m.unit === "원" ? int(v) + "원" : f1(v, m.dec) + m.unit);

  // ---------- 값 설명: 무엇을 센 값이고 분자·분모가 무엇인가 ----------
  const ymOf = (x) => +x.slice(0, 4) * 100 + +x.slice(5, 7);
  const festIn = () => D.festival.list.filter((x) => x.st && ymOf(x.st) <= S.end && ymOf(x.en || x.st) >= S.start);
  const ySample = (y, g) => { const n = (D.youthN[y] || {})[g]; return n ? `${int(n)}명(표본)` : `수는 ${UNK}`; };
  const yWho = (y = S.year) => `${y}년 ${groupOf(S.group).label} 응답자, ${ySample(y, S.group)}`;
  const yNote = () => (groupOf(S.group).calc ? "19~24·25~29·30~34세 값을 가중 평균한 계산값입니다. 원표에는 없습니다." : "");
  const cWho = () => (S.cohort === "1934" ? `19~34세 구분이 문화지표 표에 없습니다` : `${cohortName()} 응답자, 표본 ${int(D.culture.sample[S.cohort])}명`);
  const picked = (k) => `'${k}'을(를) 고른 응답자`;
  const P5 = " × 100,000", P3 = " × 1,000", P1 = " × 100", N0 = "";
  const MDEF = {
    facility: ["문화기반시설 수", "인구", P5], act_total: ["문화예술활동 건수", "인구", P5], act_visual: ["시각예술 활동 건수", "인구", P5], act_perf: ["공연예술 활동 건수", "인구", P5],
    perf_times: ["공연 횟수", "인구", P5], exhibit_days: ["전시기간(일) 합계", "전시 건수", N0], budget: ["공연예술예산", "인구", P3], budget_share: ["문화예산", "총예산", P1],
    see_all: ["문화예술·스포츠를 관람한 응답 수", "13세 이상 응답 수", P1], see_music: ["음악·연주회·콘서트를 관람한 응답 수", "13세 이상 응답 수", P1], see_play: ["연극·마당극·뮤지컬을 관람한 응답 수", "13세 이상 응답 수", P1], see_dance: ["무용을 관람한 응답 수", "13세 이상 응답 수", P1],
    see_movie: ["영화를 관람한 응답 수", "13세 이상 응답 수", P1], see_museum: ["박물관을 관람한 응답 수", "13세 이상 응답 수", P1], see_gallery: ["미술관을 관람한 응답 수", "13세 이상 응답 수", P1], see_lit: ["문학행사를 관람한 응답 수", "13세 이상 응답 수", P1],
    leisure_sat: ["'매우 만족'+'약간 만족' 응답 수", "13세 이상 응답 수", P1], tix_pc: ["2025년 티켓 판매수(취소 제외)", "2025.12 주민등록인구", N0], amt_pc: ["2025년 티켓 판매액", "2025.12 주민등록인구", N0],
    tix_per_show: ["2025년 티켓 판매수(취소 제외)", "2025년 상연 횟수", N0], open_pc: ["2025년 개막 편수", "2025.12 주민등록인구", P5], festival_pc: ["2025년 지역축제 계획 건수", "2025.12 주민등록인구", P5],
  };
  // KOPIS·축제 지표는 실제 분자·분모를 알고 있어 계산을 그대로 보여 준다
  const k25 = (area, key) => sum(D.monthly[area].filter((x) => x.ym.startsWith("2025")).map((x) => x[key]));
  const POP = D.regions.pop;
  const MCALC = {
    tix_pc: (a) => `${int(k25(a, "sold"))}장 ÷ ${int(POP[a])}명`, amt_pc: (a) => `${int(k25(a, "amt"))}원 ÷ ${int(POP[a])}명`, tix_per_show: (a) => `${int(k25(a, "sold"))}장 ÷ ${int(k25(a, "times"))}회`,
    open_pc: (a) => `${int(k25(a, "open"))}편 ÷ ${int(POP[a])}명 × 100,000`, festival_pc: (a) => (a === "제주" ? `${D.festival.n}건 ÷ ${int(POP[a])}명 × 100,000` : ""),
  };
  const KDEF = { sold: "그 달 티켓 판매수(취소 제외)", amt: "그 달 티켓 판매액", open: "그 달 개막한 공연 편수", times: "그 달 상연 횟수" };
  const W = "가중치를 적용한 응답 수입니다.";
  const ask = (k) => `'${k}' 응답 수`;
  Object.assign(EX, {
    "l-rank": (r) => ({ what: S.lmode === "main" ? "주말·휴일 주된 여가 1개를 고른 비율" : "1·2순위로 고른 비율(복수응답이라 합계가 100%를 넘습니다)", f: RT(`'${r.k}' 비율`, ask(r.k), "전체 응답 수"), num: picked(r.k), den: yWho(), note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-years": (r) => ({ what: r.lab === "주된" ? "주된 여가로 문화예술을 고른 비율" : "1·2순위로 문화예술을 고른 비율", f: RT("문화예술 비율", "'문화예술 관람·참여' 응답 수", "전체 응답 수"), num: "'문화예술 관람·참여'를 고른 응답자", den: yWho(r.y), note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-company": (r) => ({ what: "여가활동을 주로 함께하는 사람", f: RT(`'${r.k}' 비율`, ask(r.k), "전체 응답 수"), num: picked(r.k), den: yWho(), note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-place": (r) => ({ what: "문화·여가활동으로 주로 가는 지역(2025년 표)", f: RT(`'${r.k}' 비율`, ask(r.k), "전체 응답 수"), num: picked(r.k), den: yWho(2025), note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-sat": (r) => ({ what: "문화·여가생활 전반 만족도", f: RT(`'${r.k}' 비율`, ask(r.k), "전체 응답 수"), num: `'${r.k}' 응답자`, den: yWho(r.y), note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-reason": (r) => ({ what: "문화·여가생활이 불만족인 이유", f: RT(`'${r.k}' 비율`, ask(r.k), "불만족 응답 수('약간·매우 불만족')"), num: `'${r.k}'을(를) 고른 불만족 응답자`, den: `${S.year}년 ${groupOf(S.group).label} 불만족 응답자, 수는 ${UNK}`, note: [W, yNote()].filter(Boolean).join(" ") }),
    "l-policy": (r) => ({ what: `필요한 문화·여가 정책(${S.lmode === "main" ? "주된 응답" : "복수응답"})`, f: RT(`'${r.k}' 비율`, ask(r.k), "전체 응답 수"), num: picked(r.k), den: yWho(), note: [W, yNote()].filter(Boolean).join(" ") }),
    "d-pair": (r) => (r.side === "a"
      ? { what: `최근 1년 도내 관람 분야(${S.dmode === "1" ? "1순위" : "1+2+3순위"})`, f: RT(`'${r.k}' 관람 비율`, `'${r.k}'을(를) 꼽은 관람자 수`, "도내 관람자 수"), num: `'${r.k}'을(를) 꼽은 관람자`, den: `${cohortName()} 도내 관람자, 수는 ${UNK}` }
      : { what: `향후 관람을 원하는 분야(${S.dmode === "1" ? "1순위" : "1+2+3순위"})`, f: RT(`'${r.k}' 희망 비율`, ask(r.k), "응답자 수"), num: picked(r.k), den: `${cohortName()} 응답자. 누가 답했는지 표에 없어 수는 ${UNK}` }),
    "d-barrier": (r) => ({ what: "도내 관람을 막는 가장 큰 요인 1개", f: RT(`'${r.k}' 비율`, ask(r.k), "응답자 수"), num: picked(r.k), den: `${cohortName()} 응답자. 전체가 답했는지 비관람자만 답했는지 표에 없어 수는 ${UNK}`, note: "고른 사람의 비율이지 영향의 크기가 아닙니다." }),
    "d-need": (r) => ({ what: "관람을 늘리려면 필요한 것(1순위)", f: RT(`'${r.k}' 비율`, ask(r.k), "응답자 수"), num: picked(r.k), den: `${cohortName()} 응답자. 표별 사례수는 ${UNK}` }),
    "d-place": (r) => ({ what: "도내 관람 때 찾은 지역", f: RT(`'${r.k}' 비율`, `'${r.k}'을(를) 고른 관람자 수`, "도내 관람자 수"), num: `'${r.k}'을(를) 고른 관람자`, den: `${cohortName()} 도내 관람자, 수는 ${UNK}` }),
    "d-env": (r) => ({ what: "문화 향유 환경을 긍정적으로 본 비율", f: RT(`'${r.k}' 긍정 비율`, "긍정 응답 수(5~7점)", "전체 응답 수"), num: `'${r.k}'에 긍정한 응답자`, den: cWho() }),
    "k-pair": (r) => ({ what: r.side === "a" ? "지난 1년 관람(제주 밖 관람 포함, 복수응답)" : "앞으로 관람 의향(복수응답)", f: RT(`${r.k} ${r.side === "a" ? "관람률" : "관람 의향 비율"}`, `${r.k}을(를) 고른 응답 수`, "전체 응답 수"), num: `'${r.k}'을(를) 고른 응답자`, den: `${S.apop} 표본 ${int(D.arts.n[S.apop])}명`, note: W }),
    "b-rank": (r) => { const m = M(S.metric), d = MDEF[S.metric], area = r.k === "제주" ? "제주" : null; return { what: m.label, f: RT(m.label.replace(/ \(.*\)$/, ""), d[0], d[1], d[2]), calc: area && MCALC[S.metric] && MCALC[S.metric](area) ? `제주 ${MCALC[S.metric](area)} = ${metricText(m, m.vals["제주"])}` : "", num: d[0], den: d[1], note: `${m.year} ${m.src}. 세로선은 전국 값(${metricText(m, m.nat)})입니다.` }; },
    "b-yearbook": (r) => (r.side === "a" ? { what: "활동 건수 중 이 장르의 비중", f: RT(`${r.k} 비중`, `${r.k} 활동 건수`, "전체 활동 건수"), calc: PCT(r.an, r.at, "건"), num: `제주 ${r.k} ${int(r.an)}건`, den: `제주 전체 ${int(r.at)}건` } : { what: "활동 건수 중 이 장르의 비중", f: RT(`${r.k} 비중`, `${r.k} 활동 건수`, "전체 활동 건수"), calc: PCT(r.bn, r.bt, "건"), num: `전국 ${r.k} ${int(r.bn)}건`, den: `전국 전체 ${int(r.bt)}건` }),
    "b-hall-type": (r) => ({ f: RT("비중", `${r.k} 전시관 수`, "전체 전시관 수"), calc: PCT(r.v, D.halls.length, "곳"), num: `${r.k} 전시관 ${r.v}곳`, den: `제주 전시관 ${D.halls.length}곳` }),
    "b-hall-city": (r) => ({ f: RT("비중", `${r.k} 전시관 수`, "전체 전시관 수"), calc: PCT(r.v, D.halls.length, "곳"), num: `${r.k} 전시관 ${r.v}곳`, den: `제주 전시관 ${D.halls.length}곳` }),
    "b-fac-type": (r) => ({ f: RT("비중", `${r.k} 시설 수`, "등록 시설 수"), calc: PCT(r.v, D.facilities.n, "곳"), num: `${r.k} ${r.v}곳`, den: `KOPIS 등록 시설 ${D.facilities.n}곳(폐관 표시 포함)` }),
    "b-fac-city": (r) => ({ f: RT("비중", `${r.k} 시설 수`, "등록 시설 수"), calc: PCT(r.v, D.facilities.n, "곳"), num: `${r.k} 시설 ${r.v}곳`, den: `KOPIS 등록 시설 ${D.facilities.n}곳(폐관 표시 포함)` }),
    "b-fac-top": (r) => ({ what: "2025년 이 시설의 티켓 판매(취소 제외)", f: RT("판매 비중", "이 시설 판매수", "제주 전체 판매수"), calc: PCT(r.v, D.facilities.soldTotal, "장"), num: `${r.k} ${int(r.v)}장`, den: `2025년 제주 판매 ${int(D.facilities.soldTotal)}장` }),
    "a-run": (r) => ({ what: "공연 기간 구분", f: RT("비중", `${r.k} 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "a-target": (r) => ({ what: "KOPIS 아동공연 표시 기준", f: RT("비중", `${r.k} 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "a-price": (r) => ({ what: "최저가 기준", f: RT("비중", `${r.k} 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "a-slot": (r) => ({ what: "한 공연이 여러 시간대에 들어갈 수 있어 비중을 더하면 100%를 넘습니다", f: RT("비중", `${r.k}에 열린 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "a-area": (r) => ({ f: RT("비중", `${r.k} 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "a-prov": (r) => ({ f: RT("비중", `${r.k} 공연장의 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.n, "편"), num: `${r.k} ${int(r.v)}편`, den: `선택 조건의 공연 ${int(r.n)}편` }),
    "snap": (r) => ({ what: "조회 시점에 등록된 현재·예정 행사", f: RT("비중", `${r.k} 행사 수`, "등록 행사 수"), calc: PCT(r.v, D.snapshot.n, "건"), num: `${r.k} ${r.v}건`, den: `등록 행사 ${int(D.snapshot.n)}건` }),
    "w-gap": (r) => ({ what: "아동 공연을 뺀 이 장르 공연이 한 편도 없던 주말", f: RT("빈 주말 비율", "빈 주말 수", "선택 기간 주말 수"), calc: PCT(r.v, saturdays().length, "번"), num: `빈 주말 ${r.v}번`, den: `선택 기간 주말 ${saturdays().length}번` }),
    "k-box-first": (r) => ({ what: "월별 제주 예매 1위 공연의 장르", f: RT("비중", "이 장르가 1위인 달 수", "전체 달 수"), calc: PCT(r.v, D.boxoffice.months.length, "개월"), num: `${r.k} 1위 ${r.v}개월`, den: `${D.boxoffice.months.length}개월` }),
    "k-box-top": (r) => ({ what: "월별 제주 예매 상위 10위 안의 자리 수", f: RT("비중", "이 장르가 차지한 자리 수", "상위 10위 전체 자리 수"), calc: PCT(r.v, D.boxoffice.topN, "자리"), num: `${r.k} ${r.v}자리`, den: `상위 10위 전체 ${int(D.boxoffice.topN)}자리`, note: "1월은 순위에 오른 공연이 10개보다 적습니다." }),
    "f-type": (r) => ({ what: "한 축제가 유형을 둘 이상 적은 경우 각각 셉니다", f: RT("비중", `${r.k} 유형 축제 수`, "2025년 제주 축제 계획 수"), calc: PCT(r.v, D.festival.n, "건"), num: `${r.k} ${r.v}건`, den: `2025년 제주 축제 계획 ${D.festival.n}건` }),
    "f-month": (r) => ({ what: "계획상 시작 월 기준", f: RT("비중", `${r.k}에 시작하는 축제 수`, "2025년 제주 축제 계획 수"), calc: PCT(r.v, D.festival.n, "건"), num: `${r.k} ${r.v}건`, den: `2025년 제주 축제 계획 ${D.festival.n}건` }),
    "f-trend": (r) => ({ what: "제주 축제 계획 건수", f: RT("제주 비중", "제주 축제 계획 수", "전국 축제 계획 수"), calc: PCT(r.v, r.nat, "건"), num: `제주 ${r.v}건`, den: `전국 ${int(r.nat)}건` }),
    "bf-l": (r) => ({ what: r.fest ? "2025년 문체부 지역축제 계획 중 선택 기간에 열리는 건수" : "선택한 조건에 맞고 기간 중 하루라도 열린 공연·전시 수", f: COUNT }),
    "bf-r": (r) => (r.side === "view"
      ? { what: "최근 1년 도내 관람 분야(1순위)", f: RT(`'${r.k}' 관람 비율`, `'${r.k}'을(를) 꼽은 관람자 수`, "도내 관람자 수"), num: `'${r.k}'을(를) 꼽은 관람자`, den: `${cohortName()} 도내 관람자, 수는 ${UNK}` }
      : { what: "향후 관람을 원하는 분야(1순위)", f: RT(`'${r.k}' 희망 비율`, ask(r.k), "응답자 수"), num: picked(r.k), den: `${cohortName()} 응답자. 누가 답했는지 표에 없어 수는 ${UNK}` }),
    "ov-supply": (r) => ({ what: "선택 조건에서 공연 편수가 많은 장르", f: RT("비중", `${r.k} 공연 수`, "선택 조건의 공연 수"), calc: PCT(r.v, r.total, "건"), num: `${r.k} ${int(r.v)}건`, den: `선택 조건의 공연 ${int(r.total)}건` }),
    "ov-want": (r) => ({ what: "향후 관람을 원하는 분야(1순위)", f: RT(`'${r.k}' 희망 비율`, ask(r.k), "응답자 수"), num: picked(r.k), den: `${cohortName()} 응답자. 누가 답했는지 표에 없어 수는 ${UNK}` }),
  });

  // ---------- 연령 기준: 항목마다 어떤 연령 값이고 필터가 걸리는가 ----------
  const AGEK = {
    y: { t: () => `연령 ${groupOf(S.group).label}`, live: () => S.group !== GALL, base: "제주 청년통계 19~39세, 연령 6구간", f: "청년 집단 필터 적용", v: "계산값(연령별 값의 가중 평균)" },
    c: { t: () => `연령 ${cohortName()}`, live: () => true, base: "문화지표 15세 이상, 20대·30대·도민 전체", f: "문화지표 연령 필터 적용", v: NA },
    bf: { t: () => `공급 연령 구분 없음 · 수요 ${cohortName()}`, live: () => true, base: "공급은 기록, 수요는 문화지표 20대·30대·도민 전체", f: "수요 쪽만 문화지표 연령 필터 적용", v: NA },
    mix: { t: () => `연령 ${cohortName()} · 일부 19~39세`, live: () => true, base: "문화지표와 청년통계 전체 19~39세를 나란히 표시", f: "문화지표 값만 연령 필터 적용", v: NA },
    c23: { t: () => "연령 20대·30대 고정", base: "문화지표 20대·30대를 두 열로 표시", f: "미적용(두 연령을 항상 함께 표시)", v: NA },
    n: { t: () => "연령 제주 전 연령 · 전국 20·30대", base: "국민문화예술활동조사. 제주는 연령 구분이 없음", f: "미적용(카드 안의 대상 선택만 적용)", v: NA },
    nl: { t: () => "연령 제주 전 연령 · 전국 20·30대", base: "국민여가활동조사. 제주는 연령 구분이 없음", f: "미적용", v: NA },
    s13: { t: () => "연령 13세 이상 고정", base: "사회조사 13세 이상 전 연령", f: "미적용", v: NA },
    rank: { t: () => (/^see_|^leisure/.test(S.metric) ? "연령 13세 이상 고정" : "연령 구분 없음"), base: "지표에 따라 13세 이상 또는 연령 구분 없음", f: "미적용", v: NA },
    all: { t: () => "연령 구분 없음", base: "KOPIS 판매·문예연감·시설 자료. 관객 연령이 없음", f: "미적용", v: NA },
    pass: { t: () => "연령 19세(2024·2025) · 19·20세(2026)", base: "청년문화예술패스 지원 대상 연령. 청년 전체가 아님", f: "미적용", v: NA },
    rec: { t: () => "연령 구분 없음", base: "공연·전시·축제 기록. 관람 가능 연령만 있고 관객 연령은 없음", f: "미적용(대상 필터로 아동·가족 공연만 구분)", v: "해당 없음" },
  };
  const AGE_MAP = [["k-supply", "rec"], ["k-wk", "rec"], ["k-leisure", "y"], ["k-view", "c"], ["k-tix", "all"], ["bf", "bf"], ["ov-supply", "rec"], ["ov-want", "c"], ["ov-barrier", "c"],
    ["l-rank", "y"], ["l-years", "y"], ["l-company", "y"], ["l-place", "y"], ["l-sat", "y"], ["l-reason", "y"], ["l-policy", "y"],
    ["d-rings", "c"], ["d-pair", "c"], ["d-barrier", "c"], ["d-need", "c"], ["d-place", "c"], ["d-env", "c"], ["d-qa", "mix"], ["k-outside", "n"], ["k-pair", "n"], ["k-barrier", "n"], ["t-national", "nl", "h3.mt"],
    ["b-ratio", "all"], ["b-rank", "rank"], ["b-yearbook", "all"], ["b-top", "all"], ["t-survey", "s13"], ["b-hall-desc", "rec"], ["b-fac-desc", "all"],
    ["c-open", "rec"], ["c-sales", "all"], ["a-desc", "rec"], ["v-desc", "rec"], ["f-desc", "rec"], ["list-desc", "rec"], ["snap-desc", "rec"],
    ["w-cal", "rec"], ["w-gap", "rec"], ["p-issue", "pass"], ["p-use", "pass"], ["p-trend", "pass"], ["t-link", "c23"], ["k-box-desc", "all", "h3.sub-h"]];
  const ageHead = (id, sel) => {
    const el = $(id), box = el.closest(".card") || el.closest(".sec");
    return sel ? [...box.querySelectorAll(sel)].pop() : box.querySelector(".card-head h2, .card-head h3, .sec-head h2, h2");
  };
  function renderAge() {
    AGE_MAP.forEach(([id, kind, sel]) => {
      const k = AGEK[kind], h = ageHead(id, sel);
      let c = h.querySelector(".age-chip");
      if (!c) { c = document.createElement("span"); h.appendChild(c); }
      const follows = !!k.live;
      c.className = `age-chip ${follows ? (k.live() ? "on" : "idle") : "off"}`;
      c.textContent = k.t();
      c.setAttribute("data-tip", `<b>연령 기준</b><br><small>표의 연령: ${esc(k.base)}</small><br><small>연령 필터: ${esc(k.f)}</small><br><small>19~34세 값: ${esc(k.v)}</small>`);
    });
  }

  // ---------- 결론 카드(필터와 무관한 2025년 기준) ----------
  function renderConclusion() {
    const C2 = D.conclusion;
    if (!C2) { html("concl", naBox("문제정의 문서(하루온팀_문제인식과_문제정의문최종.md)를 찾지 못해 결론을 표시하지 않습니다")); return; }
    const mdb = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const tabName = (id) => { const a = document.querySelector(`#nav a[href="#${id}"]`); return a ? a.textContent.trim() : ""; };
    const s25 = D.shows.filter((x) => x.st <= "2025-12-31" && x.en >= "2025-01-01" && !x.tour);
    const short = s25.filter((x) => x.rl === "1~2일").length;
    const sats25 = []; for (let d = "2025-01-04"; d <= "2025-12-31"; d = addDay(d, 7)) sats25.push(d);
    const play = s25.filter((x) => !x.ch && (x.g === "연극" || x.g === "뮤지컬"));
    const gap = emptyWeekends(play, sats25);
    const fac = M("facility"), tix = M("tix_pc");
    const bar = (k) => T.barrier.rows["20"][T.barrier.cols.indexOf(k)];
    const PS = D.pass, pv = (g, k) => (g.rows.find((r) => r.k === k) || {}).v, og = PS.orgs;
    const AG = D.arts.genre, gi = AG.cols.indexOf("뮤지컬");
    const CH = {
      "불편": [
        ["sec-demand", pct(bar("관심 있는 프로그램이 없어서")), "20대 관람 방해 1위 '관심 있는 프로그램이 없어서'", "계산식: 이 요인을 고른 응답 수 ÷ 20대 응답자 수 × 100(문화지표 표 3-14). 고른 비율이지 영향의 크기는 아닙니다."],
        ["sec-demand", pct(bar("관련 정보가 부족해서")), "2위 '관련 정보가 부족해서'", "계산식: 이 요인을 고른 응답 수 ÷ 20대 응답자 수 × 100(문화지표 표 3-14)"],
      ],
      "갈등": [
        ["sec-pass", `${f1(pv(PS.issue[0], "제주"))}%`, `제주 패스 발급률(2025년) · 17개 시도 중 최저 · 2024년 ${f1(pv(PS.issue[1], "제주"))}%에 이어 2년 연속`, "계산식: 패스를 발급받은 사람 수 ÷ 지원 대상자 수 × 100. 보도에 인용된 값"],
        ["sec-pass", og ? `${og.jeju[og.jeju.length - 1]}곳` : UNK, og ? `패스 할인에 참여한 지자체 예술기관 · ${og.years.join("·")}년 모두 · 전국 ${og.nat.join("곳 → ")}곳` : "패스 할인에 참여한 지자체 예술기관", og ? `${og.what}. ${PS.sources[og.src].name.split(",")[0]} ${PS.sources[og.src].date} 보도` : NA],
      ],
      "결핍": [
        ["sec-base", `${fac.rank}위`, `인구 10만 명당 문화기반시설 ${f1(fac.vals["제주"])}개(${fac.n}개 시도 중)`, `계산식: 문화기반시설 수 ÷ 주민등록인구 × 100,000. 전국 ${f1(fac.nat)}개`],
        ["sec-base", `${f1(tix.vals["제주"] / tix.nat, 2)}배`, "1인당 유료 공연 판매(제주 ÷ 전국) · 도민 전체 기준", `계산식: 제주 1인당 판매 수 ÷ 전국 1인당 판매 수 = ${f1(tix.vals["제주"], 3)}장 ÷ ${f1(tix.nat, 3)}장. 판매에는 관광객이 산 표도 섞여 있고, 주민등록인구로 나눈 값입니다.`],
        ["sec-weekend", `${gap}번`, `성인 대상 연극·뮤지컬이 없던 주말(2025년 ${sats25.length}번 중)`, `아동 공연을 뺀 연극·뮤지컬이 토·일 모두 없던 주말 수. ${gap}번 ÷ ${sats25.length}번`],
        ["sec-supply", `${f1((short / s25.length) * 100)}%`, `1~2일 만에 끝난 공연(${int(s25.length)}편 중 ${int(short)}편)`, `계산식: 1~2일 공연 수 ÷ 공연 수 × 100 = ${int(short)} ÷ ${int(s25.length)} × 100`],
      ],
      "가능성": [
        ["sec-demand", pct(row("satisfaction", "20")[2]), "관람한 20대 가운데 만족한 비율", "계산식: 5~7점 응답자 수 ÷ 도내 관람자 수 × 100(문화지표 표 3-13). 관람한 사람만 답한 값"],
        ["sec-demand", `${f1(AG.view.rows["제주 전 연령"][gi])}% → ${f1(AG.want.rows["제주 전 연령"][gi])}%`, "뮤지컬: 지난 1년 관람 → 앞으로 관람 의향(제주 전 연령)", `같은 응답자 ${int(D.arts.n["제주 전 연령"])}명에게 물은 값(국민문화예술활동조사 2025, 복수응답). 관람에는 제주 밖에서 본 공연도 들어갑니다.`],
        [null, "전국 2위", "예술활동증명 예술인 수(인구 10만 명당 435.5명, 서울 다음)", "『2025년 제주문화지표 조사연구 보고서』 3.1.1, 2024년 예술활동증명 기준 2,895명"],
        ["sec-pass", "19~34세", "2027년 정부안의 패스 대상 연령(이 기획의 대상과 같음)", "여의도연구원 정책 브리프(2026.10)"],
      ],
    };
    const chip = ([tab, v, t, f]) => {
      const tn = tab ? tabName(tab) : "";
      const tip = esc(`<b>${esc(t)}</b><br>${esc(v)}<hr><small>${esc(f)}</small>${tab ? `<br><small>누르면 '${esc(tn)}' 탭으로 이동</small>` : ""}`);
      const inner = `<b>${esc(v)}</b><span>${esc(t)}</span>${tab ? `<small>${esc(tn)} →</small>` : ""}`;
      return tab ? `<a class="vchip" href="#${tab}" data-tip="${tip}">${inner}</a>` : `<span class="vchip" data-tip="${tip}">${inner}</span>`;
    };
    html("c-lead", C2.lead.map(mdb).join(" "));
    $("c-problem").textContent = C2.problem;
    $("c-one").textContent = C2.oneLine;
    html("c-why", mdb(C2.why));
    html("c-views", C2.views.map((v) => `<div class="view-card"><span class="view-k">${esc(v.k)}</span><p class="view-see">${esc(v.see)}</p><div class="vchips">${(CH[v.k] || []).map(chip).join("")}</div></div>`).join(""));
    $("c-view-note").textContent = C2.viewNote;
    html("c-next-lead", mdb(C2.nextLead));
    html("c-next", C2.next.map((t) => `<li>${esc(t)}</li>`).join(""));
    $("c-next-end").textContent = C2.nextEnd;
    // 분석 결과 탭에도 같은 카드를 둔다(원본 하나에서 복사, id는 겹치지 않게 지움)
    $("concl-copy").innerHTML = $("concl").innerHTML.replace(/\sid="[^"]*"/g, "");
  }

  // ---------- 개요 ----------
  const BF = [
    { k: "연극·뮤지컬", g: ["연극", "뮤지컬"], d: ["연극(뮤지컬 포함)"], f: "연극·뮤지컬" },
    { k: "대중공연·연예", g: ["대중음악/연예"], d: ["대중공연·연예"], f: "대중음악/연예" },
    { k: "서양음악", g: ["서양음악"], d: ["서양음악"], f: "서양음악" },
    { k: "전통예술", g: ["전통예술"], d: ["전통예술"], f: "전통예술" },
    { k: "무용", g: ["무용"], d: ["무용"], f: "무용" },
    { k: "미술 전시회", g: ["미술 전시회"], d: ["미술 전시회"], sub: "공공 전시장 3곳만", ex: true, f: "미술 전시회" },
    { k: "영화", g: null, d: ["영화"], sub: "비교 기준선" },
    { k: "문학행사", g: null, d: ["문학행사"] },
    { k: "축제·전통체험 등", g: ["9분야 외(복합)"], d: ["관광축제", "예술축제", "전통문화체험", "무속공연", "기타"], sub: "공급은 문체부 지역축제 계획", fest: true },
  ];
  function bfRows() {
    const list = sel({ noGenre: true }), v = viewMap(), w = wantMap();
    const agg = (m, ks) => (ks.every((k) => m[k] == null) ? null : Math.round(sum(ks.map((k) => m[k])) * 10) / 10);
    return BF.map((b) => ({
      ...b, n: b.fest ? festIn().length : b.g ? list.filter((x) => b.g.includes(x.g)).length : null,
      view: agg(v, b.d), want: agg(w, b.d),
    }));
  }
  function renderOverview() {
    const list = sel(), perf = list.filter((x) => x.src === "K"), ex = list.filter((x) => x.src !== "K");
    $("k-supply").textContent = `${int(list.length)}건`;
    $("k-supply-sub").textContent = `공연 ${int(perf.length)}편(KOPIS) · 전시 ${int(ex.length)}건(공공 전시장 4곳) · ${ymShort(S.start)}~${ymShort(S.end)}`;

    const sats = saturdays(), play = adultPlay(), empty = emptyWeekends(play, sats);
    $("k-wk").textContent = `${empty}번`;
    $("k-wk-ring").style.setProperty("--p", sats.length ? (empty / sats.length) * 100 : 0);
    $("k-wk-sub").textContent = `주말 ${sats.length}번 중 · 아동 공연 제외${S.area !== "all" ? " · " + fValue("area") : ""}`;
    setTip("k-supply", `<b>공연·전시 공급 ${int(list.length)}건</b><br>공연 ${int(perf.length)}편 + 전시 ${int(ex.length)}건` + tipLines({ what: "선택한 조건에 맞고 기간 중 하루라도 열린 공연·전시 수", f: COUNT, note: "KOPIS 편수는 실제 공급보다 적게 잡히고, 전시는 공공 전시장 4곳만 셉니다." }));
    setTip("k-wk", `<b>연극·뮤지컬이 없던 주말 ${empty}번</b>` + tipLines({ what: "아동 공연을 뺀 연극·뮤지컬이 토·일 모두 없던 주말", f: RT("빈 주말 비율", "빈 주말 수", "선택 기간 주말 수"), calc: PCT(empty, sats.length, "번"), num: `빈 주말 ${empty}번`, den: `선택 기간 주말 ${sats.length}번` }));

    const vals = leisureVal(S.year, "main", S.group), multi = leisureVal(S.year, "multi", S.group);
    const lv = vals ? vals[1] : null;
    $("k-leisure").textContent = pct(lv);
    $("k-leisure").classList.toggle("na", lv == null);
    $("k-leisure-ring").style.setProperty("--p", lv || 0);
    $("k-leisure-sub").textContent = vals ? `${S.year} · ${groupOf(S.group).label} · 보기 ${vals.length}개 중 ${rankOf(vals, 1)}위 · 1·2순위 합산 ${pct(multi[1])}` : `${NA}: 이 연도 표에 해당 집단이 없습니다`;
    setTip("k-leisure", `<b>주말 주된 여가가 문화예술 ${pct(lv)}</b>` + tipLines({ what: "주말·휴일에 가장 주로 하는 여가 1개를 고른 비율", f: RT("문화예술 비율", "'문화예술 관람·참여' 응답 수", "전체 응답 수"), num: "'문화예술 관람·참여'를 고른 응답자", den: yWho(), note: [W, yNote()].filter(Boolean).join(" ") }));

    const vr = row("view_rate")[0];
    $("k-view").textContent = pct(vr);
    $("k-view").classList.toggle("na", vr == null);
    $("k-view-ring").style.setProperty("--p", vr || 0);
    setTip("k-view", `<b>도내 문화예술 관람 경험 ${pct(vr)}</b>` + tipLines({ what: "최근 1년 제주도 안에서 문화예술 행사를 관람한 비율", f: RT("관람 경험 비율", "'관람 경험 있음' 응답 수", "전체 응답 수"), num: "관람 경험이 있는 응답자", den: cWho(), note: "표 3-7. " + W }));
    $("k-view-sub").textContent = `${cohortName()} · 최근 1년 제주도 내 (도민 전체 ${pct(row("view_rate", "all")[0])}, 20대 ${pct(row("view_rate", "20")[0])}, 30대 ${pct(row("view_rate", "30")[0])})`;

    const t = M("tix_pc");
    $("k-tix").textContent = `${f1(t.vals["제주"] / t.nat, 2)}배`;
    $("k-tix-sub").textContent = `제주 ${f1(t.vals["제주"], 3)}장 / 전국 ${f1(t.nat, 3)}장 · KOPIS 2025 ÷ 2025.12 인구 · 전 연령`;
    setTip("k-tix", `<b>1인당 티켓 판매 ${f1(t.vals["제주"] / t.nat, 2)}배</b>` + tipLines({ what: "1인당 판매수 = 2025년 티켓 판매수(취소 제외) ÷ 2025.12 주민등록인구", f: "배율 = 제주 1인당 판매수 ÷ 전국 1인당 판매수", calc: `(${int(k25("제주", "sold"))}장 ÷ ${int(POP["제주"])}명) ÷ (${int(k25("전국", "sold"))}장 ÷ ${int(POP["전국"])}명) = ${f1(t.vals["제주"], 3)} ÷ ${f1(t.nat, 3)} = ${f1(t.vals["제주"] / t.nat, 2)}배`, num: `제주 1인당 ${f1(t.vals["제주"], 3)}장`, den: `전국 1인당 ${f1(t.nat, 3)}장`, note: "KOPIS 판매와 주민등록인구는 서로 다른 자료입니다." }));

    // 나비 차트
    const rows = bfRows();
    const maxN = Math.max(...rows.map((r) => r.n || 0), 1);
    const maxD = Math.max(...rows.map((r) => Math.max(r.view || 0, r.want || 0)), 1);
    $("bf-cohort").textContent = cohortName();
    const bar = (v, c, lab, k, side) => `<div class="r" data-tip="${esc(`<b>${esc(k)}</b><br>${esc(cohortName())} ${lab} ${pct(v)}` + explain("bf-r", { k, side }))}"><div class="t"><i style="width:${((v || 0) / maxD) * 100}%;background:${c}"></i></div><span class="v${v == null ? " na" : ""}">${f1(v)}</span></div>`;
    html("bf", `<div class="bf-head"><span>공급 건수</span><span></span><div class="lg"><span><i style="background:${C.view}"></i>최근 관람</span><span><i style="background:${C.pink}"></i>향후 희망</span></div></div>` +
      rows.map((r) => {
        const active = S.genre !== "all" && (r.f === S.genre || (r.k === "연극·뮤지컬" && ["연극", "뮤지컬"].includes(S.genre)));
        const left = r.n == null ? `<div class="bf-l" data-tip="${esc(`<b>${esc(r.k)}</b><br>${NA}<br><small>공급 목록이 없습니다. 0건이라는 뜻이 아닙니다.</small>`)}"><span class="none">${NA}</span></div>`
          : `<div class="bf-l ${r.ex ? "ex" : ""}" data-tip="${esc(`<b>${esc(r.k)}</b><br>${int(r.n)}건${r.sub ? " · " + esc(r.sub) : ""}` + explain("bf-l", r))}"><span class="v">${int(r.n)}</span><div class="t"><i style="width:${(r.n / maxN) * 100}%"></i></div></div>`;
        return `<div class="bf-row ${active ? "sel" : ""}">${left}<div class="bf-k">${esc(r.k)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div><div class="bf-r">${r.view == null && r.want == null ? `<div class="r" data-tip="${esc(`<b>${esc(r.k)}</b><br>${NA}<br><small>문화지표 표에 ${esc(cohortName())} 구분이 없습니다.</small>`)}"><span class="v na">${NA}</span></div>` : bar(r.view, C.view, "최근 관람", r.k, "view") + bar(r.want, C.pink, "향후 희망", r.k, "want")}</div></div>`;
      }).join(""));
    html("t-bf", table([{ label: "장르", get: (r) => r.k }, { label: "공급 건수", num: 1, get: (r) => int(r.n) },
      { label: `${cohortName()} 최근 관람(%)`, num: 1, get: (r) => f1(r.view) }, { label: `${cohortName()} 향후 희망(%)`, num: 1, get: (r) => f1(r.want) }], rows));

    // 오른쪽 목록
    // 전시는 한 시설 자료라 제주 전체 공연과 순위를 매기지 않는다
    const cnt = {};
    sel({ noGenre: true }).filter((x) => x.src === "K").forEach((x) => { cnt[x.g] = (cnt[x.g] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topList = (id, items, unit, extra) => {
      const mx = Math.max(...items.map((t) => t[1]), 1e-9);
      return items.length ? items.map(([k, v]) => `<li data-tip="${esc(`<b>${esc(k)}</b><br>${unit(v)}` + explain(id, { k, v, ...extra }))}"><span class="nm">${esc(k)}</span><span class="v">${unit(v)}</span><div class="bar" style="width:${(v / mx) * 100}%"></div></li>`).join("") : `<li class="na" data-tip="${esc(`<b>${NA}</b><br><small>${S.cohort === "1934" && id !== "ov-supply" ? "문화지표 표에 19~34세 구분이 없습니다." : "선택 조건에 해당하는 항목이 없습니다."}</small>`)}">${NA}</li>`;
    };
    html("ov-supply", topList("ov-supply", top, (v) => `${int(v)}건`, { total: sum(Object.values(cnt)) }));
    const w = wantMap();
    const wants = Object.entries(w).filter(([k, v]) => k !== "기타" && v != null).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("ov-want-h").textContent = `${cohortName()}가 보고 싶은 분야 TOP 5`;
    html("ov-want", topList("ov-want", wants, (v) => pct(v)));
    $("ov-bar-h").textContent = `${cohortName()} 관람을 막는 요인 TOP 3`;
    const bs = T.barrier.cols.map((c, i) => [c, row("barrier")[i]]).filter((b) => b[0] !== "기타" && b[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const shortB = (s) => s.replace(/이 없어서$|이 부족해서$|이 불편해서$|이 많이 들어서$|가 부족해서$/, "");
    html("ov-barrier", bs.length ? bs.map(([k, v]) => ring(v, shortB(k), "", C.pink, `<b>${esc(k)}</b><br>${pct(v)} (표 3-14)` + explain("d-barrier", { k }))).join("") : naBox("문화지표 표에 19~34세 구분이 없습니다"));
    badges("b-bf", [["기간", 1, "period"], ["지역", 1, "area"], ["대상", 1, "target"], ["요금", 1, "price"], ["상설", 1, "tour"], ["연령(오른쪽)", 1, "cohort"]]);
  }

  // ---------- 수요 ① ----------
  const SAT_C = ["#1f4e9c", "#8fb0e0", "#dcd8e8", "#f2aecd", "#d63c7f"];
  function renderLeisure() {
    const g = groupOf(S.group);
    show("leisure-warn", !g.years.includes(S.year) ? `${NA}: '${esc(g.label)}' 집단은 ${S.year}년 표에 없습니다.` : g.calc ? `<b>19~34세는 원표에 없는 계산값입니다.</b> 19~24·25~29·30~34세 값을, 공표 비율로 거꾸로 계산한 연령별 비중(${S.year}년 ${Object.entries(Y.age1934[S.year].w).slice(0, 3).map(([k, v]) => `${k} ${f1(v)}%`).join(", ")})으로 가중 평균했습니다. 이 비중으로 공표값을 다시 계산했을 때 차이는 최대 ${Y.age1934[S.year].maxErr}%p입니다.` : "");
    badges("b-leisure", [["연도", 1, "year"], ["청년 집단", 1, "group"], ["기간", 0, "period"], ["장르", 0, "genre"]]);
    const yBar = $("l-mode").querySelectorAll("button");
    yBar.forEach((b) => b.classList.toggle("on", b.dataset.v === S.lmode));

    const L = Y.leisure[S.year], vals = L[S.lmode][S.group];
    $("l-rank-desc").textContent = `${S.year}년 · ${g.label}. ${S.lmode === "main" ? "가장 주된 활동 하나만 고른 값이라 가끔 관람하는 청년은 잡히지 않습니다." : "1·2순위를 모두 센 값입니다."}`;
    if (vals) {
      const rows = L.opts.map((k, i) => ({ k, v: vals[i], hl: i === 1 })).sort((a, b) => (b.v || 0) - (a.v || 0));
      hbars("l-rank", rows, { cls: "emph pink" });
    } else html("l-rank", naBox("이 연도 표에 해당 집단이 없습니다"));

    // 연도 비교
    const yrs = [2019, 2022, 2025];
    const data = yrs.map((y) => { const a = leisureVal(y, "main", S.group), b = leisureVal(y, "multi", S.group); return { y, main: a ? a[1] : null, multi: b ? b[1] : null, a, b }; });
    const mx = Math.max(...data.map((d) => d.multi || 0), 10);
    const col = (d, note) => `<div class="yr-col"><div class="yr-bars">` +
      [["main", C.pink, "주된"], ["multi", "#f2aecd", "복수"]].map(([k, c, lab]) => `<div class="yr-bar${d[k] == null ? " na" : ""}" data-tip="${esc(`<b>${d.y}년 ${lab}</b><br>${pct(d[k])}` + explain("l-years", { y: d.y, lab }))}">${f1(d[k])}<i style="height:${((d[k] || 0) / mx) * 90}%;background:${c}"></i></div>`).join("") +
      `</div><b>${d.y}</b><small>${note}</small></div>`;
    html("l-years", `<div class="yr">${col(data[0], "보기 구성 다름")}<div class="sep"></div>${col(data[1], "")}${col(data[2], "")}</div><div class="lg"><span><i style="background:${C.pink}"></i>주된 응답</span><span><i style="background:#f2aecd"></i>1·2순위 복수응답</span></div>`);
    html("l-years-t", table([{ label: "연도", get: (d) => d.y }, { label: "주된(%)", num: 1, get: (d) => f1(d.main) },
      { label: "주된 순위", num: 1, get: (d) => (d.a ? `${rankOf(d.a, 1)}/${d.a.length}` : NA) }, { label: "복수(%)", num: 1, get: (d) => f1(d.multi) },
      { label: "복수 합계(%)", num: 1, get: (d) => (d.b ? f1(sum(d.b)) : NA) }, { label: "응답 중 비중(%)", num: 1, get: (d) => (d.b ? f1((d.multi / sum(d.b)) * 100) : NA) }], data));

    // 함께하는 사람
    const cp = Y.company[S.year];
    if (cp && cp.vals[S.group]) hbars("l-company", cp.opts.map((k, i) => ({ k, v: cp.vals[S.group][i], hl: i === 0 })).filter((r) => r.k !== "기타").sort((a, b) => (b.v || 0) - (a.v || 0)), { cls: "emph pink narrow" });
    else html("l-company", naBox(`${S.year}년 표에는 이 문항이 없습니다`));

    // 방문지역
    const pv = Y.place.vals[S.group];
    if (pv) {
      hbars("l-place", Y.place.opts.map((k, i) => ({ k, v: pv[i] })).filter((r) => r.v != null && r.v >= 0.1).sort((a, b) => b.v - a.v), { cls: "pink narrow" });
      const mean = Y.visits.mean[S.group];
      $("l-visit").textContent = mean != null ? `주요 지역 월평균 방문 ${f1(mean)}회 (${g.label}). 2025년 표에만 있어 연도 필터가 적용되지 않습니다.` : "";
    } else { html("l-place", naBox("이 표에는 해당 집단이 없습니다")); $("l-visit").textContent = ""; }

    // 만족도
    const segRow = (y) => {
      const v = (Y.satisfaction[y] || {}).vals && Y.satisfaction[y].vals[S.group];
      if (!v) return `<div class="sg-row"><span>${y}</span><span class="fine">${NA}</span></div>`;
      return `<div class="sg-row"><span>${y}</span><div class="sg-bar">${v.map((x, i) => `<i class="${i === 2 || i === 1 || i === 3 ? "dk" : ""}" style="width:${x || 0}%;background:${SAT_C[i]}" data-tip="${esc(`<b>${y}년 ${Y.satisfaction[y].opts[i]}</b><br>${pct(x)}` + explain("l-sat", { k: Y.satisfaction[y].opts[i], y }))}">${(x || 0) >= 7 ? Math.round(x) : ""}</i>`).join("")}</div></div>`;
    };
    html("l-sat", `<div class="sg">${yrs.map(segRow).join("")}</div><div class="lg">${Y.satisfaction[2025].opts.map((o, i) => `<span><i style="background:${SAT_C[i]}"></i>${o}</span>`).join("")}</div>`);

    // 불만족 사유
    const rs = Y.reason[S.year], rv = rs.vals[S.group];
    $("l-reason-desc").textContent = `${S.year}년 · 문화·여가에 불만족한 응답자만 답합니다. ` +
      (S.year === 2025 ? "2025년부터 시설·정보·콘텐츠가 한 보기로 합쳐져 공급 부족인지 연결 부족인지 구분되지 않습니다." : "연도마다 보기가 달라 연도끼리 비교할 때 주의해야 합니다.");
    if (rv) hbars("l-reason", rs.opts.map((k, i) => ({ k, v: rv[i] })).filter((r) => r.k !== "기타").sort((a, b) => (b.v || 0) - (a.v || 0)), { cls: "pink wide" });
    else html("l-reason", naBox("이 연도 표에 해당 집단이 없습니다"));

    // 정책
    const po = Y.policy[S.year], pl = po[S.lmode][S.group];
    $("l-policy-desc").textContent = `${S.year}년 · ${S.lmode === "main" ? "주된 응답" : "복수응답"} 기준(위의 응답 기준 선택을 따름). '비용(물품)' 보기에는 문화예술이 아닌 여가 물품도 들어갑니다.`;
    if (pl) hbars("l-policy", po.opts.map((k, i) => ({ k, v: pl[i] })).filter((r) => !["기타", "없음"].includes(r.k)).sort((a, b) => (b.v || 0) - (a.v || 0)), { cls: "pink wide" });
    else html("l-policy", naBox("이 연도 표에 해당 집단이 없습니다"));
  }

  // ---------- 수요 ② ----------
  function renderDemand() {
    badges("b-demand", [["연령", 1, "cohort"], ["연도", 0, "year"], ["청년 집단", 0, "group"]]);
    $("d-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.dmode));
    const co = cohortName();
    show("d-na", S.cohort === "1934" ? `<b>문화지표에는 19~34세 값이 없습니다.</b> 보고서 표가 20대·30대로만 공표돼 ${NA}로 표시합니다. 20대와 30대 값을 합쳐도 19~34세와 구간이 맞지 않아 만들 수 없습니다. 왼쪽 '문화지표 연령'에서 20대나 30대를 고르면 값이 나옵니다. 참고: 도내 관람 경험 20대 ${pct(row("view_rate", "20")[0])}, 30대 ${pct(row("view_rate", "30")[0])}.` : "");
    const rt = (t, what, num, den) => `<b>${t}</b>` + tipLines({ what, f: RT(`${t} 비율`, num.replace("응답자", "응답 수"), den.includes("관람자") ? "도내 관람자 수" : "전체 응답 수"), num, den, note: W });
    html("d-rings", [
      ring(row("interest")[2], "향유에 관심 있음", `관심 없음 ${pct(row("interest")[0])}`, C.pink, rt("향유에 관심 있음", "표 3-43, 7점 척도 5~7점", "5~7점 응답자", cWho())),
      ring(row("view_rate")[0], "도내 관람 경험", `최근 1년 · 도민 전체 ${pct(row("view_rate", "all")[0])}`, C.pink, rt("도내 관람 경험", "표 3-7, 최근 1년 도내 관람", "관람 경험이 있는 응답자", cWho())),
      ring(row("part_rate")[0], "도내 참여 경험", `최근 1년 · 도민 전체 ${pct(row("part_rate", "all")[0])}`, C.pink, rt("도내 참여 경험", "표 3-29, 최근 1년 도내 참여", "참여 경험이 있는 응답자", cWho())),
      ring(row("satisfaction")[2], "관람자 만족", `불만족 ${pct(row("satisfaction")[0])} · 관람자만 응답`, C.view, rt("관람자 만족", "표 3-13, 이미 간 사람만 답한 값", "5~7점 응답자", `${co} 도내 관람자, 수는 ${UNK}`)),
    ].join(""));

    const cols = S.dmode === "1" ? null : T.view_123.cols;
    let rows;
    if (S.dmode === "1") {
      const v = viewMap(), w = wantMap();
      rows = Object.keys(w).filter((k) => k !== "기타").map((k) => ({ k, a: v[k], b: w[k] }));
    } else {
      const v = cmap(["view_123"]), w = cmap(["want_123"]);
      rows = cols.map((k) => ({ k, a: v[k], b: w[k] }));
    }
    rows.sort((x, y) => (y.b || 0) - (x.b || 0));
    pairbars("d-pair", rows, { la: `${co} 최근 관람`, lb: `${co} 향후 희망`, ca: C.view, cb: C.pink, naWhy: "문화지표 표에 19~34세 구분이 없습니다" });
    $("d-pair-src").textContent = S.dmode === "1" ? "표 3-8·3-9(최근 관람), 표 3-15·3-16(향후 희망). 1순위 응답 비율." : "표 3-10(최근 관람), 표 3-17(향후 희망). 상위 7개 분야만 표시합니다.";

    const ref = (key, cols2) => cols2.map((k, i) => ({ k, v: row(key)[i], ref: row(key, "all")[i] }));
    const naC = "문화지표 표에 19~34세 구분이 없습니다";
    hbars("d-barrier", ref("barrier", T.barrier.cols).filter((r) => r.k !== "기타").sort((a, b) => b.v - a.v), { cls: "pink wide", naWhy: naC });
    const need = T.need_a.cols.map((k, i) => ({ k, v: row("need_a")[i], ref: row("need_a", "all")[i] })).concat(T.need_b.cols.map((k, i) => ({ k, v: row("need_b")[i], ref: row("need_b", "all")[i] })));
    hbars("d-need", need.filter((r) => r.k !== "기타").sort((a, b) => b.v - a.v), { cls: "pink", fmt: (v) => pct(v), naWhy: naC });
    hbars("d-place", ref("place", T.place.cols).sort((a, b) => b.v - a.v), { cls: "pink narrow", naWhy: naC });
    hbars("d-env", ref("environment", T.environment.cols).sort((a, b) => b.v - a.v), { cls: "pink", naWhy: naC });

    const bi = (s) => T.barrier.cols.indexOf(s), ni = (s) => T.need_a.cols.indexOf(s);
    const pol = Y.policy[2025].main[GALL], rea = Y.reason[2025].vals[GALL], comp = Y.company[2025].vals[GALL];
    const c = (v, t, den) => `<div class="qa-c" data-tip="${esc(`<b>${esc(t)}</b><br>${pct(v)}` + tipLines({ f: RT("비율", "이 보기를 고른 응답 수", "응답자 수"), num: "이 보기를 고른 응답자", den: den || cWho(), note: W }))}"><b class="${v == null ? "na" : ""}">${pct(v)}</b><span>${esc(t)}</span></div>`;
    const yAll = `2025년 전체(19~39세) 응답자, ${ySample(2025, GALL)}`;
    html("d-qa", `<div class="qa">
      <div class="qa-row"><div class="qa-t">비용</div>${c(row("barrier")[bi("비용이 많이 들어서")], `막는 요인: 비용 (${co}, 표 3-14)`)}${c(row("need_a")[ni("문화예술 관람 비용 지원")], `필요한 것: 관람 비용 지원 (${co}, 표 3-19)`)}</div>
      <div class="qa-row">${c(rea[0], "불만족 이유: 경제적 부담 (청년통계 2025, 불만족자)", `2025년 불만족 응답자, 수는 ${UNK}`)}${c(pol[0], "필요 정책 1순위: 비용(물품) 지원 (청년통계 2025)", yAll)}</div>
      <div class="qa-row"><div class="qa-t">이동</div>${c(row("barrier")[bi("교통이 불편해서")], `막는 요인: 교통 불편 (${co})`)}${c(row("need_a")[ni("문화시설 접근성 개선(대중교통·주차장)")], `필요한 것: 접근성 개선 (${co})`)}</div>
      <div class="qa-row"><div class="qa-t">동행</div>${c(comp[0], "여가를 혼자 보냄 (청년통계 2025, 19~39세)", yAll)}${c(row("barrier")[bi("함께 갈 사람이 없어서")], `막는 요인: 함께 갈 사람 없음 (${co})`)}</div></div>`);

    // 제주 밖 관람 (국민문화예술활동조사)
    const O = D.arts.outside.rows;
    const small = (n) => n < 30;
    const cell = (a) => {
      const [v, n] = a;
      return `<span class="${small(n) ? "smalln" : ""}" data-tip="${esc(`<b>제주 밖 관람 ${v == null ? NA : f1(v) + "%"}</b>` + tipLines({ f: RT("도외 관람 비율", "다른 시·도에서 관람한 관람자 수", "그 장르 관람자 수"), num: "사는 곳이 아닌 시·도에서 관람했다고 답한 관람자", den: `그 장르 제주 관람자 표본 ${n}명`, note: n < 30 ? "표본이 30명 미만이라 해마다 크게 흔들립니다." : W }))}">${f1(v)} <small>n=${n}</small></span>`;
    };
    html("k-outside", table([{ label: "장르", get: (r) => r.k }, { label: "제주 2024", num: 1, html: (r) => cell(r.jeju["2024"]) }, { label: "제주 2025", num: 1, html: (r) => cell(r.jeju["2025"]) },
      { label: "전국 전체", num: 1, get: (r) => f1(r.nat["전체"]) }, { label: "전국 20대", num: 1, get: (r) => f1(r.nat["20대"]) }, { label: "전국 30대", num: 1, get: (r) => f1(r.nat["30대"]) }], O) +
      `<p class="fine">단위 %, 전국은 2025년. '${NA}'은 원표에 값이 표기되지 않은 칸입니다.</p>`);
    const seoul = row("out_seoul")[0], want = row("out_reason")[0];
    const outDen = `${co} 도외 관람자, 수는 ${UNK}`;
    html("d-out", `<div class="qa"><div class="qa-row"><div class="qa-t">도외 관람자에게 물었을 때 (문화지표, ${esc(co)})</div>${c(want, "'원하는 프로그램이 타 지역에 있어서' (표 3-41, 1순위)", outDen)}${c(seoul, "도외 관람 지역 중 서울 (표 3-39)", outDen)}</div></div>`);

    // 관람과 의향
    const G = D.arts.genre, ap = S.apop;
    pairbars("k-pair", G.cols.map((k, i) => ({ k, a: G.view.rows[ap][i], b: G.want.rows[ap][i] })), { la: "지난 1년 관람", lb: "앞으로 관람 의향", ca: C.view, cb: C.pink });
    const rate = D.arts.rate.rows[ap];
    $("k-pair-note").textContent = `${ap}(표본 ${int(D.arts.n[ap])}명) 전체 관람률 ${pct(rate[2])} (2023 ${pct(rate[0])}, 2024 ${pct(rate[1])}). 이 값은 도외 관람을 포함합니다.${ap === "제주 전 연령" ? ` 무용 관람률은 ${NA}입니다.` : ""}`;

    const B = D.arts.barrier, pops = D.arts.pops, b25 = B.rows["2025"];
    const maxIdx = Object.fromEntries(pops.map((p) => [p, b25[p].indexOf(Math.max(...b25[p]))]));
    html("k-barrier", table([{ label: "걸림돌(%)", get: (r) => r.k }].concat(pops.map((p) => ({ label: p.replace(" 전 연령", ""), num: 1, html: (r) => (maxIdx[p] === r.i ? `<b>${f1(r.v[p])}</b>` : f1(r.v[p])) }))),
      B.cols.map((k, i) => ({ k, i, v: Object.fromEntries(pops.map((p) => [p, b25[p][i]])) }))));
    const j = b25["제주 전 연령"], ix = (s) => B.cols.indexOf(s);
    $("k-barrier-note").textContent = `제주의 비용 걸림돌은 ${pct(j[ix("비용이 많이 듦")])}로 전국 ${pct(b25["전국 전체"][ix("비용이 많이 듦")])}, 전국 20대 ${pct(b25["전국 20대"][ix("비용이 많이 듦")])}보다 낮고, '가까운 곳에 시설 없음'은 2024년(${pct(B.rows["2024"]["제주 전 연령"][0])})에 이어 1위입니다. 제주 표본이 301명이라 해마다 값이 크게 달라집니다.`;

    const N = D.national;
    html("t-national", table([{ label: "구분", get: (r) => `${r.k} (n=${int(N.n[r.k])})` }].concat(N.opts.slice(0, 6).map((o, i) => ({ label: o.replace("관람", "").replace("공연", ""), num: 1, get: (r) => f1(r.v[i]) }))),
      Object.keys(N.rows).map((k) => ({ k, v: N.rows[k] })), (r) => r.k.startsWith("제주")));
  }

  // ---------- 공급 ① ----------
  const RATIO = ["facility", "festival_pc", "exhibit_days", "act_visual", "act_total", "budget", "open_pc", "tix_pc", "tix_per_show", "amt_pc"];
  function renderBase() {
    badges("b-base", [["기간", 0, "period"], ["장르", 0, "genre"], ["지역", 0, "area"]]);
    const items = RATIO.map(M).map((m) => ({ m, r: m.vals["제주"] / m.nat })).sort((a, b) => b.r - a.r);
    const lim = Math.log2(Math.max(...items.map((i) => Math.max(i.r, 1 / i.r))));
    html("b-ratio", `<ul class="hb ratio">` + items.map(({ m, r }) => {
      const w = (Math.abs(Math.log2(r)) / lim) * 50, up = r >= 1;
      const d = MDEF[m.id];
      const tip = `<b>${esc(m.label)} ${f1(r, 2)}배</b><br><small>${m.year} · ${esc(m.src)}</small>` + tipLines({ what: `각 값은 ${RT(m.label.replace(/ \(.*\)$/, ""), d[0], d[1], d[2])}`, f: "배율 = 제주 값 ÷ 전국 값", calc: `${metricText(m, m.vals["제주"])} ÷ ${metricText(m, m.nat)} = ${f1(r, 2)}배`, num: `제주 ${metricText(m, m.vals["제주"])}`, den: `전국 ${metricText(m, m.nat)}` });
      return `<li data-tip="${esc(tip)}"><span class="hb-k">${esc(m.label.replace(" (인구 10만 명당)", " (10만 명당)").replace(" (인구 1,000명당)", " (1천 명당)"))}</span><span class="hb-t center"><b class="hb-mid"></b><i style="${up ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:${up ? "var(--accent)" : "var(--amber)"}"></i></span><span class="hb-v">${f1(r, 2)}배</span></li>`;
    }).join("") + "</ul>");
    html("t-ratio", table([{ label: "지표", get: (i) => i.m.label }, { label: "제주", num: 1, get: (i) => metricText(i.m, i.m.vals["제주"]) }, { label: "전국", num: 1, get: (i) => metricText(i.m, i.m.nat) },
      { label: "배율", num: 1, get: (i) => f1(i.r, 2) }, { label: "기준", get: (i) => `${i.m.year} ${i.m.src}` }], items));

    const m = M(S.metric);
    $("b-rank-desc").textContent = `제주 ${metricText(m, m.vals["제주"])} (${m.n}개 시도 중 ${m.rank}위) · 전국 ${metricText(m, m.nat)} · ${m.year} ${m.src}. 세로선은 전국 값입니다.`;
    const rows = Object.entries(m.vals).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k: k === "전남광주" ? "전남·광주" : k, v, hl: k === "제주", ref: m.nat }));
    hbars("b-rank", rows, { cls: "emph narrowk", fmt: (v) => metricText(m, v) });
    $("b-rank-note").textContent = m.note;

    const yb = D.regions.yearbook, yt = D.regions.yearbookTotal;
    const lab = { "시각예술": "시각예술", "양악": "양악", "연극": "연극", "혼합": "혼합", "무용": "무용", "국악": "국악" };
    pairbars("b-yearbook", Object.keys(lab).map((k) => ({ k, a: (yb["제주"][k] / yt["제주"]) * 100, b: (yb["전국"][k] / yt["전국"]) * 100, an: yb["제주"][k], at: yt["제주"], bn: yb["전국"][k], bt: yt["전국"] })), { la: `제주 (${int(yt["제주"])}건)`, lb: `전국 (${int(yt["전국"])}건)`, ca: C.purple, cb: C.gray });

    const tv = D.regions.topVenues, tot = yt["제주"], s5 = sum(tv.map((t) => t.n));
    $("b-top-desc").textContent = `상위 5곳이 제주 전체 활동 ${int(tot)}건 중 ${int(s5)}건(${f1((s5 / tot) * 100)}%)을 차지합니다. 상위 3곳은 모두 공공시설입니다.`;
    const mx = tv[0].n;
    html("b-top", tv.map((t) => `<li data-tip="${esc(`<b>${esc(t.k)}</b><br>${int(t.n)}건 (공연 ${int(t.perf)} · 전시 ${int(t.visual)})` + tipLines({ what: "문예연감 활동 건수 중 이 시설의 비중", f: RT("비중", "이 시설 활동 건수", "제주 전체 활동 건수"), calc: PCT(t.n, tot, "건"), num: `이 시설 ${int(t.n)}건`, den: `제주 전체 ${int(tot)}건` }))}"><span class="nm">${esc(t.k)} <small>공연 ${int(t.perf)} · 전시 ${int(t.visual)}</small></span><span class="v">${int(t.n)}건</span><div class="bar" style="width:${(t.n / mx) * 100}%"></div></li>`).join(""));

    // 전시관
    const hs = D.halls, nH = hs.length, cntH = (fn) => hs.filter(fn).length, eup = cntH((h) => h.eup), priv = cntH((h) => h.type === "사립");
    $("b-hall-desc").textContent = `제주 전시관 ${nH}곳 중 사립이 ${priv}곳이고, 주소에 읍·면이 적힌 곳이 ${eup}곳입니다. 명칭으로 보면 테마·체험형 사립 시설이 많아 보입니다. 20대가 도내에서 관람한 장소의 ${pct(row("place", "20")[0])}가 제주시 동지역인 것과 위치가 다릅니다.`;
    const hb2 = (id, ks, fn) => hbars(id, ks.map((k) => ({ k, v: cntH((h) => fn(h) === k) })), { cls: "narrow", fmt: (v) => `${v}곳`, max: nH });
    hb2("b-hall-type", ["사립", "공립"], (h) => h.type);
    hb2("b-hall-city", ["서귀포시", "제주시"], (h) => h.city);
    const fc = D.facilities, fl = fc.list, top3 = sum(fl.slice(0, 3).map((f) => f.sold));
    $("b-fac-desc").textContent = `KOPIS에 등록된 제주 공연시설은 ${int(fc.n)}곳(공연장 ${int(fc.halls)}개, 폐관 표시 ${fc.closed.length}곳 포함)입니다. 2025년에 공연 목록에 나온 시설은 ${int(fc.withShow)}곳, 판매 기록이 있는 시설은 ${int(fc.withSold)}곳이고, 판매의 ${f1((top3 / fc.soldTotal) * 100)}%가 상위 3곳에 몰립니다.`;
    const fb = (id, ks, key) => hbars(id, ks.map((k) => ({ k, v: fl.filter((f) => f[key] === k).length })), { cls: "narrow", fmt: (v) => `${v}곳`, max: fc.n });
    fb("b-fac-type", ["비공연장", "민간", "공공 기타", "공공 문예회관"], "type");
    fb("b-fac-city", ["제주시", "서귀포시"], "city");
    hbars("b-fac-top", fl.slice(0, 5).map((f) => ({ k: f.k, v: f.sold })), { cls: "narrow", fmt: (v) => int(v) });
    $("b-fac-note").textContent = `등록 좌석 ${int(fc.seats)}석의 ${f1((fc.bigSeats / fc.seats) * 100)}%는 경기장·체육관·컨벤션 등 대형 시설입니다. 좌석 수는 공연 공급 지표로 쓰지 않습니다. 판매는 KOPIS에 집계된 값이라 대관·무료 공연이 많은 시설은 낮게 나옵니다. KOPIS 지역 통계의 공연시설 수(${fc.stat.facilities}곳)가 목록(${int(fc.n)}곳)보다 적은 것은 폐관 시설을 빼고 셌기 때문으로 보입니다.`;
    html("t-fac", table([{ label: "시설", get: (f) => f.k }, { label: "성격", get: (f) => f.type }, { label: "행정시", get: (f) => f.city }, { label: "좌석", num: 1, get: (f) => (f.seats ? int(f.seats) : UNK) },
      { label: "2025 공연 목록", get: (f) => (f.show ? "있음" : "없음") }, { label: "2025 회차", num: 1, get: (f) => (f.times ? int(f.times) : NA) }, { label: "2025 판매", num: 1, get: (f) => (f.sold ? int(f.sold) : NA) }], fl));
    html("t-hall", table([{ label: "명칭", get: (h) => h.k }, { label: "구분", get: (h) => h.type }, { label: "행정시", get: (h) => h.city }, { label: "주소에 읍·면", get: (h) => (h.eup ? "있음" : UNK) }], hs));

    // 조사별 전국 대비 방향
    const G = D.arts.genre, gi = (k) => G.cols.indexOf(k), jv = G.view.rows["제주 전 연령"], nv = G.view.rows["전국 전체"];
    const dir = (j, n) => (j > n ? "전국보다 높음" : j < n ? "전국보다 낮음" : "같음");
    const sv = (id) => { const m = M(id); return `${f1(m.vals["제주"])} / ${f1(m.nat)} (${m.rank}위)`; };
    const kv = (k) => `${esc(k)} ${f1(jv[gi(k)])} / ${f1(nv[gi(k)])}`;
    const dirM = (id) => dir(M(id).vals["제주"], M(id).nat);
    const dirK = (ks) => ks.map((k) => `${esc(k)}: ${dir(jv[gi(k)], nv[gi(k)])}`).join("<br>");
    html("t-survey", table([{ label: "장르", get: (r) => r.k }, { label: "사회조사 제주/전국(%)", num: 1, get: (r) => sv(r.m) }, { label: "사회조사 방향", get: (r) => dirM(r.m) },
      { label: "국민조사 제주/전국(%)", html: (r) => r.g.map(kv).join("<br>") }, { label: "국민조사 방향", html: (r) => dirK(r.g) }],
      [{ k: "연극·뮤지컬", m: "see_play", g: ["연극", "뮤지컬"] }, { k: "음악·콘서트", m: "see_music", g: ["대중음악/연예", "서양음악"] }, { k: "미술", m: "see_gallery", g: ["미술전시회"] }, { k: "영화", m: "see_movie", g: ["영화"] }]));
  }

  // ---------- 공급 ② ----------
  let map = null, layer = null;
  function initMap() {
    if (!HAS_L) { show("map-warn", "지도 라이브러리를 불러오지 못했습니다. 오른쪽 표로 확인하세요."); $("venue-map").hidden = true; return; }
    map = L.map("venue-map", { scrollWheelZoom: false, zoomSnap: 0.25, maxZoom: 14 }).fitBounds([[33.2, 126.15], [33.56, 126.95]]);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function renderSupply() {
    const list = sel(), perf = list.filter((x) => x.src === "K");
    badges("b-supply", [["기간", 1, "period"], ["장르", 1, "genre"], ["지역", 1, "area"], ["대상", 1, "target"], ["요금", 1, "price"], ["상설", 1, "tour"]]);
    const cv = D.coverage;
    show("cov-note", `<b>KOPIS 편수는 실제 공급보다 적게 잡힙니다.</b> 제주문예회관 공연장의 2025년 일정에는 행사가 ${int(cv.uniqueEvents)}건(공연으로 보이는 것 ${int(cv.perfLike)}건) 있지만 KOPIS 목록에는 ${int(cv.kopis2025)}편만 있습니다. 서귀포예술의전당도 행사 ${int(cv.seogwipo.uniqueEvents)}건(공연으로 보이는 것 ${int(cv.seogwipo.perfLike)}건)에 KOPIS ${int(cv.seogwipo.kopis2025)}편입니다. 대관·무료 연주회가 많이 빠지는 것으로 보입니다. 전시는 제주문예회관·서귀포예술의전당 전시실, 제주돌문화공원, 국립제주박물관 특별전만 집계돼 제주 전체 전시가 아닙니다(도립미술관 등 미포함).`);

    // 월별 개막
    const ms = MONTHS.filter((m) => m >= S.start && m <= S.end);
    const byM = (arr) => ms.map((m) => arr.filter((x) => +x.st.slice(0, 4) * 100 + +x.st.slice(5, 7) === m).length);
    const exAll = list.filter((x) => x.src !== "K"), a = byM(perf), b = byM(exAll);
    const hasData = sum(a) + sum(b) > 0;
    const daysOf = (src) => exAll.filter((x) => x.src === src).map((x) => x.days).sort((p, q) => p - q);
    const median = (a) => (a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null);
    const exA = daysOf("A"), exG = daysOf("G"), exS = daysOf("S"), med = median(exA);
    const medTxt = (a) => (a.length ? `${int(a.length)}건 ${f1(median(a), median(a) % 1 ? 1 : 0)}일` : "선택 조건에 없음");
    const s23 = D.coverage.self2023, rent = exAll.filter((x) => x.kind === "대관").length;
    $("ex-note").textContent = med == null ? "" : `운영 기간 중앙값은 제주문예회관 ${medTxt(exA)}(대관 표시 ${int(rent)}건), 서귀포예술의전당 전시실 ${medTxt(exG)}, 제주돌문화공원 ${medTxt(exS)}입니다. 공공 전시실은 짧고 기획전은 깁니다. 제주문예회관의 2023년 자체 기획전 ${s23.exhibits}건은 ${s23.min}~${s23.max}일이었습니다. 문예연감의 제주 평균 전시기간 ${f1(M("exhibit_days").vals["제주"])}일은 집계 대상이 달라, '전시는 오래 열린다'를 모든 전시에 적용하지 않습니다.`;
    show("open-empty", hasData ? "" : "선택한 조건에 맞는 공연·전시가 없습니다.");
    drawChart("open", "c-open", hasData ? {
      type: "bar",
      data: { labels: ms.map(ymShort), datasets: [{ label: "공연(KOPIS)", data: a, backgroundColor: C.purple, borderRadius: 3, stack: "s" }, { label: "전시(공공 전시장 4곳)", data: b, backgroundColor: C.teal, borderRadius: 3, stack: "s" }] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${int(c.parsed.y)}건`, afterBody: () => ["무엇: 선택 조건의 목록 중 그 달에 시작한 공연·전시 수", "계산식: " + COUNT, "연령 구분 없음"] } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "개막 건수" } } } },
    } : null);

    // KOPIS 월별
    const key = S.kmetric, lab = { sold: "판매수(장)", amt: "판매액(원)", open: "개막 편수", times: "상연 횟수" }[key];
    const yrs = [2023, 2024, 2025, 2026];
    drawChart("sales", "c-sales", {
      type: "line",
      data: { labels: [...Array(12).keys()].map((i) => `${i + 1}월`), datasets: yrs.map((y) => ({ label: y === 2026 ? "2026(10월까지)" : String(y), borderColor: YEAR_COLORS[y], backgroundColor: YEAR_COLORS[y], borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, tension: .25,
        data: [...Array(12).keys()].map((i) => { const r = D.monthly["제주"].find((x) => x.ym === `${y}-${String(i + 1).padStart(2, "0")}`); return r ? r[key] : null; }) })) },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 2 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${int(c.parsed.y)}`, afterBody: () => ["무엇: " + KDEF[key], "계산식: " + COUNT, "전 연령이고 도민·관광객을 나누지 않습니다."] } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: lab }, ticks: { callback: (v) => (v >= 1e8 ? `${v / 1e8}억` : v >= 1e4 ? `${v / 1e4}만` : v) } } } },
    });

    // 속성
    const n = perf.length;
    $("a-desc").textContent = `공연 ${int(n)}편 기준입니다(전시 제외). 대상은 KOPIS 상세 정보의 아동공연 표시, 요금은 최저가, 시간대는 공연 시간표에서 읽은 값입니다.`;
    const cnt = (fn) => { const m = {}; perf.forEach((x) => { [].concat(fn(x)).forEach((k) => { m[k] = (m[k] || 0) + 1; }); }); return m; };
    const attr = (id, order, m) => hbars(id, order.map((k) => ({ k, v: m[k] || 0, n, tip: `<b>${esc(k)}</b><br>${int(m[k] || 0)}편 · 공연의 ${n ? f1(((m[k] || 0) / n) * 100) : 0}%` })), { cls: "narrow", fmt: (v) => `${int(v)}편`, max: Math.max(...order.map((k) => m[k] || 0), 1) });
    attr("a-run", ["1~2일", "3~14일", "15일 이상", "상설"], cnt((x) => x.rl));
    attr("a-target", ["아동·가족", "그 외"], cnt((x) => (x.ch ? "아동·가족" : "그 외")));
    attr("a-price", ["무료", "2만 원 미만", "2~5만 원", "5만 원 이상", UNK], cnt((x) => x.pr));
    attr("a-slot", ["주말 낮", "주말 저녁", "주중 낮", "주중 저녁", UNK], cnt((x) => (x.ts && x.ts.length ? x.ts : UNK)));
    attr("a-area", ["제주시 동", "제주시 읍면", "서귀포시 동", "서귀포시 읍면"], cnt((x) => `${x.city} ${x.loc}`));
    attr("a-prov", ["공공", "민간", "기타(비공연장)"], cnt((x) => x.prov));

    // 공연장
    const vc = {};
    list.forEach((x) => { vc[x.vid] = (vc[x.vid] || 0) + 1; });
    const venues = D.venues.filter((v) => vc[v.id]).map((v) => ({ ...v, n: vc[v.id] })).sort((p, q) => q.n - p.n);
    const total = sum(venues.map((v) => v.n)), top5 = sum(venues.slice(0, 5).map((v) => v.n));
    const dong = list.filter((x) => x.city === "제주시" && x.loc === "동").length;
    $("v-desc").textContent = total ? `상위 5개 공연장이 ${f1((top5 / total) * 100)}%, 제주시 동지역이 ${f1((dong / list.length) * 100)}%를 차지합니다. 20대가 관람한 장소의 ${pct(row("place", "20")[0])}가 제주시 동지역인 것과 방향이 같습니다. 원의 크기는 공연 건수입니다.` : "선택한 조건에 맞는 공연장이 없습니다.";
    html("t-venue", table([{ label: "공연장", get: (v) => v.name }, { label: "건수", num: 1, get: (v) => int(v.n) }, { label: "비중", num: 1, get: (v) => pct((v.n / total) * 100) }, { label: "특성", get: (v) => v.kind.replace(/\(.*\)/, "") }], venues.slice(0, 12)));
    if (map) {
      layer.clearLayers();
      const mx = venues.length ? venues[0].n : 1;
      venues.forEach((v) => {
        if (!v.la) return;
        L.circleMarker([v.la, v.lo], { radius: 5 + Math.sqrt(v.n / mx) * 19, color: "#fff", weight: 1.5, fillColor: C.purple, fillOpacity: .62 })
          .bindTooltip(`<b>${esc(v.name)}</b><br>${int(v.n)}건 · ${esc(v.kind)}<br><small><b>계산식</b> 비중 = 이 공연장 건수 ÷ 선택 조건 전체 건수 × 100<br><b>계산</b> ${int(v.n)}건 ÷ ${int(total)}건 × 100 = ${f1((v.n / total) * 100)}%</small>`).addTo(layer);
      });
    }

    // 목록
    const sorted = list.slice().sort((p, q) => (p.st < q.st ? -1 : p.st > q.st ? 1 : 0));
    $("list-desc").textContent = `${int(sorted.length)}건 · 행을 누르면 상세 정보가 열립니다.`;
    html("t-list", table([{ label: "시작일", get: (x) => x.st }, { label: "제목", get: (x) => x.t.slice(0, 34) }, { label: "장르", get: (x) => x.g }, { label: "장소", get: (x) => x.v }, { label: "요금", get: (x) => x.pr }],
      sorted.slice(0, 400).map((x) => ({ ...x, _id: x.id }))));

    const sn = D.snapshot;
    $("snap-desc").textContent = `제주in놀다 등록 행사 ${int(sn.n)}건(${sn.date} 조회). 조회 시점 이후의 행사만 제공돼 2025년 공급으로는 쓰지 않습니다. KOPIS에 없는 전시·축제의 규모를 가늠하는 참고값입니다.`;
    hbars("snap", sn.cats.map((c) => ({ k: c.k, v: c.v })), { cls: "narrow", fmt: (v) => `${v}건` });

    // 지역축제
    const fe = D.festival, fin = festIn(), fm = M("festival_pc");
    $("f-desc").textContent = `2025년 문체부 개최계획에 제주 축제 ${fe.n}건이 있습니다. 인구 10만 명당 ${f1(fm.vals["제주"])}건으로 전국 ${f1(fm.nat)}건의 ${f1(fm.vals["제주"] / fm.nat)}배이고 시도 중 ${fm.rank}위입니다. 선택 기간에 열리는 계획은 ${int(fin.length)}건입니다. ${fe.tourism}`;
    const kinds = {}; fe.list.forEach((x) => x.types.forEach((k) => { kinds[k] = (kinds[k] || 0) + 1; }));
    hbars("f-type", Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })), { cls: "narrow", fmt: (v) => `${v}건` });
    const fmon = {}; fe.list.forEach((x) => { const k = x.st ? `${+x.st.slice(5, 7)}월` : UNK; fmon[k] = (fmon[k] || 0) + 1; });
    hbars("f-month", [...[...Array(12).keys()].map((i) => `${i + 1}월`), UNK].filter((k) => fmon[k]).map((k) => ({ k, v: fmon[k] })), { cls: "narrow", fmt: (v) => `${v}건` });
    hbars("f-trend", fe.trend.map((t) => ({ k: `${t.y}년`, v: t.jeju, nat: t.nat, hl: t.y === fe.year })), { cls: "narrow", fmt: (v) => `${v}건` });
    $("f-note").textContent = `계획 자료라 실제 개최 여부와 다를 수 있습니다. 날짜까지 있는 계획은 ${fe.exactDate}건, 월까지만 있는 계획은 ${fe.monthOnly}건, 시기가 적혀 있지 않은 계획은 ${fe.noDate}건입니다. 그래서 주말 달력에는 넣지 않습니다. 축제 전체가 문화예술은 아니며, 문화예술 유형은 ${kinds["문화예술"] || 0}건입니다.`;
    html("t-fest", table([{ label: "시작", get: (x) => x.st || UNK }, { label: "종료", get: (x) => x.en || UNK }, { label: "축제명", get: (x) => x.t }, { label: "유형", get: (x) => x.types.join(", ") || UNK }, { label: "시군", get: (x) => x.city || UNK }, { label: "장소", get: (x) => x.place || UNK },
      { label: "예산(백만 원)", num: 1, get: (x) => int(x.budget) }, { label: "전년 방문객", num: 1, get: (x) => int(x.visit) }], fe.list));
    renderDetail();
  }
  function renderDetail() {
    const x = S.detail && BY_ID[S.detail], el = $("show-detail");
    el.hidden = !x;
    if (!x) return;
    const row2 = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(v || UNK)}</dd></div>`;
    el.innerHTML = `<div class="sd-head"><h3>${esc(x.t)} <span class="cat">${esc(x.g)}</span></h3><button type="button" class="sd-close" id="sd-close" aria-label="상세 닫기">×</button></div>
      <dl class="sd-grid">${row2("기간", `${x.st} ~ ${x.en}`)}${row2("운영 기간", x.days ? `${x.days}일 (${x.rl})` : x.rl)}${row2("장소", `${x.v}${x.room && x.room !== x.v ? " " + x.room : ""}`)}${row2("지역", `${x.city} ${x.loc}`)}${row2("요금", x.pr + (x.lo ? ` (최저 ${int(x.lo)}원)` : ""))}${row2("관람 연령", x.age)}${row2("아동·가족 공연", x.src === "K" ? (x.ch ? "예" : "아니요") : "")}${row2("요일·시간대", (x.ts || []).join(", "))}${row2("출처", ({ K: "KOPIS", A: "제주문예회관 일정", G: "서귀포시 문화예술포털", S: "제주돌문화공원 전시·행사", M: "문화공공데이터광장" })[x.src])}</dl>`;
    $("sd-close").onclick = () => { S.detail = null; renderDetail(); };
  }

  // ---------- 주말 ----------
  const WK_BINS = [[1, "#e4dcfd", "#211b3d"], [3, "#c3b4f7", "#211b3d"], [6, "#957ce9", "#fff"], [Infinity, "#6d4fd8", "#fff"]];
  const GAPS = [["연극·뮤지컬", ["연극", "뮤지컬"]], ["연극", ["연극"]], ["뮤지컬", ["뮤지컬"]], ["대중음악/연예", ["대중음악/연예"]], ["서양음악", ["서양음악"]], ["전통예술", ["전통예술"]], ["무용", ["무용"]]];
  const quickOn = () => S.genre === "연극·뮤지컬" && S.target === "noChild";
  function renderWeekend() {
    badges("b-weekend", [["기간", 1, "period"], ["장르", 1, "genre"], ["지역", 1, "area"], ["대상", 1, "target"], ["요금", 1, "price"], ["상설", 1, "tour"]]);
    const sats = saturdays(), perf = D.shows.filter((x) => match(x));
    $("w-quick").textContent = quickOn() ? "전체 공연 보기" : "아동 공연을 뺀 연극·뮤지컬만 보기";
    const counts = sats.map((s) => onWeekend(perf, s).length);
    const empty = counts.filter((c) => c === 0).length, open = sats.length - empty;
    const avg = sats.length ? sum(counts) / sats.length : 0;
    const nS = `선택 기간 주말 ${sats.length}번`;
    html("w-tiles", [[`${sats.length}번`, "선택 기간 주말", { what: "선택 기간의 토요일 수", f: COUNT }], [`${open}번`, "공연이 1편 이상 열린 주말", { f: RT("열린 주말 비율", "열린 주말 수", "선택 기간 주말 수"), calc: PCT(open, sats.length, "번"), num: `열린 주말 ${open}번`, den: nS }], [`${empty}번`, "공연이 없던 주말", { f: RT("빈 주말 비율", "빈 주말 수", "선택 기간 주말 수"), calc: PCT(empty, sats.length, "번"), num: `빈 주말 ${empty}번`, den: nS }], [f1(avg), "주말 평균 공연 수", { f: "주말 평균 공연 수 = 주말별 공연 수 합 ÷ 선택 기간 주말 수", calc: `${int(sum(counts))}편 ÷ ${sats.length}번 = ${f1(avg)}편`, num: `주말별 공연 수 합 ${int(sum(counts))}`, den: nS }]]
      .map(([b, s, e]) => `<div class="tile" data-tip="${esc(`<b>${s}</b><br>${b}` + tipLines(e))}"><b>${b}</b><span>${s}</span></div>`).join(""));

    const byM = {};
    sats.forEach((s, i) => { (byM[s.slice(0, 7)] = byM[s.slice(0, 7)] || []).push([s, counts[i]]); });
    const cell = ([s, c]) => {
      const bin = WK_BINS.find((b) => c <= b[0]);
      const st = c ? `--bgc:${bin[1]};--fg:${bin[2]}` : "";
      return `<button type="button" class="cal-c ${c ? "" : "zero"} ${S.wsel === s ? "sel" : ""}" style="${st}" data-sat="${s}" aria-label="${s} 주말 공연 ${c}편" data-tip="${esc(`<b>${s.slice(5).replace("-", "/")} 주말</b><br>공연 ${c}편` + tipLines({ what: "토·일 중 하루라도 열린 공연 수", f: COUNT, note: "기간·장르·지역·대상·요금·상설 필터가 적용됩니다." }))}"><b>${c}</b><small>${+s.slice(8)}일</small></button>`;
    };
    html("w-cal", `<div class="cal">${Object.keys(byM).map((k) => `<div class="cal-row"><span class="cal-m">${+k.slice(0, 4) % 100}년 ${+k.slice(5)}월</span>${byM[k].map(cell).join("")}${'<span class="cal-blank"></span>'.repeat(5 - byM[k].length)}</div>`).join("")}</div>`);
    html("w-legend", `<span><i style="background:#fff;box-shadow:inset 0 0 0 1.5px var(--amber)"></i>0편</span>` + [["1편", 0], ["2~3편", 1], ["4~6편", 2], ["7편 이상", 3]].map(([t, i]) => `<span><i style="background:${WK_BINS[i][1]}"></i>${t}</span>`).join(""));

    $("w-gap-desc").textContent = `아동 공연을 뺀 공연이 한 편도 없던 주말 수입니다(${sats.length}번 중). 기간·지역·요금·상설 필터가 적용됩니다.`;
    const base = D.shows.filter((x) => match(x, { noGenre: true, noTarget: true }) && !x.ch);
    hbars("w-gap", GAPS.map(([k, gs]) => ({ k, v: emptyWeekends(base.filter((x) => gs.includes(x.g)), sats), hl: k === "연극·뮤지컬" })), { cls: "amber narrow", fmt: (v) => `${v}번`, max: Math.max(sats.length, 1) });

    if (S.wsel && !sats.includes(S.wsel)) S.wsel = null;
    if (!S.wsel) {
      $("w-list-h").textContent = "선택한 주말";
      html("w-list", '<p class="fine">달력의 칸을 누르면 그 주말에 열린 공연이 표시됩니다.</p>');
    } else {
      const items = onWeekend(perf, S.wsel);
      $("w-list-h").textContent = `${S.wsel.slice(5).replace("-", "/")} 주말 공연 ${items.length}편`;
      html("w-list", items.length ? `<ul class="wl">${items.map((x) => `<li>${esc(x.t)}<small>${esc(x.g)} · ${esc(x.v)} · ${esc(x.pr)}${x.ch ? " · 아동·가족" : ""}</small></li>`).join("")}</ul>` : '<p class="fine">이 주말에는 조건에 맞는 공연이 없습니다.</p>');
    }
  }

  // ---------- 청년문화예술패스 ----------
  const PS = D.pass;
  const srcTxt = (ids) => [].concat(ids).map((i) => `${PS.sources[i].name} (${PS.sources[i].date}, ${PS.sources[i].checked})`).join(" / ");
  function passGroups(id, groups, kind) {
    html(id, groups.map((g, i) => `<div class="pg"><h4 class="pg-h">${esc(g.title)} <small>${esc(g.target)} · ${esc(g.basis)}</small></h4><div id="${id}-${i}"></div><p class="fine">${esc(g.note)}</p></div>`).join(""));
    groups.forEach((g, i) => {
      EX[`${id}-${i}`] = (r) => ({
        what: `${g.title}(${g.target}) · ${g.basis}`,
        f: kind === "issue" ? RT("발급률", "발급받은 사람 수", "지원 대상자 수") : RT("집행률(예산 대비 이용률)", "패스로 쓴 금액", "배정 예산"),
        calc: r.num ? `${int(r.num)}명 ÷ ${int(r.den)}명 × 100 = ${f1((r.num / r.den) * 100)}%` : "",
        num: r.num ? `${int(r.num)}명` : `공개 자료에 없음(${UNK})`, den: r.den ? `${int(r.den)}명` : `공개 자료에 없음(${UNK})`,
        note: `출처: ${srcTxt(g.src)}`,
      });
      hbars(`${id}-${i}`, g.rows.map((r) => ({ ...r, cls: r.k === "제주" ? "jeju" : r.k === "전국" ? "nat" : "" })), { cls: "pass narrow", fmt: (v) => `${f1(v)}%`, max: 100 });
    });
  }
  function renderPass() {
    const g25 = PS.issue[0], u25 = PS.use[0], tr = PS.jejuTrend, j = (g) => g.rows.find((r) => r.k === "제주").v, o = (g, k) => (g.rows.find((r) => r.k === k) || {}).v;
    html("p-tiles", [
      [`${f1(j(g25))}%`, "제주 발급률(2025년 사업)", `17개 시도 중 가장 낮음 · 서울 ${f1(o(g25, "서울"))}% · 전국 ${f1(o(g25, "전국"))}%`, { f: RT("발급률", "발급받은 사람 수", "지원 대상자 수"), num: `공개 자료에 없음(${UNK})`, den: `공개 자료에 없음(${UNK})`, note: `출처: ${srcTxt(g25.src)}` }],
      [`${f1(j(u25))}%`, "제주 집행률(2025년 사업)", `서울 ${f1(o(u25, "서울"))}% · 전국 ${f1(o(u25, "전국"))}%`, { f: RT("집행률", "패스로 쓴 금액", "배정 예산"), num: `패스로 쓴 금액, 기사에 없음(${UNK})`, den: `배정 예산, 기사에 없음(${UNK})`, note: `출처: ${srcTxt(u25.src)}` }],
      [`${f1(tr[tr.length - 1].v)}%`, "제주 집행률(2026년 6월)", "연중 중간값 · 영화·도서 추가 후", { f: RT("집행률", "패스로 쓴 금액", "배정 예산"), num: `패스로 쓴 금액, 기사에 없음(${UNK})`, den: `배정 예산, 기사에 없음(${UNK})`, note: `출처: ${srcTxt(tr[tr.length - 1].src)}` }],
      ["9곳", "제주의 패스 사용처", "2026년 7월 9일 기준", { what: "패스 홈페이지에서 제주로 검색되는 사용처 수", f: COUNT, note: `출처: ${srcTxt("headline")}` }],
    ].map(([b, k, sub2, e]) => `<div class="tile jeju" data-tip="${esc(`<b>${k}</b><br>${b}` + tipLines(e))}"><b>${b}</b><span>${k}</span><small>${esc(sub2)}</small></div>`).join(""));
    passGroups("p-issue", PS.issue, "issue");
    passGroups("p-use", PS.use, "use");
    EX["p-trend"] = (r) => ({ what: r.note, f: RT("집행률", "패스로 쓴 금액", "배정 예산"), calc: r.num ? `${r.num} ÷ ${r.den} × 100 = ${f1(r.v)}%` : "", num: r.num || `기사에 없음(${UNK})`, den: r.den || `기사에 없음(${UNK})`, note: `출처: ${srcTxt(r.src)}` });
    hbars("p-trend", tr.map((r) => ({ ...r, cls: "jeju" })), { cls: "pass wide", fmt: (v) => `${f1(v)}%`, max: 100 });
    html("p-facts", PS.facts.map((x) => `<li>${esc(x.t)} <small>(${esc(PS.sources[x.src].name.split(",")[0])} ${esc(PS.sources[x.src].date)})</small></li>`).join(""));
    html("t-pass", table([{ label: "출처", get: (r) => r.name }, { label: "날짜", get: (r) => r.date }, { label: "링크", html: (r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">열기</a>` }], Object.values(PS.sources)));
  }

  // ---------- 장르 연결 ----------
  function renderLink() {
    badges("b-link", [["기간", 1, "period"], ["지역", 1, "area"], ["상설", 1, "tour"], ["요금", 1, "price"]]);
    const list = sel({ noGenre: true, noTarget: true }), sats = saturdays();
    const v20 = viewMap("20"), w20 = wantMap("20"), v30 = viewMap("30"), w30 = wantMap("30");
    const sup = (gs) => {
      const a = list.filter((x) => gs.includes(x.g));
      if (!a.length) return "선택 조건에 공연 없음";
      const short = a.filter((x) => x.rl === "1~2일").length, ch = a.filter((x) => x.ch).length;
      const gap = emptyWeekends(a.filter((x) => !x.ch), sats);
      return `${int(a.length)}편 · 1~2일 ${f1((short / a.length) * 100, 0)}% · 아동 ${f1((ch / a.length) * 100, 0)}% · 빈 주말 ${gap}번`;
    };
    const ex = list.filter((x) => x.g === "미술 전시회");
    const out = (k) => { const r = D.arts.outside.rows.find((o) => o.k === k), a = r.jeju["2025"]; return a[0] == null ? `${NA}(n=${a[1]})` : `${f1(a[0])}% (n=${a[1]})`; };
    const tk = {}; D.culture.ticket_2024.rows.forEach((r) => { tk[r.k] = r.share; });
    const pair = (a, b) => `${f1(a)} → ${f1(b)}`;
    const ev = (c, t) => `<span class="ev ${c}">${t}</span>`;
    const rows = [
      { k: "연극·뮤지컬", s: sup(["연극", "뮤지컬"]), t: f1(tk["연극"] + tk["뮤지컬"]), a: pair(v20["연극(뮤지컬 포함)"], w20["연극(뮤지컬 포함)"]), b: pair(v30["연극(뮤지컬 포함)"], w30["연극(뮤지컬 포함)"]), o: `뮤지컬 ${out("뮤지컬")}, 연극 ${out("연극")}`, r: "보고 싶다는 응답이 본 응답보다 많습니다. 성인 대상 공연이 적고 짧게 열려 놓치기 쉽고, 일부는 제주 밖에 가서 보는 것으로 추정됩니다.", e: ev("i", "해석") },
      { k: "대중공연·연예", s: sup(["대중음악/연예"]), t: f1(tk["대중음악"] + tk["서커스/마술"]), a: pair(v20["대중공연·연예"], w20["대중공연·연예"]), b: pair(v30["대중공연·연예"], w30["대중공연·연예"]), o: out("대중음악/연예"), r: `희망이 관람보다 큽니다. 아동 공연을 빼면 주말 공백이 큽니다. 2025년 제주 월별 예매 1위 ${D.boxoffice.months.length}개 중 ${int(D.boxoffice.first["대중음악/연예"])}개가 이 장르입니다(전 연령·관광객 포함).`, e: ev("a", "가정") },
      { k: "미술 전시회", s: ex.length ? `공공 전시장 3곳 ${int(ex.length)}건(제주 전체 아님)` : "선택 조건에 전시 없음", t: NA, a: pair(v20["미술 전시회"], w20["미술 전시회"]), b: pair(v30["미술 전시회"], w30["미술 전시회"]), o: out("미술전시회"), r: "인구 대비 활동은 많지만 희망은 낮습니다. 기회보다 관심·심리적 거리·정보의 문제일 수 있습니다.", e: ev("a", "가정") },
      { k: "서양음악", s: sup(["서양음악"]), t: f1(tk["서양음악"]), a: pair(v20["서양음악"], w20["서양음악"]), b: pair(v30["서양음악"], w30["서양음악"]), o: out("서양음악"), r: "공연 편수는 많지만 청년 희망은 5% 안팎입니다. 관광지 상설에 가까운 공연도 일부 섞여 있습니다.", e: ev("i", "해석") },
      { k: "영화", s: `${NA}(비교 기준선)`, t: NA, a: pair(v20["영화"], w20["영화"]), b: pair(v30["영화"], w30["영화"]), o: out("영화"), r: "20대 최근 관람 1순위 응답의 절반이 영화입니다. 가까운 곳에서 쉽게 볼 수 있어 공연·전시를 대신하는 것으로 보입니다.", e: ev("i", "해석") },
      { k: "축제 등", s: `문체부 지역축제 계획 ${int(festIn().length)}건(2025년, 문화예술 유형 아닌 축제 포함) · KOPIS 축제 표시 공연 ${int(list.filter((x) => x.fest).length)}편 · 돌문화공원 행사 ${int(D.coverage.stoneFest.length)}건`, t: NA, a: pair(sum(["관광축제", "예술축제", "전통문화체험", "무속공연", "기타"].map((k) => v20[k])), sum(["관광축제", "예술축제", "전통문화체험", "무속공연", "기타"].map((k) => w20[k]))), b: pair(sum(["관광축제", "예술축제", "전통문화체험", "무속공연", "기타"].map((k) => v30[k])), sum(["관광축제", "예술축제", "전통문화체험", "무속공연", "기타"].map((k) => w30[k]))), o: NA, r: "30대 최근 관람 응답의 22.3%가 이 범주입니다. 축제 수는 계획 건수이고 규모가 크게 달라 공연 편수와 나란히 비교하지 않습니다.", e: ev("i", "해석") },
    ];
    html("t-link", table([{ label: "장르", get: (r) => r.k }, { label: "공급(선택 조건)", get: (r) => r.s }, { label: "판매 비중 2024(%)", num: 1, get: (r) => r.t },
      { label: "20대 관람→희망(%)", num: 1, get: (r) => r.a }, { label: "30대 관람→희망(%)", num: 1, get: (r) => r.b }, { label: "제주 밖 관람 2025", get: (r) => r.o },
      { label: "읽는 법", cls: "wide", get: (r) => r.r }, { label: "근거", html: (r) => r.e }], rows));

    // 제주 예매 순위(필터와 무관한 2025년 값)
    const bo = D.boxoffice, bk = Object.keys(bo.top10).sort((p, q) => bo.top10[q] - bo.top10[p]);
    $("k-box-desc").textContent = `2025년 월별 제주 예매 1위 ${bo.months.length}개 중 ${int(bo.first["대중음악/연예"])}개가 대중음악/연예입니다. 상위 10위 ${int(bo.topN)}자리에는 서양음악이 ${int(bo.top10["서양음악"])}자리로 가장 많습니다. 달마다 순위에 오른 공연이 ${bo.minRows}~${bo.maxRows}개로 크게 달라 1위와 상위 10위를 나눠 봅니다.`;
    hbars("k-box-first", bk.filter((k) => bo.first[k]).sort((p, q) => bo.first[q] - bo.first[p]).map((k) => ({ k, v: bo.first[k] })), { cls: "narrow", fmt: (v) => `${v}개월`, max: bo.months.length });
    hbars("k-box-top", bk.map((k) => ({ k, v: bo.top10[k] })), { cls: "narrow", fmt: (v) => `${v}자리` });
    html("t-box", table([{ label: "월", get: (m) => m.ym }, { label: "1위 공연", get: (m) => m.t }, { label: "장르", get: (m) => m.g }, { label: "공연장", get: (m) => m.v }], bo.months));
  }

  // ---------- 분석 결과 ----------
  function renderSummary() {
    const list = sel(), perf = list.filter((x) => x.src === "K"), sats = saturdays();
    const short = perf.filter((x) => x.rl === "1~2일").length;
    const play = adultPlay(), gap = emptyWeekends(play, sats);
    const lv = leisureVal(S.year, "main", S.group), g = groupOf(S.group);
    const co = cohortName(), bs = T.barrier.cols.map((c, i) => [c, row("barrier")[i]]).filter((b) => b[1] != null).sort((a, b) => b[1] - a[1]);
    const li = (a) => a.map((t) => `<li>${t}</li>`).join("");
    const fact = [
      `${fValue("period")} 공연 ${int(perf.length)}편 중 ${perf.length ? f1((short / perf.length) * 100) : 0}%가 1~2일 공연입니다.`,
      `아동 공연을 뺀 연극·뮤지컬이 없던 주말이 ${sats.length}번 중 ${gap}번입니다.`,
      lv ? `${S.year}년 ${esc(g.label)}의 주말 주된 여가 중 문화예술은 ${pct(lv[1])}, 보기 ${lv.length}개 중 ${rankOf(lv, 1)}위입니다.` : `선택한 집단은 ${S.year}년 표에 없습니다.`,
      bs.length ? `${co} 도내 관람 경험은 ${pct(row("view_rate")[0])}이고, 관람을 막는 요인 1위는 '${esc(bs[0][0])}'(${pct(bs[0][1])})입니다.` : `문화지표의 19~34세 값은 ${NA}입니다. 20대 도내 관람 경험은 ${pct(row("view_rate", "20")[0])}, 30대는 ${pct(row("view_rate", "30")[0])}입니다.`,
      `제주 공연 1회당 판매는 ${f1(M("tix_per_show").vals["제주"])}장으로 전국 ${f1(M("tix_per_show").nat)}장의 ${f1(M("tix_per_show").vals["제주"] / M("tix_per_show").nat, 2)}배입니다(KOPIS 2025).`,
    ];
    const interp = [
      "연극·뮤지컬과 대중공연은 희망이 관람보다 크고 미술 전시는 반대입니다. 문화지표와 국민문화예술활동조사에서 방향이 같습니다.",
      "장벽은 관람 '도중'보다 '가기 전'에 있을 가능성이 있습니다. 관람자 만족은 60% 안팎이지만 관람자만 답한 값입니다.",
      "'관심 있는 프로그램이 없다'는 공급 부족일 수도, 있어도 나를 위한 것으로 느끼지 못하는 것일 수도 있습니다. 공표된 표만으로는 둘을 가를 수 없습니다.",
      "공연은 제주시 동지역 공공 공연장에 몰려 있고 20대 관람 장소도 같은 방향입니다. 다만 인과관계로 보지는 않습니다.",
      "제주의 비용 걸림돌은 두 조사 모두 낮습니다(문화지표 20대 4.8%, 국민조사 제주 9.9%). 전국 20대(25.7%)와 다른 점입니다.",
    ];
    html("s-fact", li(fact)); html("s-interp", li(interp));
  }

  // ---------- 데이터 기준 ----------
  const KOSIS = (t, org) => `https://kosis.kr/statHtml/statHtml.do?orgId=${org}&tblId=${t}&conn_path=I3`;
  const SOURCES = [
    ["수요", "제주 청년통계(제주특별자치도 청년사회경제실태조사)", "2019·2022·2025", "제주 19~39세. 집단 교차 없음", "연도별 보기가 달라 2019년과 직접 비교하지 않습니다. 복수응답 합계가 연도마다 다릅니다.", ""],
    ["수요", "제주 청년통계 19~34세(계산값)", "2019·2022·2025", "응답자 2022 1,138명, 2025 1,414명, 2019 알 수 없음", "원표에 없는 구간입니다. 계산식: 19~24세 값 × 비중 + 25~29세 값 × 비중 + 30~34세 값 × 비중. 비중은 세 연령의 응답자 비중(공표 비율로 거꾸로 계산)입니다.", ""],
    ["수요", "2025 제주문화지표 도민 인식조사", "2025.12", "15세 이상 2,020명(가중 후 2,000명), 20대 228·30대 263", "'최근 1년 제주도 내' 기준입니다. 관람 분야는 관람자만 답했고, 희망 분야는 누가 답했는지 나와 있지 않습니다.", ""],
    ["수요", "국민문화예술활동조사", "2023~2025", "제주 301명(전 연령), 전국 약 1만 명", "관람은 도외를 포함합니다. 제주의 연령별 값이 없어 제주 청년의 값이 아닙니다. 장르별 관람 지역 표는 표본이 매우 작습니다.", KOSIS("DT_113_STBL_1026886", 113)],
    ["수요", "국민문화예술활동조사: 문화예술행사별 관람률(복수응답)", "2025", "제주 301명", "관람 의향 표와 같은 표본이 분모입니다.", KOSIS("DT_113_STBL_1029803", 113)],
    ["수요", "국민문화예술활동조사: 직접 관람 의향(복수응답)", "2025", "제주 301명", "어디서 보고 싶은지는 묻지 않습니다.", KOSIS("DT_113_STBL_1026914", 113)],
    ["수요", "국민문화예술활동조사: 직접 관람 걸림돌", "2024~2025", "제주 301명", "제주 값은 전 연령입니다.", KOSIS("DT_113_STBL_1027038", 113)],
    ["수요", "국민문화예술활동조사: 장르별 관람 지역", "2024~2025", "장르별 관람자", "장르별 제주 관람자 표본이 4~176명으로 작습니다.", KOSIS("DT_113_STBL_1032330", 113)],
    ["수요", "국민여가활동조사", "2025", "제주 300명, 전국 10,028명", "문항이 달라 다른 조사의 관람률과 섞어 비교할 수 없습니다.", ""],
    ["수요·이용", "통계청 사회조사(지방지표)", "2025", "13세 이상 전 연령", "청년 값이 아닙니다.", ""],
    ["공급", "KOPIS 공연 목록·상세·시설", "2024.08~2025.12 공연", "제주 392편", "2026.11.07 조회. 전산으로 발권하는 공연 위주라 실제 공급보다 적게 잡힙니다. 관광 상설공연은 끝나는 날을 정하지 않았거나(오픈런) 180일을 넘는 공연으로 분류했습니다.", "https://kopis.or.kr"],
    ["공급", "KOPIS 지역별 통계", "2023.01~2026.10", "월별 지역 합계", "판매수는 취소분을 뺀 값입니다. 지역별 장르 값은 제공되지 않습니다.", "https://kopis.or.kr"],
    ["공급", "제주문예회관 일정(제주문화예술진흥원)", "2024.08~2025.12 전시", "전시 205건", "제주문예회관 전시실만의 일정입니다. 제주 전체 전시가 아닙니다. 시설점검 일정은 제외했습니다.", ""],
    ["공급", "전시정보(통합)·국립지방박물관 통합 전시 정보(문화공공데이터광장)", "2026.11.07 조회", "국립기관 전시, 제주는 국립제주박물관", "제주도립미술관 등 지자체·민간 전시는 없습니다. 박물관 특별전이라 9분야의 미술 전시회와 따로 셉니다.", "https://www.culture.go.kr/data/openapi/openapiList.do"],
    ["공급", "KOPIS 축제 목록", "2024.08~2025.12", "제주 27편", "공연 목록의 축제 표시 27편과 같습니다. 무대 공연만 있고 관광축제는 들어 있지 않습니다. 시리즈는 회차별로 따로 셉니다.", "https://kopis.or.kr"],
    ["공급", "KOPIS 공연시설 목록·시설별 통계", "2025", "등록 시설 84곳", "2025년 시설별 판매·회차를 합치면 지역 통계와 같습니다. 지역 통계의 81곳은 폐관 시설을 뺀 수로 보입니다.", "https://kopis.or.kr"],
    ["수요·이용", "KOPIS 예매상황판(제주)", "2025 월별", "순위 386행", "순위만 있고 판매수가 없습니다. 전 연령이고 도민과 관광객을 나누지 않습니다.", "https://kopis.or.kr"],
    ["공급", "서귀포시 문화예술포털 달력", "2024.08~2025.12", "서귀포예술의전당 일정 669건", "제목을 보고 공연인지 가렸고, 무대 설치·철수·점검 일정은 뺐습니다.", "http://culture.seogwipo.go.kr"],
    ["공급", "제주돌문화공원 전시·행사(제주특별자치도)", "2024.08~2025.12", "전시·행사 165건 중 기간 내 일부", "요금이 비어 있는 행이 많습니다.", ""],
    ["공급", "문체부 지역축제 개최계획", "2019~2025", "2025년 제주 57건, 전국 1,214건", "계획 자료라 실제 개최와 다를 수 있습니다. 날짜까지 있는 계획은 10건입니다.", ""],
    ["공급", "문체부 2024~2025 문화관광축제 현황", "2024~2025", "전국 65개", "제주는 문화관광축제와 명예 문화관광축제가 없고 탐라문화제가 예비축제입니다.", ""],
    ["정책", "청년문화예술패스 발급률·집행률(언론·의원실·정책 브리프 인용)", "2024~2026", "제주와 일부 시도", "문체부·예술위가 시도별 원표를 공개하지 않아 보도된 값만 모았습니다. 시도마다 공개된 시점이 달라 같은 묶음 안에서만 비교합니다.", ""],
    ["공급", "제주특별자치도 전시관현황", "2026.03.31", "전시관 21곳", "기준일이 2026년입니다. 시설 목록이라 어떤 전시가 열렸는지는 알 수 없습니다.", ""],
    ["공급", "제주문예회관 자체공연전시현황", "2023.02~10", "자체 공연·전시 36행", "대시보드 기간 밖이라 목록에 넣지 않고, 자체 기획전 운영 기간의 참고값으로만 씁니다.", ""],
    ["공급", "문화예술활동현황조사(문예연감)", "2024", "시도별 활동 건수", "유·무료를 가리지 않고 셉니다. 공연 횟수는 관광 상설공연이 크게 반영됩니다.", KOSIS("DT_433001N_1017", 433)],
    ["공급", "문화기반시설·지자체 문화예산", "2024", "시도별", "문화기반시설은 광주·전남이 하나로 묶여 값이 비어 있어 15개 시도만 비교합니다.", ""],
    ["공급", "『2025년 제주문화지표 조사연구 보고서』 표 2-67", "2024", "장르별 티켓 판매", "장르별 판매 비중만 씁니다. 관광객 구매와 상설공연이 포함된 값입니다.", ""],
    ["참고", "제주in놀다 행사 정보", "2026.11.07 조회", "현재·예정 행사 123건", "지난 행사를 주지 않아 2025년 공급으로 쓰지 않습니다.", ""],
    ["참고", "주민등록인구(행정구역별 성별 인구수)", "2025.12", "시도별", "1인당 지표의 분모입니다. KOPIS 판매 ÷ 주민등록인구는 서로 다른 자료를 나눈 계산값입니다.", KOSIS("DT_1B040A3", 101)],
  ];
  const DONT = [
    ["제주 청년의 문화예술 관람 불만족은 23.3%다", "문화·여가생활 전반의 불만족입니다."],
    ["제주 청년 관람률은 54.5%다", "사회조사 13세 이상 전 연령 수치입니다."],
    ["주말 문화예술 활동이 2019년 14.4%에서 7.5%로 반토막 났다", "그사이 보기 구성이 바뀌었습니다."],
    ["2022년에서 2025년 사이 문화예술 여가가 늘었다(6.6→7.5%)", "복수응답 합계가 달라 응답 중 비중은 거의 같습니다."],
    ["청년은 비용 때문에 관람을 못 한다", "20대가 도내 관람을 막는 요인으로 비용을 고른 비율은 4.8%입니다."],
    ["청년은 함께 갈 사람이 없어서 못 간다", "20대는 3.1%입니다."],
    ["시설이 많으니 공급은 충분하다", "시설 수와 이용은 다릅니다."],
    ["제주 공연 횟수는 전국 1위다", "관광 상설공연이 크게 반영된 값입니다."],
    ["제주 도민의 절반이 뮤지컬을 제주 밖에서 본다", "2025년 뮤지컬 관람자 16명 중 비율이고 2024년은 17.0%였습니다."],
    ["희망에서 관람을 뺀 값이 채워지지 않은 수요다", "문화지표의 두 문항은 응답 대상이 달라 차이를 계산하지 않습니다."],
    ["KOPIS 편수가 제주의 공연 공급량이다", "대관·무료 공연이 많이 빠져 있습니다."],
    ["제주 도민은 연극·뮤지컬을 전국보다 많이 본다", "사회조사에서는 3위지만 국민문화예술활동조사 2025에서는 연극·뮤지컬 모두 전국보다 낮습니다."],
    ["제주는 콘서트 관람이 적다", "사회조사 음악·콘서트는 15위지만 국민문화예술활동조사 대중음악/연예는 전국보다 높습니다."],
    ["제주 전시는 오래 열려서 놓칠 일이 없다", "평균 58.5일은 전체 평균이고, 공공 전시실 전시의 중앙값은 제주문예회관과 서귀포예술의전당 모두 6일입니다."],
    ["제주는 좌석이 많아 공연 공급이 충분하다", "등록 좌석의 대부분은 경기장·체육관·컨벤션입니다."],
    ["제주 축제 공급은 27편이다", "KOPIS 축제 표시 공연만 센 값입니다. 문체부 2025년 계획에는 57건이 있습니다."],
    ["2025년 제주에서 축제가 57건 열렸다", "개최 계획 건수입니다. 날짜까지 정해진 계획은 10건뿐입니다."],
    ["제주 축제가 많으니 문화예술 향유 기회가 많다", "57건 중 문화예술 유형은 15건이고 전통역사·자연생태·특산물 축제도 많습니다."],
    ["19~34세 값은 조사가 공표한 수치다", "연령별 값을 가중 평균한 계산값입니다."],
    ["제주 청년의 16%(또는 30%)만 패스로 공연을 봤다", "집행률은 배정 예산 중 쓴 금액의 비율이지 관람한 사람의 비율이 아닙니다."],
    ["2026년 제주 패스 집행률이 2025년보다 떨어졌다(30.1%→23%)", "2026년 값은 6월 말 중간값이고 영화·도서가 사용처에 추가됐습니다."],
    ["예매 순위는 제주 청년의 선호를 보여 준다", "전 연령 순위이고 관광객을 나누지 않으며 판매수도 없습니다."],
  ];
  function renderSources() {
    html("t-sources", table([{ label: "구분", get: (r) => r[0] }, { label: "자료", html: (r) => (r[5] ? `<a href="${esc(r[5])}" target="_blank" rel="noopener">${esc(r[1])}</a>` : esc(r[1])) }, { label: "기간", get: (r) => r[2] }, { label: "대상·규모", get: (r) => r[3] }, { label: "주의", get: (r) => r[4] }], SOURCES));
    html("t-age", table([{ label: "항목", get: (r) => r.k }, { label: "표의 연령", get: (r) => r.base }, { label: "연령 필터", get: (r) => r.f }, { label: "19~34세 값", get: (r) => r.v }],
      AGE_MAP.map(([id, kind, sl]) => { const c = ageHead(id, sl).cloneNode(true); c.querySelectorAll(".age-chip, .tagy, small, .badges").forEach((x) => x.remove()); return { k: c.textContent.trim(), ...AGEK[kind] }; })));
    html("s-dont", DONT.map(([a, b]) => `<li>"${esc(a)}" <small>— ${esc(b)}</small></li>`).join(""));
    $("gen-time").textContent = `자료 생성 ${D.generated}. KOSIS 값은 내려받기 파일과 KOSIS 시범서비스 조회를 함께 사용했습니다. 분석·해석은 국가데이터처의 공식 입장이 아닌 참고용입니다. 인구 출처: 국가통계포털(KOSIS), 「주민등록인구현황」, 「행정구역(시군구)별, 성별 인구수」.`;
  }

  // ---------- 필터 UI ----------
  const opt = (v, t, dis) => `<option value="${esc(v)}"${dis ? " disabled" : ""}>${esc(t)}</option>`;
  function fillGroups() {
    const cats = [...new Set(D.groups.map((g) => g.cat))];
    html("f-group", cats.map((c) => {
      const items = D.groups.filter((g) => g.cat === c);
      const body = items.map((g) => opt(g.id, g.label, !g.years.includes(S.year))).join("");
      return c === "전체" ? body : `<optgroup label="${esc(c)}">${body}</optgroup>`;
    }).join(""));
  }
  function syncControls() {
    fillGroups();
    if (!groupOf(S.group).years.includes(S.year)) S.group = GALL;
    $("f-genre").value = S.genre; $("f-area").value = S.area; $("f-target").value = S.target; $("f-price").value = S.price;
    $("f-tour").checked = S.tour; $("f-year").value = S.year; $("f-group").value = S.group; $("f-cohort").value = S.cohort;
    $("f-metric").value = S.metric; $("f-kmetric").value = S.kmetric; $("f-apop").value = S.apop;
    const ia = MONTHS.indexOf(S.start), ib = MONTHS.indexOf(S.end), n = MONTHS.length - 1;
    $("f-range-a").value = ia; $("f-range-b").value = ib;
    $("range-fill").style.left = `${(ia / n) * 100}%`; $("range-fill").style.right = `${100 - (ib / n) * 100}%`;
    $("f-start-l").textContent = ymText(S.start); $("f-end-l").textContent = ymText(S.end);
    $("f-1934").classList.toggle("on", S.group === G1934 && S.cohort === "1934");
    ["period", "genre", "area", "target", "price", "group"].forEach((k) => {
      const box = $(`box-${k}`);
      box.classList.toggle("narrow", k === "period" ? narrowing(k) : narrowing(k));
    });
    [...$("tb-presets").children].forEach((b) => b.classList.toggle("on", +b.dataset.s === S.start && +b.dataset.e === S.end));
  }
  const CLEAR = { period: () => { S.start = MONTHS[0]; S.end = MONTHS[MONTHS.length - 1]; }, genre: () => { S.genre = "all"; }, area: () => { S.area = "all"; }, target: () => { S.target = "all"; }, price: () => { S.price = "all"; }, group: () => { S.group = GALL; if (S.cohort === "1934") S.cohort = "20"; }, cohort: () => { S.cohort = "all"; } };
  function renderChips() {
    const keys = ["period", "genre", "area", "target", "price", "tour", "year", "group", "cohort"];
    html("fchips", '<span class="ttl">적용 중인 필터</span>' + keys.map((k) => {
      const f = FKEY[k], on = narrowing(k);
      const x = on && CLEAR[k] ? `<button type="button" class="x" data-clear="${k}" aria-label="${f.label} 필터 해제">×</button>` : "";
      return `<span class="fchip ${on ? "on" : "idle"}" style="--fc:${f.color}"><span class="dot"></span><span class="k">${f.label}</span> ${esc(fValue(k))}${x}</span>`;
    }).join(""));
  }
  function render() {
    syncControls();
    $("hdr-period").textContent = `공급 ${ymText(S.start)} ~ ${ymText(S.end)} · 수요 청년통계 ${S.year}년, 문화지표 2025.12 (자료마다 기준이 달라 하단 '데이터 기준' 참고)`;
    renderChips(); renderConclusion(); renderOverview(); renderLeisure(); renderDemand(); renderBase(); renderSupply(); renderWeekend(); renderPass(); renderLink(); renderSummary(); renderAge();
  }

  function init() {
    html("f-genre", GENRES.map(([v, t]) => opt(v, t)).join(""));
    html("f-area", AREAS.map(([v, t]) => opt(v, t)).join(""));
    html("f-year", [2025, 2022, 2019].map((y) => opt(y, `${y}년`)).join(""));
    html("f-apop", D.arts.pops.map((p) => opt(p, p)).join(""));
    const groups = [...new Set(D.regions.metrics.map((m) => m.group))];
    html("f-metric", groups.map((g) => `<optgroup label="${g}">${D.regions.metrics.filter((m) => m.group === g).map((m) => opt(m.id, m.label)).join("")}</optgroup>`).join(""));
    const n = MONTHS.length - 1;
    ["f-range-a", "f-range-b"].forEach((id) => { $(id).max = n; });
    $("range-min").textContent = ymShort(MONTHS[0]); $("range-max").textContent = ymShort(MONTHS[n]);
    html("tb-presets", [["2025년", 202501, 202512], ["도민조사 기간", 202412, 202511], ["국민조사 기간", 202408, 202507], ["전체", 202408, 202512]]
      .map(([t, s, e]) => `<button type="button" data-s="${s}" data-e="${e}" title="${ymText(s)} ~ ${ymText(e)}">${t}</button>`).join(""));

    const bind = (id, key, conv) => $(id).addEventListener("change", (e) => { S[key] = conv ? conv(e.target.value) : e.target.value; render(); });
    bind("f-genre", "genre"); bind("f-area", "area"); bind("f-target", "target"); bind("f-price", "price");
    bind("f-year", "year", Number);
    $("f-group").addEventListener("change", (e) => {
      const was = S.group === G1934;
      S.group = e.target.value;
      if (S.group === G1934) S.cohort = "1934"; else if (was && S.cohort === "1934") S.cohort = "20";
      render();
    });
    $("f-cohort").addEventListener("change", (e) => { S.cohort = e.target.value; if (S.cohort === "1934") S.group = G1934; render(); });
    $("f-1934").addEventListener("click", () => {
      const on = S.group === G1934 && S.cohort === "1934";
      S.group = on ? GALL : G1934; S.cohort = on ? "20" : "1934";
      render();
    });
    bind("f-metric", "metric"); bind("f-kmetric", "kmetric"); bind("f-apop", "apop");
    $("f-tour").addEventListener("change", (e) => { S.tour = e.target.checked; render(); });
    const slide = () => {
      let a = +$("f-range-a").value, b = +$("f-range-b").value;
      if (a > b) [a, b] = [b, a];
      S.start = MONTHS[a]; S.end = MONTHS[b]; render();
    };
    $("f-range-a").addEventListener("input", slide); $("f-range-b").addEventListener("input", slide);
    $("tb-presets").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.start = +b.dataset.s; S.end = +b.dataset.e; render(); } });
    $("f-reset").addEventListener("click", () => { Object.assign(S, DEFAULT, { wsel: null, detail: null }); render(); });
    $("fchips").addEventListener("click", (e) => { const b = e.target.closest("[data-clear]"); if (b) { CLEAR[b.dataset.clear](); render(); } });
    $("l-mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lmode = b.dataset.v; renderLeisure(); } });
    $("d-mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.dmode = b.dataset.v; renderDemand(); } });
    $("w-cal").addEventListener("click", (e) => { const b = e.target.closest("[data-sat]"); if (b) { S.wsel = S.wsel === b.dataset.sat ? null : b.dataset.sat; renderWeekend(); } });
    $("w-quick").addEventListener("click", () => {
      const on = quickOn();
      S.genre = on ? "all" : "연극·뮤지컬"; S.target = on ? "all" : "noChild"; S.wsel = null;
      render();
    });
    $("t-list").addEventListener("click", (e) => { const r = e.target.closest("tr[data-id]"); if (r) openShow(r.dataset.id); });
    $("btn-print").addEventListener("click", () => window.print());
    $("btn-csv").addEventListener("click", downloadCsv);

    // 검색
    const q = $("q-search"), res = $("q-results");
    const runSearch = () => {
      const t = q.value.trim().toLowerCase();
      if (!t) { res.hidden = true; return; }
      const hit = ALL.filter((x) => x.t.toLowerCase().includes(t) || x.v.toLowerCase().includes(t)).sort((a, b) => (a.st < b.st ? 1 : -1)).slice(0, 12);
      res.hidden = false;
      res.innerHTML = hit.length ? hit.map((x) => `<button type="button" data-id="${esc(x.id)}"><span>${esc(x.t.slice(0, 30))}</span><span class="v">${esc(x.st.slice(0, 7))} · ${esc(x.g)}</span></button>`).join("") : '<p class="empty">찾는 공연·전시가 없습니다.</p>';
    };
    q.addEventListener("input", runSearch);
    q.addEventListener("focus", runSearch);
    res.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) { res.hidden = true; openShow(b.dataset.id); } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) res.hidden = true; });

    // 사이드바·메뉴
    const sb = $("sidebar"), bd = $("sb-backdrop");
    const setSb = (o) => { sb.classList.toggle("open", o); bd.hidden = !o; $("sb-toggle").setAttribute("aria-expanded", o); };
    $("sb-toggle").addEventListener("click", () => setSb(!sb.classList.contains("open")));
    bd.addEventListener("click", () => setSb(false));
    const links = [...document.querySelectorAll("#nav a")];
    const TABS = links.map((a) => a.getAttribute("href").slice(1));
    // 탭 아래에 이전·다음 이동 버튼
    TABS.forEach((t, i) => {
      const nav2 = document.createElement("nav");
      nav2.className = "tab-pager";
      nav2.innerHTML = (i > 0 ? `<a href="#${TABS[i - 1]}">← ${esc(links[i - 1].textContent.trim())}</a>` : "<span></span>") + (i < TABS.length - 1 ? `<a href="#${TABS[i + 1]}">${esc(links[i + 1].textContent.trim())} →</a>` : "<span></span>");
      document.getElementById(t).appendChild(nav2);
    });
    const showTab = (id, push) => {
      if (!TABS.includes(id)) { const el = document.getElementById(id); const sec = el && el.closest(TABS.map((t) => "#" + t).join(",")); id = sec ? sec.id : TABS[0]; }
      TABS.forEach((t) => document.getElementById(t).classList.toggle("tab-off", t !== id));
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
      if (push) history.pushState(null, "", "#" + id);
      window.scrollTo(0, 0);
      if (id === "sec-supply" && map) setTimeout(() => map.invalidateSize(), 0);
      Object.values(charts).forEach((c) => c.resize());
      setSb(false);
    };
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      if (!id || !(TABS.includes(id) || document.getElementById(id))) return;
      e.preventDefault();
      showTab(id, true);
    });
    window.addEventListener("popstate", () => showTab(location.hash.slice(1) || TABS[0], false));
    window.addEventListener("beforeprint", () => document.querySelectorAll(".tab-off").forEach((x) => x.classList.add("tab-print")));
    window.addEventListener("afterprint", () => document.querySelectorAll(".tab-print").forEach((x) => x.classList.remove("tab-print")));
    window.__showAllTabs = () => { document.querySelectorAll(".tab-off").forEach((x) => x.classList.remove("tab-off")); Object.values(charts).forEach((c) => c.resize()); if (map) map.invalidateSize(); };
    showTab(location.hash.slice(1) || TABS[0], false);

    // 툴팁
    const tip = document.createElement("div");
    tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
    const place = (e) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, e.clientX + 12))}px`;
      tip.style.top = `${e.clientY + h + 24 > innerHeight ? e.clientY - h - 10 : e.clientY + 14}px`;
    };
    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-tip]");
      if (!el) { tip.hidden = true; return; }
      tip.innerHTML = el.getAttribute("data-tip"); tip.hidden = false; place(e);
    });
    document.addEventListener("mousemove", (e) => { if (!tip.hidden) place(e); });

    const miss = [!HAS_CHART && "차트", !HAS_L && "지도"].filter(Boolean);
    show("lib-warn", miss.length ? `${miss.join("·")} 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요. 표와 막대는 그대로 볼 수 있습니다.` : "");
    initMap();
    render();
  }
  function openShow(id) {
    S.detail = id; renderDetail();
    $("show-detail").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function downloadCsv() {
    const cols = [["시작일", "st"], ["종료일", "en"], ["제목", "t"], ["장르", "g"], ["운영기간", "rl"], ["장소", "v"], ["행정시", "city"], ["동읍면", "loc"], ["요금", "pr"], ["관람연령", "age"], ["아동공연", "ch"], ["주체", "prov"], ["출처", "src"]];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => q(c[0])).join(",")].concat(sel().map((x) => cols.map((c) => q(c[1] === "src" ? ({ K: "KOPIS", A: "제주문예회관", G: "서귀포예술의전당", S: "제주돌문화공원", M: "국립제주박물관" })[x.src] : (x[c[1]] === "" || x[c[1]] == null ? UNK : x[c[1]]))).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `제주_공연전시목록_${S.start}_${S.end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  init();
  renderSources();
})();
