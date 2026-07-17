const earningsEls = {
  status: document.querySelector("#earningsStatus"),
  refresh: document.querySelector("#earningsRefresh"),
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

function toneForGrowth(value) {
  if (!Number.isFinite(value)) return "neutral";
  return value >= 0 ? "positive" : "negative";
}

function renderCards(data) {
  const companies = data.companies.filter(includeCompany);
  earningsEls.cards.innerHTML = companies.map((company) => {
    const latest = latestQuarter(company);
    if (!latest) {
      return `
        <article data-tone="neutral">
          <span>${company.symbol}</span>
          <strong>${company.name}</strong>
          <small>${company.group} · 분기 데이터 없음. ${company.message || ""}</small>
        </article>
      `;
    }

    return `
      <article data-tone="${toneForGrowth(latest.profitGrowthQoQ)}">
        <span>${company.symbol} · ${company.group}</span>
        <strong>${company.name}</strong>
        <dl>
          <div><dt>최근 분기</dt><dd>${latest.date}</dd></div>
          <div><dt>${latest.profitMetric}</dt><dd>${compactMoney(latest.profit, company.currency)}</dd></div>
          <div><dt>이익 QoQ</dt><dd>${pct(latest.profitGrowthQoQ)}</dd></div>
          <div><dt>CAPEX</dt><dd>${compactMoney(latest.capex, company.currency)}</dd></div>
          <div><dt>OCF</dt><dd>${compactMoney(latest.operatingCashFlow, company.currency)}</dd></div>
          <div><dt>FCF</dt><dd>${compactMoney(latest.freeCashFlow, company.currency)}</dd></div>
        </dl>
        <small>PER/PBR/컨센서스: N/A · 공개 데이터 소스 연결 전</small>
      </article>
    `;
  }).join("");
}

function renderTable(data) {
  const companies = data.companies.filter(includeCompany);
  const rows = companies.map((company) => {
    const latest = latestQuarter(company);
    if (!latest) {
      return `
        <tr>
          <td>${company.name}</td>
          <td>${company.group}</td>
          <td colspan="8">분기 실적 데이터 없음</td>
        </tr>
      `;
    }

    const width = Math.min(100, Math.abs(latest.profitGrowthQoQ || 0) * 100);
    const barClass = latest.profitGrowthQoQ >= 0 ? "positive" : "negative";

    return `
      <tr>
        <td>${company.name}<br><small>${company.symbol}</small></td>
        <td>${company.group}</td>
        <td>${latest.date}</td>
        <td>${compactMoney(latest.profit, company.currency)}</td>
        <td>
          <div class="bar-cell">
            <span class="${barClass}" style="width:${width}%"></span>
            <b>${pct(latest.profitGrowthQoQ)}</b>
          </div>
        </td>
        <td>${compactMoney(latest.capex, company.currency)}</td>
        <td>${compactMoney(latest.operatingCashFlow, company.currency)}</td>
        <td>${compactMoney(latest.freeCashFlow, company.currency)}</td>
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
        <th>이익 증감률</th>
        <th>CAPEX</th>
        <th>OCF</th>
        <th>FCF</th>
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

earningsEls.refresh.addEventListener("click", loadEarnings);
loadEarnings();
