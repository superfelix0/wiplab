(() => {
  const mount = document.querySelector("[data-market-flow]");
  if (!mount) return;

  const page = mount.closest("main");
  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  const labels = {
    foreignSpot: t("외국인", "Foreign"),
    individualSpot: t("개인", "Individuals"),
    institutionSpot: t("기관", "Institutions"),
  };
  const money = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}${t("조원", "T KRW")}`;
  const contracts = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Math.round(Number(value || 0)).toLocaleString()}${t("계약", " contracts")}`;
  const stateLabel = (state) => ({ aligned: t("동행", "Aligned"), contrarian: t("역행", "Contrarian"), unrelated: t("혼재", "Mixed"), insufficient: t("자료 부족", "Insufficient history") })[state] || "--";
  const trendLabel = (state) => ({ continuing: t("5일도 같은 추세", "5-day trend continues"), turning: t("최근 5일 변화", "5-day change"), flat: t("최근 5일 보합", "5-day flat") })[state] || "--";

  function render(flow, rows) {
    page?.classList.add("wl");
    page?.querySelector(".service-hero")?.remove();
    mount.className = "wl-page wl-flow-page";
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const subjects = flow.subjects || [];
    const leader = subjects.find((subject) => subject.id === flow.leaderId);
    const largestSeller = subjects.find((subject) => subject.id === flow.largestSellerId);
    const threshold = flow.thresholds?.enter;
    const headline = leader
      ? t(`${labels[leader.id] || leader.name} 수급이 KOSPI 방향과 동행`, `${labels[leader.id] || leader.name} flow aligns with the KOSPI direction`)
      : t("방향을 단정할 수 없는 수급 혼재", "Flow direction remains mixed");
    const comparison = subjects.map((subject) => {
      const width = Math.min(100, Math.abs(Number(subject.cumulative)) / Math.max(...subjects.map((item) => Math.abs(Number(item.cumulative))), 1) * 100);
      const tone = subject.state === "aligned" ? "is-good" : subject.state === "contrarian" ? "is-bad" : "";
      const fill = Number(subject.cumulative) >= 0 ? "var(--wl-good-ink)" : "var(--wl-bad-ink)";
      const rate = Number.isFinite(subject.matchRate) ? `${subject.matchRate.toFixed(1)}%` : "--";
      return `<li class="wl-row ${tone}"><span class="wl-row-name">${labels[subject.id] || subject.name}</span><span class="wl-row-val">${money(subject.cumulative)} · ${t("일별 일치", "Daily match")} ${rate}</span><span class="wl-row-bar"><span class="wl-row-fill" style="display:block;width:${width}%;background:${fill}"></span></span><small>${t(`30일 누적 ${money(subject.cumulative)} · 5일 ${money(subject.shortCumulative)} · ${trendLabel(subject.shortTrend)}`, `30-session ${money(subject.cumulative)} · 5-session ${money(subject.shortCumulative)} · ${trendLabel(subject.shortTrend)}`)}</small></li>`;
    }).join("");
    const dailyRows = sorted.slice(-5).reverse().map((row) => `<tr><td>${row.date}</td><td>${money(row.foreignSpot)}</td><td>${money(row.individualSpot)}</td><td>${money(row.institutionSpot)}</td><td>${contracts(row.foreignFuturesContracts)}</td></tr>`).join("");

    mount.innerHTML = `
      <header class="wl-head">
        <p class="wl-eyebrow">KOREA MARKET · FLOW</p>
        <h1 class="wl-title">${t("매매주체별 동향", "Market Flow")}</h1>
        <p class="wl-lede">${t("외국인·개인·기관의 현물 수급과 외국인 선물 흐름을 30영업일 방향, 최근 5영업일 변화로 나누어 읽습니다.", "Read foreign, individual and institutional spot flow with foreign futures through a 30-session direction and the latest 5-session change.")}</p>
        <p class="wl-basis">${t("최근 거래일", "Latest trading day")} ${sorted.at(-1)?.date || "--"} · ${t("KRX Data Marketplace", "KRX Data Marketplace")}</p>
      </header>
      <section id="flow-5d" class="wl-section" tabindex="-1">
        <p class="wl-kicker">L1 · ${t("현재 수급 상태", "CURRENT FLOW STATE")}</p>
        <div class="wl-verdict">
          <article class="wl-panel ${leader ? "is-good" : "is-warn"}"><span class="wl-panel-label">${t("30일 방향 판정", "30-SESSION DIRECTION")}</span><strong class="wl-panel-state">${headline}</strong><span class="wl-panel-basis">${t(`KOSPI ${flow.indexReturn >= 0 ? "+" : ""}${(Number(flow.indexReturn || 0) * 100).toFixed(1)}% · ${flow.count || 0}영업일`, `KOSPI ${flow.indexReturn >= 0 ? "+" : ""}${(Number(flow.indexReturn || 0) * 100).toFixed(1)}% · ${flow.count || 0} sessions`)}</span></article>
          <article class="wl-panel"><span class="wl-panel-label">${t("최대 순매도", "LARGEST NET SELLER")}</span><strong class="wl-panel-state">${largestSeller ? labels[largestSeller.id] || largestSeller.name : "--"}</strong><span class="wl-panel-basis">${largestSeller ? money(largestSeller.cumulative) : "--"}</span></article>
        </div>
        <p class="wl-note">${t("방향 주도와 최대 순매도는 서로 다른 정보입니다. 한 주체의 매매가 시장 방향의 원인이라는 뜻은 아닙니다.", "Direction leadership and the largest seller are different observations. Neither implies that a participant caused the market move.")}</p>
      </section>
      <section id="flow-behavior" class="wl-section" tabindex="-1">
        <div class="wl-section-head"><div><p class="wl-kicker">L2 · ${t("주체별 수급 분해", "PARTICIPANT DECOMPOSITION")}</p><h2 class="wl-h2">${t("30일 누적과 일별 방향 일치", "30-session cumulative flow and daily directional match")}</h2></div><span class="wl-basis">${threshold ? `${t("진입", "Entry")} ${threshold.aligned}% / ${threshold.contrarian}%` : "--"}</span></div>
        <ul class="wl-rows">${comparison}</ul>
        <p class="wl-source">${t("일별 KOSPI 방향과 현물 순매수·순매도 방향이 일치한 비율입니다. KOSPI 일간 변동폭이 0.3% 미만인 날은 제외합니다.", "This is the share of days when KOSPI and spot net flow moved in the same direction. Days with a KOSPI move below 0.3% are excluded.")}</p>
      </section>
      <section id="flow-daily" class="wl-section" tabindex="-1">
        <div class="wl-section-head"><div><p class="wl-kicker">L3 · ${t("최근 일별 데이터", "RECENT DAILY DATA")}</p><h2 class="wl-h2">${t("최근 5영업일", "Latest 5 trading sessions")}</h2></div></div>
        <div class="earnings-table-wrap"><table class="earnings-table"><thead><tr><th>${t("날짜", "Date")}</th><th>${labels.foreignSpot}</th><th>${labels.individualSpot}</th><th>${labels.institutionSpot}</th><th>${t("외국인 선물", "Foreign futures")}</th></tr></thead><tbody>${dailyRows}</tbody></table></div>
        <p id="flow-futures" class="wl-source">${t("외국인 선물은 계약 수량이며 현물 순매수 금액과 합산하지 않습니다. 출처: KRX Data Marketplace의 KOSPI 투자자별 거래실적 및 KOSPI200 선물 투자자별 거래실적.", "Foreign futures are contracts and are not added to cash-equity flow. Source: KRX Data Marketplace investor trading records for KOSPI spot and KOSPI 200 futures.")}</p>
      </section>`;
  }

  Promise.all([
    fetch(`/data/foreign-flow-pulse.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()),
    fetch(`/data/daily-state.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()),
  ]).then(([flowData, state]) => {
    if (!flowData?.ok || !Array.isArray(flowData.rows)) throw new Error("unavailable");
    const flow = state?.inputs?.flow;
    if (!flow || flow.count < flow.window) throw new Error("insufficient");
    render(flow, flowData.rows);
  }).catch(() => {
    page?.classList.add("wl");
    page?.querySelector(".service-hero")?.remove();
    mount.className = "wl-page";
    mount.innerHTML = `<section class="wl-section"><h1 class="wl-title">${t("매매주체별 동향", "Market Flow")}</h1><p class="wl-lede">${t("수급 데이터를 불러오지 못했습니다. 다음 정상 수집 후 다시 표시됩니다.", "Flow data could not be loaded. This page will return after the next successful collection.")}</p></section>`;
  });
})();
