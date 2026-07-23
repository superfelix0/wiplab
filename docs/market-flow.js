(() => {
  const root = document.querySelector("[data-market-flow]");
  if (!root) return;

  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => (en ? english : ko);
  const labels = {
    foreignSpot: t("외국인", "Foreign"),
    individualSpot: t("개인", "Individuals"),
    institutionSpot: t("기관", "Institutions"),
  };
  const money = (value) => `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}${t("조원", "T KRW")}`;
  const contracts = (value) => `${value >= 0 ? "+" : ""}${Math.round(Number(value || 0)).toLocaleString()}${t("계약", " contracts")}`;
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

  function render(rows, regime) {
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1);
    const previous = sorted.at(-2);
    const fiveDays = sorted.slice(-5);
    const priorFiveDays = sorted.slice(-10, -5);
    const cards = Object.keys(labels).map((key) => {
      const daily = Number(latest?.[key] || 0);
      const dailyChange = daily - Number(previous?.[key] || 0);
      const weekly = sum(fiveDays, key);
      const weeklyChange = weekly - sum(priorFiveDays, key);
      return `<article class="flow-card"><span>${labels[key]}</span><strong>${money(daily)}</strong><small>${t("전일 순매수", "Net flow")} · ${t("전일 대비", "vs prior")} ${money(dailyChange)}</small><small>${t("최근 5거래일", "Last 5 sessions")} ${money(weekly)} · ${t("직전 5일 대비", "vs prior 5")} ${money(weeklyChange)}</small></article>`;
    }).join("");
    root.querySelector("[data-flow-cards]").innerHTML = cards;
    root.querySelector("[data-flow-date]").textContent = latest?.date || "--";

    const flow = regime?.inputs?.flow;
    const overview = root.querySelector(".wl-flow-overview") || document.createElement("section");
    overview.className = "wl-flow-overview";
    overview.id = "flow-5d";
    const flowLabel = flow?.leaderConfidence === "confirmed"
      ? t(`${labels[flow.leaderId]} 동행`, `${labels[flow.leaderId]} aligned`)
      : t("방향 주도 불명", "Direction leader unclear");
    const divergence = (flow?.subjects || []).map((subject) => `<article><span>${labels[subject.id] || subject.name}</span><strong>${subject.matchRate}%</strong><small>${subject.state === "aligned" ? t("지수와 동행", "Aligned with index") : subject.state === "contrarian" ? t("지수와 역행", "Contrarian to index") : t("일관성 낮음", "No stable relation")}</small></article>`).join("");
    overview.innerHTML = `<div class="wl-flow-overview-head"><div><span>${t("L1 · 수급 구조", "L1 · Flow structure")}</span><h2>${flowLabel}</h2><p>${t("당일 순매수 규모와 별개로, 60거래일 동안 지수 방향과 얼마나 일관되게 움직였는지를 봅니다.", "Separate daily flow size from the 60-session consistency of each participant with the index direction.")}</p></div><b>${flow?.count || 0}${t(" 거래일", " sessions")}</b></div><div class="wl-flow-divergence">${divergence || `<p>${t("수급 이력을 확인 중입니다.", "Checking flow history.")}</p>`}</div>`;
    if (!overview.isConnected) root.querySelector(".flow-data-line")?.after(overview);
    const subjects = (flow?.subjects || []).map((subject) => `<li><b>${labels[subject.id] || subject.name}</b><span>${subject.matchRate}% ${t("일치", "match")}</span><small>${subject.state === "aligned" ? t("동행", "Aligned") : subject.state === "contrarian" ? t("역행", "Contrarian") : t("무관", "Unrelated")}</small></li>`).join("");
    const summary = flow?.leaderConfidence === "confirmed"
      ? t(`${labels[flow.leaderId]}의 동행 신호가 규모 조건까지 충족했습니다.`, `${labels[flow.leaderId]} meets both alignment and size conditions.`)
      : t("한 주체의 동행만으로 방향을 단정할 수 없습니다. 60거래일 기준과 규모 조건을 함께 확인합니다.", "No single participant meets both the alignment and size conditions over the 60-session window.");
    const methodology = `<section class="flow-regime" id="flow-5d"><div><span>${t("60거래일 수급 구조", "60-session flow structure")}</span><strong>${flow?.label || t("산출 대기", "Pending")}</strong><p>${summary}</p></div><ul>${subjects || `<li>${t("수급 이력을 불러오지 못했습니다.", "Flow history is unavailable.")}</li>`}</ul><small>${t("일별 KOSPI 변동률 절대값이 0.05% 미만인 날은 제외합니다. 동행 63% 이상, 역행 37% 이하이며 기존 상태는 57%/43%를 벗어날 때 전환합니다.", "Sessions with an absolute KOSPI move below 0.05% are excluded. Entry thresholds are 63% aligned and 37% contrarian; existing states change only beyond 57%/43%.")}</small></section>`;
    const placeholder = root.querySelector("[data-flow-note]");
    const panel = document.createElement("div");
    panel.innerHTML = methodology;
    placeholder.replaceWith(panel.firstElementChild);

    const table = root.querySelector("[data-flow-table]");
    table.parentElement.id = "flow-daily";
    table.innerHTML = `<thead><tr><th>${t("날짜", "Date")}</th><th>${labels.foreignSpot}</th><th>${labels.individualSpot}</th><th>${labels.institutionSpot}</th><th>${t("외국인 선물", "Foreign futures")}</th></tr></thead><tbody>${sorted.slice(-10).reverse().map((row) => `<tr><td>${row.date}</td><td>${money(row.foreignSpot)}</td><td>${money(row.individualSpot)}</td><td>${money(row.institutionSpot)}</td><td>${contracts(row.foreignFuturesContracts)}</td></tr>`).join("")}</tbody>`;
    const futures = document.createElement("p");
    futures.id = "flow-futures";
    futures.className = "flow-futures-note";
    futures.textContent = t("외국인 선물은 계약 수로 표시하며, 현물 순매수 금액과 합산하지 않습니다.", "Foreign futures are shown in contracts and are not added to cash-equity flow.");
    table.parentElement.after(futures);
  }

  Promise.all([
    fetch(`/data/foreign-flow-pulse.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()),
    fetch(`/data/daily-state.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()),
  ]).then(([flowData, regime]) => {
    if (!flowData?.ok || !Array.isArray(flowData.rows)) throw new Error("unavailable");
    root.querySelector("[data-flow-status]").textContent = t("KRX 수급 데이터", "KRX flow data");
    render(flowData.rows, regime);
  }).catch(() => {
    root.querySelector("[data-flow-status]").textContent = t("수급 데이터를 불러오지 못했습니다.", "Could not load flow data.");
    const placeholder = root.querySelector("[data-flow-note]");
    if (placeholder) placeholder.textContent = t("데이터가 갱신되면 다시 표시됩니다.", "This section will return after the next successful update.");
  });
})();
