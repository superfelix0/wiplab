const earningsEls = {
  status: document.querySelector("#earningsStatus"),
  summary: document.querySelector("#earningsSummary"),
  takeaways: document.querySelector("#earningsTakeaways"),
  capexRanking: document.querySelector("#capexRanking"),
  profitRanking: document.querySelector("#profitRanking"),
  fcfRanking: document.querySelector("#fcfRanking"),
  cards: document.querySelector("#earningsCards"),
  table: document.querySelector("#earningsTable"),
  sources: document.querySelector("#earningsSources"),
};

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const moneyFormatter = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });
let selectedCompare = "cashflow";

function t(ko, en) {
  return IS_EN ? en : ko;
}

function setEarningsStatus(message, state = "neutral") {
  earningsEls.status.textContent = message;
  earningsEls.status.dataset.state = state;
}

function compactMoney(value, currency = "") {
  if (!Number.isFinite(value)) return "N/A";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${moneyFormatter.format(abs / 1e12)}T ${currency}`.trim();
  if (abs >= 1e9) return `${sign}${moneyFormatter.format(abs / 1e9)}B ${currency}`.trim();
  if (abs >= 1e6) return `${sign}${moneyFormatter.format(abs / 1e6)}M ${currency}`.trim();
  return `${sign}${moneyFormatter.format(abs)} ${currency}`.trim();
}

function pct(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function latestQuarter(company) {
  return company.quarters?.at(-1) || null;
}

function hyperscalers(data) {
  return (data.companies || []).filter((company) => company.group === "Hyperscaler");
}

function rowsWithLatest(data) {
  return hyperscalers(data).map((company) => ({ company, latest: latestQuarter(company) })).filter((item) => item.latest);
}

function capexOcf(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.operatingCashFlow) || latest.operatingCashFlow === 0) return null;
  return Math.abs(latest.capex) / Math.abs(latest.operatingCashFlow);
}

function capexProfit(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.profit) || latest.profit <= 0) return null;
  return Math.abs(latest.capex) / latest.profit;
}

function fcfMargin(latest) {
  if (!Number.isFinite(latest?.freeCashFlow) || !Number.isFinite(latest?.quarterlyTotalRevenue) || latest.quarterlyTotalRevenue === 0) return null;
  return latest.freeCashFlow / latest.quarterlyTotalRevenue;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function burdenKey(ocf, profit) {
  if (!Number.isFinite(ocf) && !Number.isFinite(profit)) return "unknown";
  if ((ocf ?? 0) <= 0.7 && (profit ?? 0) <= 0.9) return "comfortable";
  if ((ocf ?? 0) <= 1.0 && (profit ?? 0) <= 1.2) return "manageable";
  return "stretched";
}

function burdenLabel(ocf, profit) {
  return {
    unknown: t("확인 필요", "Needs data"),
    comfortable: t("여유 있음", "Comfortable"),
    manageable: t("관리 가능", "Manageable"),
    stretched: t("부담 확대", "Burden rising"),
  }[burdenKey(ocf, profit)];
}

function renderSummary(data) {
  const rows = rowsWithLatest(data);
  const avgOcf = average(rows.map(({ latest }) => capexOcf(latest)));
  const avgProfit = average(rows.map(({ latest }) => capexProfit(latest)));
  const positiveFcf = rows.filter(({ latest }) => Number.isFinite(latest.freeCashFlow) && latest.freeCashFlow > 0).length;
  const topFcf = [...rows].filter(({ latest }) => Number.isFinite(latest.freeCashFlow)).sort((a, b) => b.latest.freeCashFlow - a.latest.freeCashFlow)[0];

  earningsEls.summary.innerHTML = `
    <article data-tone="neutral"><span>${t("대상 기업", "Companies")}</span><strong>${rows.length}</strong><small>${t("하이퍼스케일러만 표시합니다.", "Hyperscalers only.")}</small></article>
    <article data-tone="${burdenKey(avgOcf, avgProfit) === "stretched" ? "negative" : "positive"}"><span>${t("종합 판단", "Overall read")}</span><strong>${burdenLabel(avgOcf, avgProfit)}</strong><small>${t("CAPEX/OCF와 CAPEX/순이익 평균 기준입니다.", "Based on average CAPEX/OCF and CAPEX/net income.")}</small></article>
    <article data-tone="neutral"><span>CAPEX/OCF</span><strong>${pct(avgOcf)}</strong><small>${t("100% 이하면 해당 분기 OCF 안에서 CAPEX가 대체로 감당됩니다.", "Below 100% means CAPEX is broadly covered by quarterly OCF.")}</small></article>
    <article data-tone="neutral"><span>${t("CAPEX/순이익", "CAPEX/net income")}</span><strong>${pct(avgProfit)}</strong><small>${t("이익 대비 투자 강도를 봅니다.", "Investment intensity relative to profit.")}</small></article>
    <article data-tone="${positiveFcf >= rows.length / 2 ? "positive" : "negative"}"><span>FCF +</span><strong>${positiveFcf}/${rows.length}</strong><small>${t("최근 분기 FCF가 플러스인 기업 수입니다.", "Companies with positive FCF in the latest quarter.")}</small></article>
    <article data-tone="positive"><span>${t("FCF 상위", "Top FCF")}</span><strong>${topFcf ? topFcf.company.name : "N/A"}</strong><small>${topFcf ? compactMoney(topFcf.latest.freeCashFlow, topFcf.company.currency) : "N/A"}</small></article>
  `;
}

function renderTakeaways(data) {
  const rows = rowsWithLatest(data);
  const avgOcf = average(rows.map(({ latest }) => capexOcf(latest)));
  const avgProfit = average(rows.map(({ latest }) => capexProfit(latest)));
  const stretched = rows.filter(({ latest }) => burdenKey(capexOcf(latest), capexProfit(latest)) === "stretched");
  earningsEls.takeaways.innerHTML = `
    <article><span>${t("핵심 질문", "Key question")}</span><strong>${t("투자 여력", "Spending room")}</strong><p>${t("AI CAPEX가 매출 성장의 신호인지, 현금흐름을 압박하는 부담인지 OCF와 순이익 대비로 봅니다.", "Reads whether AI CAPEX is a growth signal or a cash-flow burden by comparing it with OCF and net income.")}</p></article>
    <article><span>CAPEX/OCF</span><strong>${pct(avgOcf)}</strong><p>${t("낮을수록 영업현금흐름 안에서 투자를 감당할 여지가 큽니다.", "Lower means more room to fund investment within operating cash flow.")}</p></article>
    <article><span>${t("CAPEX/순이익", "CAPEX/net income")}</span><strong>${pct(avgProfit)}</strong><p>${t("낮을수록 이익 대비 투자 부담이 작습니다.", "Lower means less investment burden relative to profit.")}</p></article>
    <article><span>${t("부담 확대 기업", "Stretched companies")}</span><strong>${stretched.length}/${rows.length}</strong><p>${stretched.length ? stretched.map(({ company }) => company.name).join(", ") : t("현재 평균적으로 과도한 부담 신호는 제한적입니다.", "Currently, stretched signals are limited on this dataset.")}</p></article>
  `;
}

function renderRankList(target, rows, metric, options = {}) {
  const valid = rows.filter(({ latest }) => Number.isFinite(metric(latest)));
  if (!valid.length) {
    target.innerHTML = `<p class="empty-note">${t("표시할 데이터가 없습니다.", "No data to display.")}</p>`;
    return;
  }
  const sorted = valid.sort((a, b) => options.lowerIsBetter ? metric(a.latest) - metric(b.latest) : metric(b.latest) - metric(a.latest));
  const max = Math.max(...sorted.map(({ latest }) => Math.abs(metric(latest))), 0.01);
  target.innerHTML = sorted.map(({ company, latest }, index) => {
    const value = metric(latest);
    const width = Math.max(4, Math.min(100, Math.abs(value) / max * 100));
    const good = options.lowerIsBetter ? value <= 1 : value >= 0;
    return `<article class="rank-row"><b>${String(index + 1).padStart(2, "0")}</b><div><strong>${company.name}</strong><small>${company.symbol}</small><span class="rank-bar"><i class="${good ? "positive" : "negative"}" style="width:${width}%"></i></span></div><em>${options.format ? options.format(value, latest, company) : pct(value)}</em></article>`;
  }).join("");
}

function syncTabs() {
  document.querySelectorAll("[data-earnings-tab]").forEach((button) => {
    const active = button.dataset.earningsTab === selectedCompare;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-earnings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.earningsPanel !== selectedCompare;
  });
}

function renderRankings(data) {
  const rows = rowsWithLatest(data);
  renderRankList(earningsEls.capexRanking, rows, capexOcf, { lowerIsBetter: true, format: pct });
  renderRankList(earningsEls.profitRanking, rows, capexProfit, { lowerIsBetter: true, format: pct });
  renderRankList(earningsEls.fcfRanking, rows, (latest) => latest.freeCashFlow, { format: (value, latest, company) => compactMoney(value, company.currency) });
  syncTabs();
}

function renderCards(data) {
  const rows = rowsWithLatest(data).sort((a, b) => a.company.name.localeCompare(b.company.name));
  earningsEls.cards.innerHTML = rows.map(({ company, latest }) => `
    <article data-tone="${burdenKey(capexOcf(latest), capexProfit(latest)) === "stretched" ? "negative" : "positive"}">
      <span>${company.symbol} · ${company.group}</span>
      <strong>${company.name}</strong>
      <dl>
        <div><dt>${t("최근 분기", "Latest quarter")}</dt><dd>${latest.date}</dd></div>
        <div><dt>${latest.profitMetric || t("순이익", "Net income")}</dt><dd>${compactMoney(latest.profit, company.currency)}</dd></div>
        <div><dt>CAPEX</dt><dd>${compactMoney(latest.capex, company.currency)}</dd></div>
        <div><dt>OCF</dt><dd>${compactMoney(latest.operatingCashFlow, company.currency)}</dd></div>
        <div><dt>CAPEX/OCF</dt><dd>${pct(capexOcf(latest))}</dd></div>
        <div><dt>${t("CAPEX/순이익", "CAPEX/net income")}</dt><dd>${pct(capexProfit(latest))}</dd></div>
        <div><dt>FCF</dt><dd>${compactMoney(latest.freeCashFlow, company.currency)}</dd></div>
        <div><dt>FCF Margin</dt><dd>${pct(fcfMargin(latest))}</dd></div>
      </dl>
      <small>${burdenLabel(capexOcf(latest), capexProfit(latest))}</small>
    </article>
  `).join("");
}

function renderTable(data) {
  const rows = rowsWithLatest(data).map(({ company, latest }) => `
    <tr><td>${company.name}<br><small>${company.symbol}</small></td><td>${latest.date}</td><td>${compactMoney(latest.quarterlyTotalRevenue, company.currency)}</td><td>${compactMoney(latest.profit, company.currency)}</td><td>${compactMoney(latest.capex, company.currency)}</td><td>${compactMoney(latest.operatingCashFlow, company.currency)}</td><td>${pct(capexOcf(latest))}</td><td>${pct(capexProfit(latest))}</td><td>${compactMoney(latest.freeCashFlow, company.currency)}</td></tr>
  `).join("");
  earningsEls.table.innerHTML = `<thead><tr><th>${t("회사", "Company")}</th><th>${t("분기", "Quarter")}</th><th>${t("매출", "Revenue")}</th><th>${t("순이익", "Net income")}</th><th>CAPEX</th><th>OCF</th><th>CAPEX/OCF</th><th>${t("CAPEX/순이익", "CAPEX/net income")}</th><th>FCF</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderSources(data) {
  earningsEls.sources.innerHTML = (data.sources || []).map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a><span>${IS_EN ? "Yahoo Finance public fundamentals time-series. Coverage can vary by ticker." : "Yahoo Finance 공개 fundamentals time-series. 종목별 공개 범위는 다를 수 있습니다."}</span></li>`).join("");
}

function render(data) {
  renderSummary(data);
  renderTakeaways(data);
  renderRankings(data);
  renderCards(data);
  renderTable(data);
  renderSources(data);
}

async function loadEarnings() {
  setEarningsStatus(t("하이퍼스케일러 실적 데이터를 불러오는 중입니다.", "Loading hyperscaler earnings data."));
  try {
    const response = await fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(t("하이퍼스케일러 실적 데이터를 불러오지 못했습니다.", "Could not load hyperscaler earnings data."));
    render(data);
    setEarningsStatus(t(`업데이트 완료: ${data.generatedAt}`, `Updated: ${data.generatedAt}`), "ok");
  } catch (error) {
    setEarningsStatus(error.message || t("하이퍼스케일러 실적 데이터를 불러오지 못했습니다.", "Could not load hyperscaler earnings data."), "error");
  }
}

document.querySelectorAll("[data-earnings-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedCompare = button.dataset.earningsTab;
    syncTabs();
  });
});

loadEarnings();
