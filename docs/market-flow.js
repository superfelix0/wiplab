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
    root.querySelector("[data-flow-cards]")?.remove();
    root.querySelector("[data-flow-date]").textContent = latest?.date || "--";

    const flow = regime?.inputs?.flow;
    const overview = root.querySelector(".wl-flow-overview") || document.createElement("section");
    overview.className = "wl-flow-overview";
    overview.id = "flow-5d";
    const flowLabel = flow?.leaderConfidence === "confirmed"
      ? flow.label
      : t("수급과 지수 방향 혼재", "Flow and index direction mixed");
    const divergence = (flow?.subjects || []).map((subject) => `<article><span>${labels[subject.id] || subject.name}</span><strong>${money(subject.cumulative)}</strong><small>${subject.state === "aligned" ? t("2주 지수 방향과 같은 순매수·순매도", "Same direction as the 2-week index move") : subject.state === "contrarian" ? t("2주 지수 방향과 반대", "Opposite to the 2-week index move") : t("지수 변화가 작아 판정 보류", "Index move too small to classify")}</small></article>`).join("");
    const indexMove = Number.isFinite(flow?.indexReturn) ? `${flow.indexReturn >= 0 ? "+" : ""}${(flow.indexReturn * 100).toFixed(1)}%` : "--";
    overview.innerHTML = `<div class="wl-flow-overview-head"><div><span>${t("L1 · 2주 누적 수급", "L1 · Two-week cumulative flow")}</span><h2>${flowLabel}</h2><p>${t("최근 10거래일 누적 순매수·순매도와 같은 기간 KOSPI 변화를 함께 봅니다. 일별 변동의 잡음보다 최근 수급 방향을 읽기 위한 기준입니다.", "Reads 10-session cumulative net flows alongside the KOSPI move over the same period, prioritizing the recent direction over daily noise.")}</p></div><b>KOSPI ${indexMove}</b></div><div class="wl-flow-divergence">${divergence || `<p>${t("수급 이력을 확인 중입니다.", "Checking flow history.")}</p>`}</div>`;
    if (!overview.isConnected) root.querySelector(".flow-data-line")?.after(overview);
    const subjects = (flow?.subjects || []).map((subject) => `<li><b>${labels[subject.id] || subject.name}</b><span>${subject.matchRate}% ${t("일치", "match")}</span><small>${subject.state === "aligned" ? t("동행", "Aligned") : subject.state === "contrarian" ? t("역행", "Contrarian") : t("무관", "Unrelated")}</small></li>`).join("");
    const summary = flow?.leaderConfidence === "confirmed"
      ? t(`${labels[flow.leaderId]}의 동행 신호가 규모 조건까지 충족했습니다.`, `${labels[flow.leaderId]} meets both alignment and size conditions.`)
      : t("한 주체의 동행만으로 방향을 단정할 수 없습니다. 60거래일 기준과 규모 조건을 함께 확인합니다.", "No single participant meets both the alignment and size conditions over the 60-session window.");
    const methodology = `<section class="flow-regime" id="flow-method"><div><span>${t("60거래일 수급 구조", "60-session flow structure")}</span><strong>${flow?.label || t("산출 대기", "Pending")}</strong><p>${summary}</p></div><ul>${subjects || `<li>${t("수급 이력을 불러오지 못했습니다.", "Flow history is unavailable.")}</li>`}</ul><small>${t("일별 KOSPI 변동률 절대값이 0.05% 미만인 날은 제외합니다. 동행 63% 이상, 역행 37% 이하이며 기존 상태는 57%/43%를 벗어날 때 전환합니다.", "Sessions with an absolute KOSPI move below 0.05% are excluded. Entry thresholds are 63% aligned and 37% contrarian; existing states change only beyond 57%/43%.")}</small></section>`;
    const placeholder = root.querySelector("[data-flow-note]");
    const panel = document.createElement("div");
    panel.innerHTML = methodology;
    const methodPanel = panel.firstElementChild;
    methodPanel.id = "flow-method";
    methodPanel.className = "flow-methodology";
    methodPanel.innerHTML = `<div><span>${t("판정 기준", "How the reading is made")}</span><h2>${t("2주 누적 금액이 가장 큰 주체와 지수 방향을 비교합니다", "Compare the largest two-week cumulative flow with the index direction")}</h2><p>${t("최근 10거래일 누적 순매수·순매도의 절대 규모가 가장 큰 주체가 같은 기간 KOSPI 등락 방향과 같으면 수급 우세로, 반대면 혼재로 읽습니다. KOSPI 변동이 0.3% 미만이면 방향 판정은 보류합니다.", "The participant with the largest absolute cumulative net flow over the latest 10 sessions is treated as dominant only when its net-flow direction matches the KOSPI move. A KOSPI move below 0.3% leaves the direction unclassified.")}</p></div><small>${t("이는 단기 수급의 읽기 도구이며, 개별 주체의 매매가 시장 방향을 원인으로 설명한다는 뜻은 아닙니다.", "This is a short-term flow reading, not a claim that a participant's trading caused the market move.")}</small>`;
    placeholder.replaceWith(methodPanel);
    root.querySelector(".flow-commentary")?.remove();

    const table = root.querySelector("[data-flow-table]");
    table.parentElement.id = "flow-daily";
    table.innerHTML = `<thead><tr><th>${t("날짜", "Date")}</th><th>${labels.foreignSpot}</th><th>${labels.individualSpot}</th><th>${labels.institutionSpot}</th><th>${t("외국인 선물", "Foreign futures")}</th></tr></thead><tbody>${sorted.slice(-5).reverse().map((row) => `<tr><td>${row.date}</td><td>${money(row.foreignSpot)}</td><td>${money(row.individualSpot)}</td><td>${money(row.institutionSpot)}</td><td>${contracts(row.foreignFuturesContracts)}</td></tr>`).join("")}</tbody>`;
    const futures = document.createElement("p");
    futures.id = "flow-futures";
    futures.className = "flow-futures-note";
    futures.textContent = t("외국인 선물은 계약 수로 표시하며, 현물 순매수 금액과 합산하지 않습니다.", "Foreign futures are shown in contracts and are not added to cash-equity flow.");
    table.parentElement.after(futures);
    const source = root.querySelector(".flow-source-note") || document.createElement("p");
    source.className = "flow-source-note";
    source.textContent = t("출처: KRX Data Marketplace · KOSPI 투자자별 거래실적(현물) 및 KOSPI200 선물 투자자별 거래실적", "Source: KRX Data Marketplace · KOSPI investor trading (spot) and KOSPI 200 futures investor trading.");
    if (!source.isConnected) futures.after(source);
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
