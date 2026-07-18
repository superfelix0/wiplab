const memoryEls = {
  status: document.querySelector("#memoryStatus"),
  summary: document.querySelector("#memorySummary"),
  chart: document.querySelector("#memoryOpChart"),
  legend: document.querySelector("#memoryLegend"),
  table: document.querySelector("#memoryTable"),
  sources: document.querySelector("#memorySources"),
};

const MEMORY_IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const memoryNumber = new Intl.NumberFormat(MEMORY_IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });
const memoryColors = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function mt(ko, en) {
  return MEMORY_IS_EN ? en : ko;
}

function setMemoryStatus(message, state = "neutral") {
  memoryEls.status.textContent = message;
  memoryEls.status.dataset.state = state;
}

function mPct(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function mMoney(value, currency = "") {
  if (!Number.isFinite(value)) return "N/A";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}${memoryNumber.format(abs / 1e12)}T ${currency}`.trim();
  if (abs >= 1e9) return `${sign}${memoryNumber.format(abs / 1e9)}B ${currency}`.trim();
  if (abs >= 1e6) return `${sign}${memoryNumber.format(abs / 1e6)}M ${currency}`.trim();
  return `${sign}${memoryNumber.format(abs)} ${currency}`.trim();
}

function qoq(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function memoryCompanies(data) {
  return (data.companies || []).filter((company) => company.group !== "Hyperscaler");
}

function enrichedCompany(company) {
  const quarters = (company.quarters || [])
    .filter((q) => Number.isFinite(q.quarterlyOperatingIncome) && Number.isFinite(q.quarterlyTotalRevenue))
    .slice(-8)
    .map((q, index, arr) => {
      const prev = arr[index - 1];
      return {
        ...q,
        revenueGrowth: prev ? qoq(q.quarterlyTotalRevenue, prev.quarterlyTotalRevenue) : null,
        opGrowth: prev ? qoq(q.quarterlyOperatingIncome, prev.quarterlyOperatingIncome) : null,
        opMargin: q.quarterlyTotalRevenue ? q.quarterlyOperatingIncome / q.quarterlyTotalRevenue : null,
      };
    });
  return { ...company, quarters };
}

function chartRows(companies) {
  return companies
    .map(enrichedCompany)
    .filter((company) => company.quarters.length >= 4);
}

function allChartPoints(companies) {
  return companies.flatMap((company) => company.quarters.filter((q) => Number.isFinite(q.opGrowth)).map((q) => q.opGrowth));
}

function renderMemorySummary(companies) {
  const rows = companies.map(enrichedCompany).filter((company) => company.quarters.length);
  const withGrowth = rows.map((company) => ({ company, latest: company.quarters.at(-1) })).filter(({ latest }) => Number.isFinite(latest.opGrowth));
  const avgGrowth = withGrowth.length ? withGrowth.reduce((sum, item) => sum + item.latest.opGrowth, 0) / withGrowth.length : null;
  const top = [...withGrowth].sort((a, b) => b.latest.opGrowth - a.latest.opGrowth)[0];
  const marginRows = rows.map((company) => ({ company, latest: company.quarters.at(-1) })).filter(({ latest }) => Number.isFinite(latest.opMargin));
  const topMargin = [...marginRows].sort((a, b) => b.latest.opMargin - a.latest.opMargin)[0];
  memoryEls.summary.innerHTML = `
    <article data-tone="neutral"><span>${mt("대상 기업", "Companies")}</span><strong>${rows.length}</strong><small>${mt("공개 분기 손익 데이터가 있는 메모리·파운드리 기업 수입니다.", "Memory/foundry companies with public quarterly income data.")}</small></article>
    <article data-tone="${avgGrowth >= 0 ? "positive" : "negative"}"><span>${mt("평균 영업이익 증가율", "Avg operating-profit growth")}</span><strong>${mPct(avgGrowth)}</strong><small>${mt("최근 분기 QoQ 평균입니다.", "Latest-quarter QoQ average.")}</small></article>
    <article data-tone="positive"><span>${mt("증가율 상위", "Top growth")}</span><strong>${top ? top.company.name : "N/A"}</strong><small>${top ? `${mPct(top.latest.opGrowth)} · ${top.latest.date}` : mt("데이터 없음", "No data")}</small></article>
    <article data-tone="neutral"><span>${mt("영업이익률 상위", "Top margin")}</span><strong>${topMargin ? topMargin.company.name : "N/A"}</strong><small>${topMargin ? `${mPct(topMargin.latest.opMargin)} · ${topMargin.latest.date}` : mt("데이터 없음", "No data")}</small></article>
  `;
}

function renderMemoryChart(companies) {
  const rows = chartRows(companies);
  if (!rows.length) {
    memoryEls.chart.innerHTML = `<text x="450" y="180" text-anchor="middle" fill="currentColor">${mt("표시할 데이터가 없습니다.", "No data to display.")}</text>`;
    memoryEls.legend.innerHTML = "";
    return;
  }
  const quarterSet = new Set(rows.flatMap((company) => company.quarters.map((q) => q.date)));
  const quarters = Array.from(quarterSet).sort().slice(-6);
  const values = allChartPoints(rows).filter(Number.isFinite);
  const min = Math.min(-0.5, ...values);
  const max = Math.max(0.5, ...values);
  const pad = 44;
  const width = 900;
  const height = 360;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const x = (date) => pad + (quarters.indexOf(date) / Math.max(1, quarters.length - 1)) * plotW;
  const y = (value) => pad + (max - value) / (max - min || 1) * plotH;
  const zeroY = y(0);

  const grid = [min, 0, max].map((value) => `<line x1="${pad}" x2="${width - pad}" y1="${y(value)}" y2="${y(value)}" stroke="rgba(120,120,120,.25)" stroke-dasharray="4 4"/><text x="10" y="${y(value) + 4}" fill="currentColor" opacity=".6">${mPct(value)}</text>`).join("");
  const xLabels = quarters.map((date) => `<text x="${x(date)}" y="${height - 12}" text-anchor="middle" fill="currentColor" opacity=".62">${date.slice(2, 7)}</text>`).join("");
  const lines = rows.map((company, index) => {
    const color = memoryColors[index % memoryColors.length];
    const points = quarters.map((date) => {
      const q = company.quarters.find((item) => item.date === date);
      return q && Number.isFinite(q.opGrowth) ? `${x(date)},${y(q.opGrowth)}` : null;
    }).filter(Boolean);
    const dots = quarters.map((date) => {
      const q = company.quarters.find((item) => item.date === date);
      if (!q || !Number.isFinite(q.opGrowth)) return "";
      return `<circle cx="${x(date)}" cy="${y(q.opGrowth)}" r="4" fill="${color}"><title>${company.name} ${date}: ${mPct(q.opGrowth)}</title></circle>`;
    }).join("");
    return `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  }).join("");
  memoryEls.chart.innerHTML = `${grid}<line x1="${pad}" x2="${width - pad}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(0,0,0,.35)"/>${xLabels}${lines}`;
  memoryEls.legend.innerHTML = rows.map((company, index) => `<span><i style="background:${memoryColors[index % memoryColors.length]}"></i>${company.name}</span>`).join("");
}

