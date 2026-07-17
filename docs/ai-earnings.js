const earningsEls = {
  status: document.querySelector("#earningsStatus"),
  refresh: document.querySelector("#earningsRefresh"),
  summary: document.querySelector("#earningsSummary"),
  ranking: document.querySelector("#earningsRanking"),
  capexRanking: document.querySelector("#capexRanking"),
  intensityRanking: document.querySelector("#intensityRanking"),
  cards: document.querySelector("#earningsCards"),
  table: document.querySelector("#earningsTable"),
  sources: document.querySelector("#earningsSources"),
  group: document.querySelector("#earningsGroup"),
};

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

let earningsData = null;
let selectedGroup = "all";
let selectedCompare = "growth";

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
  return `${sign}${moneyFormatter.format(abs)} ${currency}`;
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

function capexOpex(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.operatingExpense) || latest.operatingExpense === 0) {
    return null;
  }
  return Math.abs(latest.capex) / Math.abs(latest.operatingExpense);
}

function capexEbitda(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.ebitda) || latest.ebitda === 0) {
    return null;
  }
  return Math.abs(latest.capex) / Math.abs(latest.ebitda);
}

function capexIntensity(latest) {
  return capexOpex(latest) ?? capexEbitda(latest);
}

function capexIntensityLabel(latest) {
  return Number.isFinite(capexOpex(latest)) ? "CAPEX/OPEX" : "CAPEX/EBITDA";
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

function renderSummary(data) {
  const rows = companiesWithLatest(data);
  const growthValues = rows.map(({ latest }) => latest.profitGrowthQoQ);
  const capexBurdenValues = rows.map(({ latest }) => capexBurden(latest));
  const capexIntensityValues = rows.map(({ latest }) => capexIntensity(latest));
  const fcfPositive = rows.filter(({ latest }) => Number.isFinite(latest.freeCashFlow) && latest.freeCashFlow > 0).length;
  const topGrowth = rows
    .filter(({ latest }) => Number.isFinite(latest.profitGrowthQoQ))
    .sort((a, b) => b.latest.profitGrowthQoQ - a.latest.profitGrowthQoQ)[0];
  const deepestCapex = rows
    .filter(({ latest }) => Number.isFinite(capexBurden(latest)))
    .sort((a, b) => capexBurden(b.latest) - capexBurden(a.latest))[0];

  earningsEls.summary.innerHTML = `
    <article data-tone="neutral">
      <span>커버리지</span>
      <strong>${rows.length}/${currentCompanies(data).length}</strong>
      <small>분기 실적이 있는 기업 수입니다. Kioxia처럼 공개 시계열이 비어 있는 회사는 상세표에 따로 표시합니다.</small>
    </article>
    <article data-tone="${toneForGrowth(average(growthValues))}">
      <span>평균 이익 성장률</span>
      <strong>${pct(average(growthValues))}</strong>
      <small>최근 분기 QoQ 평균입니다. 적자/흑자 전환 기업은 변동률이 크게 튈 수 있습니다.</small>
    </article>
    <article data-tone="neutral">
      <span>평균 CAPEX/OCF</span>
      <strong>${pct(average(capexBurdenValues))}</strong>
      <small>영업현금흐름 대비 CAPEX 부담입니다. 통화가 다른 기업끼리도 상대 비교가 가능합니다.</small>
    </article>
    <article data-tone="neutral">
      <span>평균 CAPEX/OPEX</span>
      <strong>${pct(average(capexIntensityValues))}</strong>
      <small>운영비 대비 설비투자 강도입니다. OPEX가 없으면 EBITDA 기준으로 자동 대체합니다.</small>
    </article>
    <article data-tone="${fcfPositive >= rows.length / 2 ? "positive" : "negative"}">
      <span>FCF 플러스</span>
      <strong>${fcfPositive}/${rows.length}</strong>
      <small>최근 분기 잉여현금흐름이 플러스인 기업 수입니다.</small>
    </article>
    <article data-tone="positive">
      <span>성장률 1위</span>
      <strong>${topGrowth ? topGrowth.company.name : "N/A"}</strong>
      <small>${topGrowth ? `${pct(topGrowth.latest.profitGrowthQoQ)} · ${topGrowth.latest.date}` : "데이터 없음"}</small>
    </article>
    <article data-tone="negative">
      <span>CAPEX 부담 1위</span>
      <strong>${deepestCapex ? deepestCapex.company.name : "N/A"}</strong>
      <small>${deepestCapex ? `CAPEX/OCF ${pct(capexBurden(deepestCapex.latest))}` : "데이터 없음"}</small>
    </article>
  `;
}

function renderRankList(target, rows, metric, options = {}) {
  const valid = rows.filter(({ latest }) => Number.isFinite(metric(latest)));
  if (!valid.length) {
    target.innerHTML = `<p class="empty-note">표시할 데이터가 없습니다.</p>`;
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
  renderRankList(earningsEls.ranking, rows, (latest) => latest.profitGrowthQoQ, {
    format: (value) => pct(value),
  });
  renderRankList(earningsEls.capexRanking, rows, capexBurden, {
    lowerIsBetter: true,
    format: (value) => pct(value),
  });
  renderRankList(earningsEls.intensityRanking, rows, capexIntensity, {
    lowerIsBetter: true,
    format: (value, latest) => `${pct(value)} ${capexIntensityLabel(latest)}`,
  });
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
    .sort((a, b) => (b.latest.profitGrowthQoQ ?? -Infinity) - (a.latest.profitGrowthQoQ ?? -Infinity))
    .slice(0, 4);

  earningsEls.cards.innerHTML = rows.map(({ company, latest }) => {
    const burden = capexBurden(latest);
    const intensity = capexIntensity(latest);
    const margin = fcfMargin(latest);
    return `
      <article data-tone="${toneForGrowth(latest.profitGrowthQoQ)}">
        <span>${company.symbol} · ${company.group}</span>
        <strong>${company.name}</strong>
        <dl>
          <div><dt>최근 분기</dt><dd>${latest.date}</dd></div>
          <div><dt>${latest.profitMetric}</dt><dd>${compactMoney(latest.profit, company.currency)}</dd></div>
          <div><dt>이익 QoQ</dt><dd>${pct(latest.profitGrowthQoQ)}</dd></div>
          <div><dt>CAPEX/OCF</dt><dd>${pct(burden)}</dd></div>
          <div><dt>${capexIntensityLabel(latest)}</dt><dd>${pct(intensity)}</dd></div>
          <div><dt>FCF</dt><dd>${compactMoney(latest.freeCashFlow, company.currency)}</dd></div>
          <div><dt>FCF Margin</dt><dd>${pct(margin)}</dd></div>
        </dl>
        <small>상위 성장 기업 요약입니다. PER/PBR/컨센서스는 데이터 원천 연결 전까지 N/A입니다.</small>
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
          <td colspan="11">분기 실적 데이터 없음 · ${company.message || ""}</td>
        </tr>
      `;
    }

    const growth = latest.profitGrowthQoQ;
    const width = Math.min(100, Math.abs(growth || 0) * 100);
    const barClass = growth >= 0 ? "positive" : "negative";
    const burden = capexBurden(latest);
    const intensity = capexIntensity(latest);

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
        <td>${compactMoney(latest.operatingCashFlow, company.currency)}</td>
        <td>${compactMoney(latest.freeCashFlow, company.currency)}</td>
        <td>${pct(burden)}</td>
        <td>${pct(intensity)}<br><small>${capexIntensityLabel(latest)}</small></td>
        <td>${pct(fcfMargin(latest))}</td>
        <td>N/A</td>
        <td>N/A</td>
      </tr>
    `;
  }).join("");

  earningsEls.table.innerHTML = `
    <thead>
      <tr>
        <th>회사</th>
        <th>그룹</th>
        <th>분기</th>
        <th>이익</th>
        <th>이익 QoQ</th>
        <th>CAPEX</th>
        <th>OCF</th>
        <th>FCF</th>
        <th>CAPEX/OCF</th>
        <th>CAPEX/OPEX</th>
        <th>FCF Margin</th>
        <th>PER/PBR</th>
        <th>컨센서스</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderSources(data) {
  earningsEls.sources.innerHTML = (data.sources || []).map((source) => `
    <li>
      <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>
      <span>${source.note}</span>
    </li>
  `).join("");
}

function render(data) {
  renderSummary(data);
  renderRankings(data);
  renderCards(data);
  renderTable(data);
  renderSources(data);
}

async function loadEarnings() {
  earningsEls.refresh.disabled = true;
  setEarningsStatus("AI 실적 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error("AI 실적 데이터를 불러오지 못했습니다.");
    }
    earningsData = data;
    render(data);
    setEarningsStatus(`업데이트 완료: ${data.generatedAt} · ${data.source}`, "ok");
  } catch (error) {
    setEarningsStatus(error.message || "AI 실적 데이터를 불러오지 못했습니다.", "error");
  } finally {
    earningsEls.refresh.disabled = false;
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

earningsEls.refresh.addEventListener("click", loadEarnings);
loadEarnings();
