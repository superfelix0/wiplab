const earningsEls = {
  status: document.querySelector("#earningsStatus"),
  refresh: document.querySelector("#earningsRefresh"),
  summary: document.querySelector("#earningsSummary"),
  takeaways: document.querySelector("#earningsTakeaways"),
  ranking: document.querySelector("#earningsRanking"),
  capexRanking: document.querySelector("#capexRanking"),
  fcfRanking: document.querySelector("#fcfRanking"),
  cards: document.querySelector("#earningsCards"),
  table: document.querySelector("#earningsTable"),
  sources: document.querySelector("#earningsSources"),
  group: document.querySelector("#earningsGroup"),
};

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const moneyFormatter = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });

let earningsData = null;
let selectedGroup = "all";
let selectedCompare = "growth";

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
  if (abs >= 1e12) return `${sign}${moneyFormatter.format(abs / 1e12)}T ${currency}`;
  if (abs >= 1e9) return `${sign}${moneyFormatter.format(abs / 1e9)}B ${currency}`;
  if (abs >= 1e6) return `${sign}${moneyFormatter.format(abs / 1e6)}M ${currency}`;
  return `${sign}${moneyFormatter.format(abs)} ${currency}`.trim();
}

function pct(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function latestQuarter(company) {
  return company.quarters?.at(-1) || null;
}

function includeCompany(company) {
  if (selectedGroup === "all") return true;
  if (selectedGroup === "hyperscaler") return company.group === "Hyperscaler";
  return company.group !== "Hyperscaler";
}

function currentCompanies(data) {
  return data.companies.filter(includeCompany);
}

function companiesWithLatest(data) {
  return currentCompanies(data)
    .map((company) => ({ company, latest: latestQuarter(company) }))
    .filter((item) => item.latest);
}

function toneForGrowth(value) {
  if (!Number.isFinite(value)) return "neutral";
  return value >= 0 ? "positive" : "negative";
}

function capexBurden(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.operatingCashFlow) || latest.operatingCashFlow === 0) {
    return null;
  }
  return Math.abs(latest.capex) / Math.abs(latest.operatingCashFlow);
}

function capexProfitCoverage(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.profit) || latest.profit <= 0) {
    return null;
  }
  return Math.abs(latest.capex) / latest.profit;
}

function capexCoverageNote(latest) {
  const capexToOcf = capexBurden(latest);
  const capexToProfit = capexProfitCoverage(latest);
  const profitMetric = latest.profitMetric || t("이익", "profit");
  const ocfNote = Number.isFinite(capexToOcf)
    ? `${t("OCF 대비", "vs OCF")} ${pct(capexToOcf)}`
    : t("OCF 비교 불가", "OCF comparison unavailable");
  const profitNote = Number.isFinite(capexToProfit)
    ? `${profitMetric} ${t("대비", "coverage")} ${pct(capexToProfit)}`
    : `${profitMetric} ${t("대비 비교 불가", "comparison unavailable")}`;
  const fcfNote = Number.isFinite(latest?.freeCashFlow)
    ? `FCF ${latest.freeCashFlow >= 0 ? t("양수", "positive") : t("음수", "negative")}`
    : t("FCF 확인 불가", "FCF unavailable");
  return `${ocfNote} · ${profitNote} · ${fcfNote}`;
}

