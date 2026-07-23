(() => {
  const els = {
    status: document.querySelector("#flowStatus"),
    verdict: document.querySelector("#flowVerdict"),
    basisDate: document.querySelector("#flowBasisDate"),
    thresholdBasis: document.querySelector("#flowThresholdBasis"),
    behaviorList: document.querySelector("#flowBehaviorList"),
    dailyTable: document.querySelector("#flowDailyTable"),
  };
  if (!els.verdict) return;

  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  const labels = {
    foreignSpot: t("외국인", "Foreign"),
    individualSpot: t("개인", "Individuals"),
    institutionSpot: t("기관", "Institutions"),
  };
  const money = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}${t("조원", "T KRW")}`;
  const contracts = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Math.round(Number(value || 0)).toLocaleString()}${t("계약", " contracts")}`;
  const trendLabel = (state) => ({ continuing: t("5일도 같은 추세", "5-day trend continues"), turning: t("최근 5일 변화", "5-day change"), flat: t("최근 5일 보합", "5-day flat") })[state] || "--";

  function setStatus(message, state) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.state = state;
  }

  function render(flow, rows) {
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const subjects = flow.subjects || [];
    const leader = subjects.find((subject) => subject.id === flow.leaderId);
    const largestSeller = subjects.find((subject) => subject.id === flow.largestSellerId);
    const threshold = flow.thresholds?.enter;
    const headline = leader
      ? t(`${labels[leader.id] || leader.name} 수급이 KOSPI 방향과 동행`, `${labels[leader.id] || leader.name} flow aligns with the KOSPI direction`)
      : t("방향을 단정할 수 없는 수급 혼재", "Flow direction remains mixed");

    els.verdict.innerHTML = `
      <article class="wl-panel ${leader ? "is-good" : "is-warn"}"><span class="wl-panel-label">${t("30일 방향 판정", "30-SESSION DIRECTION")}</span><strong class="wl-panel-state">${headline}</strong><span class="wl-panel-basis">${t(`KOSPI ${flow.indexReturn >= 0 ? "+" : ""}${(Number(flow.indexReturn || 0) * 100).toFixed(1)}% · ${flow.count || 0}영업일`, `KOSPI ${flow.indexReturn >= 0 ? "+" : ""}${(Number(flow.indexReturn || 0) * 100).toFixed(1)}% · ${flow.count || 0} sessions`)}</span></article>
      <article class="wl-panel"><span class="wl-panel-label">${t("최대 순매도", "LARGEST NET SELLER")}</span><strong class="wl-panel-state">${largestSeller ? labels[largestSeller.id] || largestSeller.name : "--"}</strong><span class="wl-panel-basis">${largestSeller ? money(largestSeller.cumulative) : "--"}</span></article>
    `;

    if (els.thresholdBasis) {
      els.thresholdBasis.textContent = threshold ? `${t("진입", "Entry")} ${threshold.aligned}% / ${threshold.contrarian}%` : "--";
    }

    if (els.behaviorList) {
      els.behaviorList.innerHTML = subjects.map((subject) => {
        const width = Math.min(100, Math.abs(Number(subject.cumulative)) / Math.max(...subjects.map((item) => Math.abs(Number(item.cumulative))), 1) * 100);
        const tone = subject.state === "aligned" ? "is-good" : subject.state === "contrarian" ? "is-bad" : "";
        const positive = Number(subject.cumulative) >= 0;
        const fill = positive ? "var(--wl-good-ink)" : "var(--wl-bad-ink)";
        const rate = Number.isFinite(subject.matchRate) ? `${subject.matchRate.toFixed(1)}%` : "--";
        return `<li class="wl-row ${tone}"><span class="wl-row-name">${labels[subject.id] || subject.name}</span><span class="wl-row-val">${money(subject.cumulative)} · ${t("일별 일치", "Daily match")} ${rate}</span><span class="wl-div" role="img" aria-label="${labels[subject.id] || subject.name} ${money(subject.cumulative)}"><i class="wl-div-axis"></i><i class="wl-div-fill ${positive ? "buy" : "sell"}" style="width:${width}%;background:${fill}"></i></span><small>${t(`30일 누적 ${money(subject.cumulative)} · 5일 ${money(subject.shortCumulative)} · ${trendLabel(subject.shortTrend)}`, `30-session ${money(subject.cumulative)} · 5-session ${money(subject.shortCumulative)} · ${trendLabel(subject.shortTrend)}`)}</small></li>`;
      }).join("");
    }

    if (els.dailyTable) {
      const dailyRows = sorted.slice(-5).reverse().map((row) => `<tr><td>${row.date}</td><td>${money(row.foreignSpot)}</td><td>${money(row.individualSpot)}</td><td>${money(row.institutionSpot)}</td><td>${contracts(row.foreignFuturesContracts)}</td></tr>`).join("");
      els.dailyTable.innerHTML = `<thead><tr><th>${t("날짜", "Date")}</th><th>${labels.foreignSpot}</th><th>${labels.individualSpot}</th><th>${labels.institutionSpot}</th><th>${t("외국인 선물", "Foreign futures")}</th></tr></thead><tbody>${dailyRows}</tbody>`;
    }

    if (els.basisDate) els.basisDate.textContent = sorted.at(-1)?.date || "--";

    setStatus(t("데이터 불러오기 성공", "Data loaded"), "ok");
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
    setStatus(t("수급 데이터를 불러오지 못했습니다. 다음 정상 수집 후 다시 표시됩니다.", "Flow data could not be loaded. This page will return after the next successful collection."), "error");
  });
})();