function renderMemoryTable(companies) {
  const rows = memoryCompanies({ companies }).map(enrichedCompany).map((company) => {
    const latest = company.quarters.at(-1);
    if (!latest) {
      return `<tr><td>${company.name}<br><small>${company.symbol}</small></td><td>${company.group}</td><td colspan="7">${mt("공개 분기 손익 데이터 없음", "No public quarterly income data")}</td></tr>`;
    }
    return `<tr>
      <td>${company.name}<br><small>${company.symbol}</small></td>
      <td>${company.group}</td>
      <td>${latest.date}</td>
      <td>${mMoney(latest.quarterlyTotalRevenue, company.currency)}</td>
      <td>${mPct(latest.revenueGrowth)}</td>
      <td>${mMoney(latest.quarterlyOperatingIncome, company.currency)}</td>
      <td>${mPct(latest.opMargin)}</td>
      <td>${mPct(latest.opGrowth)}</td>
    </tr>`;
  }).join("");
  memoryEls.table.innerHTML = `<thead><tr><th>${mt("회사", "Company")}</th><th>${mt("분류", "Group")}</th><th>${mt("분기", "Quarter")}</th><th>${mt("매출액", "Revenue")}</th><th>${mt("매출 성장률", "Revenue QoQ")}</th><th>${mt("영업이익", "Operating profit")}</th><th>${mt("영업이익률", "Operating margin")}</th><th>${mt("영업이익 증가율", "Operating-profit QoQ")}</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderMemorySources(data) {
  memoryEls.sources.innerHTML = (data.sources || []).map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a><span>${MEMORY_IS_EN ? "Yahoo Finance public fundamentals time-series. Coverage can vary by ticker." : "Yahoo Finance 공개 fundamentals time-series. 종목별 공개 범위는 다를 수 있습니다."}</span></li>`).join("");
}

async function loadMemoryEarnings() {
  setMemoryStatus(mt("메모리 실적 데이터를 불러오는 중입니다.", "Loading memory earnings data."));
  try {
    const response = await fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(mt("메모리 실적 데이터를 불러오지 못했습니다.", "Could not load memory earnings data."));
    const companies = memoryCompanies(data);
    renderMemorySummary(companies);
    renderMemoryChart(companies);
    renderMemoryTable(companies);
    renderMemorySources(data);
    setMemoryStatus(mt(`업데이트 완료: ${data.generatedAt}`, `Updated: ${data.generatedAt}`), "ok");
  } catch (error) {
    setMemoryStatus(error.message || mt("메모리 실적 데이터를 불러오지 못했습니다.", "Could not load memory earnings data."), "error");
  }
}

loadMemoryEarnings();