function fcfMargin(latest) {
  if (!Number.isFinite(latest?.freeCashFlow) || !Number.isFinite(latest?.quarterlyTotalRevenue) || latest.quarterlyTotalRevenue === 0) {
    return null;
  }
  return latest.freeCashFlow / latest.quarterlyTotalRevenue;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function burdenKey(capexToOcf, capexToProfit) {
  if (!Number.isFinite(capexToOcf) && !Number.isFinite(capexToProfit)) return "unknown";
  if ((capexToOcf ?? 0) <= 0.7 && (capexToProfit ?? 0) <= 0.9) return "comfortable";
  if ((capexToOcf ?? 0) <= 1.0 && (capexToProfit ?? 0) <= 1.2) return "manageable";
  return "stretched";
}

function burdenLabel(capexToOcf, capexToProfit) {
  const key = burdenKey(capexToOcf, capexToProfit);
  return {
    unknown: t("확인 필요", "Needs data"),
    comfortable: t("여유", "Comfortable"),
    manageable: t("관리 가능", "Manageable"),
    stretched: t("부담 확대", "Burden rising"),
  }[key];
}

function countByBurden(rows) {
  return rows.reduce((acc, { latest }) => {
    const key = burdenKey(capexBurden(latest), capexProfitCoverage(latest));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderTakeaways(data) {
  if (!earningsEls.takeaways) return;

  const rows = (data.companies || [])
    .filter((company) => company.group === "Hyperscaler")
    .map((company) => ({ company, latest: latestQuarter(company) }))
    .filter(({ latest }) => latest);
  const capexOcfRows = rows.filter(({ latest }) => Number.isFinite(capexBurden(latest)));
  const capexProfitRows = rows.filter(({ latest }) => Number.isFinite(capexProfitCoverage(latest)));
  const avgCapexOcf = average(capexOcfRows.map(({ latest }) => capexBurden(latest)));
  const avgCapexProfit = average(capexProfitRows.map(({ latest }) => capexProfitCoverage(latest)));
  const overallLabel = burdenLabel(avgCapexOcf, avgCapexProfit);
  const counts = countByBurden(rows);
  const heavyOcf = capexOcfRows.sort((a, b) => capexBurden(b.latest) - capexBurden(a.latest))[0];
  const heavyProfit = capexProfitRows.sort((a, b) => capexProfitCoverage(b.latest) - capexProfitCoverage(a.latest))[0];
  const manageable = (counts.comfortable || 0) + (counts.manageable || 0);

  earningsEls.takeaways.innerHTML = `
    <article>
      <span>${t("종합 판단", "Overall read")}</span>
      <strong>${overallLabel}</strong>
      <p>${t(
        `하이퍼스케일러 ${rows.length}개사의 평균 CAPEX 부담을 OCF와 순이익 기준으로 함께 봅니다.`,
        `Reads the average CAPEX burden of ${rows.length} hyperscalers against operating cash flow and net income.`
      )}</p>
    </article>
    <article>
      <span>CAPEX/OCF</span>
      <strong>${pct(avgCapexOcf)}</strong>
      <p>${t(
        "영업현금흐름 안에서 AI 인프라 투자를 얼마나 감당하는지 봅니다. 100%를 넘으면 OCF보다 CAPEX가 큽니다.",
        "Shows how much AI infrastructure investment is covered by operating cash flow. Above 100% means CAPEX is larger than OCF for the quarter."
      )}</p>
    </article>
    <article>
      <span>${t("CAPEX/순이익", "CAPEX/net income")}</span>
      <strong>${pct(avgCapexProfit)}</strong>
      <p>${t(
        "분기 순이익 대비 설비투자 부담입니다. 100%를 넘으면 이익보다 투자 지출이 더 큰 구간입니다.",
        "Shows CAPEX burden relative to quarterly net income. Above 100% means investment spending exceeds profit."
      )}</p>
    </article>
    <article>
      <span>${t("회사별 분포", "Company distribution")}</span>
      <strong>${manageable}/${rows.length} ${t("개 관리 가능", "manageable")}</strong>
      <p>${t(
        "여유·관리 가능으로 분류된 회사 수입니다. 평균이 높아도 회사별 체력 차이가 크면 해석을 나눠야 합니다.",
        "Number of companies classified as comfortable or manageable. A high average can hide major company-by-company differences."
      )}</p>
    </article>
    <article>
      <span>${t("주의할 지점", "Watch point")}</span>
      <strong>${heavyProfit ? heavyProfit.company.name : heavyOcf ? heavyOcf.company.name : "N/A"}</strong>
      <p>${heavyOcf ? `${t("CAPEX/OCF 부담 상위는", "Highest CAPEX/OCF burden:")} ${heavyOcf.company.name} (${pct(capexBurden(heavyOcf.latest))}).` : ""} ${heavyProfit ? `${t("CAPEX/순이익 부담 상위는", "Highest CAPEX/net income burden:")} ${heavyProfit.company.name} (${pct(capexProfitCoverage(heavyProfit.latest))}).` : ""}</p>
    </article>
  `;
}

function renderSummary(data) {
  const rows = companiesWithLatest(data);
  const growthValues = rows.map(({ latest }) => latest.profitGrowthQoQ);
  const capexBurdenValues = rows.map(({ latest }) => capexBurden(latest));
  const capexProfitValues = rows.map(({ latest }) => capexProfitCoverage(latest));
  const fcfPositive = rows.filter(({ latest }) => Number.isFinite(latest.freeCashFlow) && latest.freeCashFlow > 0).length;
  const topGrowth = rows
    .filter(({ latest }) => Number.isFinite(latest.profitGrowthQoQ))
    .sort((a, b) => b.latest.profitGrowthQoQ - a.latest.profitGrowthQoQ)[0];
  const deepestCapex = rows
    .filter(({ latest }) => Number.isFinite(capexBurden(latest)))
    .sort((a, b) => capexBurden(b.latest) - capexBurden(a.latest))[0];

  earningsEls.summary.innerHTML = `
    <article data-tone="neutral">
      <span>${t("커버리지", "Coverage")}</span>
      <strong>${rows.length}/${currentCompanies(data).length}</strong>
      <small>${t("분기 실적이 있는 기업 수입니다. Kioxia처럼 공개 시계열이 비어 있는 회사는 상세표에 따로 표시합니다.", "Number of companies with quarterly data. Companies with missing public time series are shown separately in the detail table.")}</small>
    </article>
    <article data-tone="${toneForGrowth(average(growthValues))}">
      <span>${t("평균 이익 성장률", "Avg profit growth")}</span>
      <strong>${pct(average(growthValues))}</strong>
      <small>${t("최근 분기 QoQ 평균입니다. 적자/흑자 전환 기업은 변동률이 크게 튈 수 있습니다.", "Average QoQ growth for the latest quarter. Turnaround quarters can create unusually large percentages.")}</small>
    </article>
    <article data-tone="neutral">
      <span>${t("평균 CAPEX/OCF", "Avg CAPEX/OCF")}</span>
      <strong>${pct(average(capexBurdenValues))}</strong>
      <small>${t("영업현금흐름 안에서 설비투자가 어느 정도 감당되는지 보는 지표입니다. 100%를 넘으면 해당 분기 OCF보다 CAPEX가 큽니다.", "Shows how much CAPEX is covered by operating cash flow. Above 100% means CAPEX exceeds OCF for the quarter.")}</small>
    </article>
    <article data-tone="neutral">
      <span>${t("평균 CAPEX/이익", "Avg CAPEX/profit")}</span>
      <strong>${pct(average(capexProfitValues))}</strong>
      <small>${t("영업이익 또는 순이익 대비 설비투자 부담입니다. 이익이 작거나 적자면 비교 가능성이 낮아집니다.", "CAPEX burden relative to operating or net income. Comparability drops when profit is small or negative.")}</small>
    </article>
    <article data-tone="${fcfPositive >= rows.length / 2 ? "positive" : "negative"}">
      <span>${t("FCF 플러스", "Positive FCF")}</span>
      <strong>${fcfPositive}/${rows.length}</strong>
      <small>${t("최근 분기 잉여현금흐름이 플러스인 기업 수입니다.", "Number of companies with positive free cash flow in the latest quarter.")}</small>
    </article>
    <article data-tone="positive">
      <span>${t("성장률 1위", "Top growth")}</span>
      <strong>${topGrowth ? topGrowth.company.name : "N/A"}</strong>
      <small>${topGrowth ? `${pct(topGrowth.latest.profitGrowthQoQ)} · ${topGrowth.latest.date}` : t("데이터 없음", "No data")}</small>
    </article>
    <article data-tone="negative">
      <span>${t("CAPEX 부담 1위", "Highest CAPEX burden")}</span>
      <strong>${deepestCapex ? deepestCapex.company.name : "N/A"}</strong>
      <small>${deepestCapex ? `CAPEX/OCF ${pct(capexBurden(deepestCapex.latest))}` : t("데이터 없음", "No data")}</small>
    </article>
  `;
}

function renderRankList(target, rows, metric, options = {}) {
  const valid = rows.filter(({ latest }) => Number.isFinite(metric(latest)));
  if (!valid.length) {
    target.innerHTML = `<p class="empty-note">${t("표시할 데이터가 없습니다.", "No data to display.")}</p>`;
    return;
  }

  const sorted = valid.sort((a, b) => metric(b.latest) - metric(a.latest)).slice(0, 8);
  const max = Math.max(...sorted.map(({ latest }) => Math.abs(metric(latest))), 0.01);

  target.innerHTML = sorted.map(({ company, latest }, index) => {
    const value = metric(latest);
    const width = Math.max(4, Math.min(100, (Math.abs(value) / max) * 100));
    const positive = options.lowerIsBetter ? value <= 0.65 : value >= 0;
    return `
      <article class="rank-row">
        <b>${String(index + 1).padStart(2, "0")}</b>
        <div>
          <strong>${company.name}</strong>
          <small>${company.symbol} · ${company.group}</small>
          <span class="rank-bar"><i class="${positive ? "positive" : "negative"}" style="width:${width}%"></i></span>
        </div>
        <em>${options.format ? options.format(value, latest, company) : pct(value)}</em>
      </article>
    `;
  }).join("");
}

function renderRankings(data) {
  const rows = companiesWithLatest(data);
  renderRankList(earningsEls.ranking, rows, (latest) => latest.profitGrowthQoQ, { format: (value) => pct(value) });
  renderRankList(earningsEls.capexRanking, rows, capexBurden, { lowerIsBetter: true, format: (value) => pct(value) });
  renderRankList(earningsEls.fcfRanking, rows, (latest) => latest.freeCashFlow, { format: (value, latest, company) => compactMoney(value, company.currency) });
  syncCompareTabs();
}

function syncCompareTabs() {
  document.querySelectorAll("[data-earnings-tab]").forEach((button) => {
    const active = button.dataset.earningsTab === selectedCompare;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-earnings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.earningsPanel !== selectedCompare;
  });
}

function renderCards(data) {
  const rows = companiesWithLatest(data)
    .sort((a, b) => {
      const groupCompare = a.company.group.localeCompare(b.company.group);
      if (groupCompare !== 0) return groupCompare;
      return a.company.name.localeCompare(b.company.name);
    });

  earningsEls.cards.innerHTML = rows.map(({ company, latest }) => {
    const burden = capexBurden(latest);
    const profitCoverage = capexProfitCoverage(latest);
    const margin = fcfMargin(latest);
    return `
      <article data-tone="${toneForGrowth(latest.profitGrowthQoQ)}">
        <span>${company.symbol} · ${company.group}</span>
        <strong>${company.name}</strong>
        <dl>
          <div><dt>${t("최근 분기", "Latest quarter")}</dt><dd>${latest.date}</dd></div>
          <div><dt>${latest.profitMetric}</dt><dd>${compactMoney(latest.profit, company.currency)}</dd></div>
          <div><dt>${t("이익 QoQ", "Profit QoQ")}</dt><dd>${pct(latest.profitGrowthQoQ)}</dd></div>
          <div><dt>CAPEX</dt><dd>${compactMoney(latest.capex, company.currency)}</dd></div>
          <div><dt>${t("CAPEX/이익", "CAPEX/profit")}</dt><dd>${pct(profitCoverage)}</dd></div>
          <div><dt>CAPEX/OCF</dt><dd>${pct(burden)}</dd></div>
          <div><dt>FCF</dt><dd>${compactMoney(latest.freeCashFlow, company.currency)}</dd></div>
          <div><dt>FCF Margin</dt><dd>${pct(margin)}</dd></div>
        </dl>
        <small>${capexCoverageNote(latest)}</small>
      </article>
    `;
  }).join("");
}

function renderTable(data) {
  const companies = currentCompanies(data);
  const rows = companies.map((company) => {
    const latest = latestQuarter(company);
    if (!latest) {
      return `
        <tr>
          <td>${company.name}<br><small>${company.symbol}</small></td>
          <td>${company.group}</td>
          <td colspan="11">${t("분기 실적 데이터 없음", "No quarterly financial data")} · ${company.message || ""}</td>
        </tr>
      `;
    }

    const growth = latest.profitGrowthQoQ;
    const width = Math.min(100, Math.abs(growth || 0) * 100);
    const barClass = growth >= 0 ? "positive" : "negative";
    const burden = capexBurden(latest);
    const profitCoverage = capexProfitCoverage(latest);

    return `
      <tr>
        <td>${company.name}<br><small>${company.symbol}</small></td>
        <td>${company.group}</td>
        <td>${latest.date}</td>
        <td>${compactMoney(latest.profit, company.currency)}</td>
        <td>
          <div class="bar-cell">
            <span class="${barClass}" style="width:${width}%"></span>
            <b>${pct(growth)}</b>
          </div>
        </td>
        <td>${compactMoney(latest.capex, company.currency)}</td>
        <td>${pct(profitCoverage)}</td>
        <td>${compactMoney(latest.operatingCashFlow, company.currency)}</td>
        <td>${compactMoney(latest.freeCashFlow, company.currency)}</td>
        <td>${pct(burden)}</td>
        <td>${pct(fcfMargin(latest))}</td>
      </tr>
    `;
  }).join("");

  earningsEls.table.innerHTML = `
    <thead>
      <tr>
        <th>${t("회사", "Company")}</th>
        <th>${t("그룹", "Group")}</th>
        <th>${t("분기", "Quarter")}</th>
        <th>${t("이익", "Profit")}</th>
        <th>${t("이익 QoQ", "Profit QoQ")}</th>
        <th>CAPEX</th>
        <th>${t("CAPEX/이익", "CAPEX/profit")}</th>
        <th>OCF</th>
        <th>FCF</th>
        <th>CAPEX/OCF</th>
        <th>FCF Margin</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function sourceNote(source) {
  if (!IS_EN) return source.note;
  if (source.title?.includes("Yahoo")) {
    return "Quarterly income-statement and cash-flow items from Yahoo Finance public fundamentals time series. Coverage can vary by ticker.";
  }
  return source.note || "";
}

function renderSources(data) {
  earningsEls.sources.innerHTML = (data.sources || []).map((source) => `
    <li>
      <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>
      <span>${sourceNote(source)}</span>
    </li>
  `).join("");
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
  if (earningsEls.refresh) earningsEls.refresh.disabled = true;
  setEarningsStatus(t("AI 실적 데이터를 불러오는 중입니다.", "Loading AI earnings data."));

  try {
    const response = await fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(t("AI 실적 데이터를 불러오지 못했습니다.", "Could not load AI earnings data."));
    }
    earningsData = data;
    render(data);
    setEarningsStatus(t(`업데이트 완료: ${data.generatedAt} · ${data.source}`, `Updated: ${data.generatedAt} · ${data.source}`), "ok");
  } catch (error) {
    setEarningsStatus(error.message || t("AI 실적 데이터를 불러오지 못했습니다.", "Could not load AI earnings data."), "error");
  } finally {
    if (earningsEls.refresh) earningsEls.refresh.disabled = false;
  }
}

earningsEls.group?.addEventListener("change", (event) => {
  selectedGroup = event.target.value;
  if (earningsData) render(earningsData);
});

document.querySelectorAll("[data-earnings-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedCompare = button.dataset.earningsTab || "growth";
    syncCompareTabs();
  });
});

earningsEls.refresh?.addEventListener("click", loadEarnings);
loadEarnings();
