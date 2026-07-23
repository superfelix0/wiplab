const memoryEls = {
  status: document.querySelector("#memoryStatus"),
  summary: document.querySelector("#memorySummary"),
  releaseHighlights: document.querySelector("#memoryReleaseHighlights"),
  chart: document.querySelector("#memoryOpChart"),
  legend: document.querySelector("#memoryLegend"),
  table: document.querySelector("#memoryTable"),
  timeline: document.querySelector("#memoryTimeline"),
  sources: document.querySelector("#memorySources"),
  eventMemo: document.querySelector("#memoryEventMemo"),
  tabs: document.querySelectorAll("[data-memory-tab]"),
  panels: document.querySelectorAll("[data-memory-panel]"),
};

const MEMORY_IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const memoryNumber = new Intl.NumberFormat(MEMORY_IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });
const memoryColors = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];

function mt(ko, en) {
  return MEMORY_IS_EN ? en : ko;
}

function setMemoryStatus(message, state = "neutral") {
  if (!memoryEls.status) return;
  memoryEls.status.textContent = message;
  memoryEls.status.dataset.state = state;
}

function mPct(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function mPp(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%p`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memoryCompanies(data) {
  return (data.companies || []).filter((company) => {
    const id = String(company.id || "").toLowerCase();
    const name = String(company.name || "").toLowerCase();
    return company.group !== "Hyperscaler" && id !== "kioxia" && !name.includes("kioxia");
  });
}

function enrichedCompany(company) {
  const baseQuarters = (company.quarters || [])
    .filter((q) => Number.isFinite(q.quarterlyOperatingIncome) && Number.isFinite(q.quarterlyTotalRevenue))
    .slice(-8);
  const quarters = baseQuarters.map((q, index, arr) => {
    const prev = arr[index - 1];
    const opMargin = q.quarterlyTotalRevenue ? q.quarterlyOperatingIncome / q.quarterlyTotalRevenue : null;
    const prevMargin = prev?.quarterlyTotalRevenue ? prev.quarterlyOperatingIncome / prev.quarterlyTotalRevenue : null;
    return {
      ...q,
      revenueGrowth: prev ? qoq(q.quarterlyTotalRevenue, prev.quarterlyTotalRevenue) : null,
      opGrowth: prev ? qoq(q.quarterlyOperatingIncome, prev.quarterlyOperatingIncome) : null,
      opMargin,
      opMarginChange: Number.isFinite(opMargin) && Number.isFinite(prevMargin) ? opMargin - prevMargin : null,
    };
  });
  return { ...company, quarters };
}

function chartRows(companies) {
  return companies.map(enrichedCompany).filter((company) => company.quarters.some((q) => Number.isFinite(q.opGrowth)));
}

function renderMemoryReleaseHighlights(companies) {
  if (!memoryEls.releaseHighlights) return;
  const rows = companies
    .filter((company) => company.latestHighlight && company.quarters?.length)
    .sort((a, b) => String(b.quarters.at(-1)?.date).localeCompare(String(a.quarters.at(-1)?.date)))
    .slice(0, 5);
  memoryEls.releaseHighlights.innerHTML = rows.length ? rows.map((company) => {
    const latest = company.quarters.at(-1);
    const highlight = MEMORY_IS_EN ? company.latestHighlight.en : company.latestHighlight.ko;
    return `<article><div><strong>${escapeHtml(company.name)}</strong><span>${escapeHtml(latest.date)}</span></div><p>${escapeHtml(highlight || mt("핵심 변화를 계산하는 중입니다.", "Calculating the key change."))}</p></article>`;
  }).join("") : `<p class="empty-note">${mt("표시할 최근 결산 데이터가 없습니다.", "No recent reported data to display.")}</p>`;
}

function renderMemorySummary(companies) {
  if (!memoryEls.summary) return;
  const rows = companies.map(enrichedCompany).filter((company) => company.quarters.length);
  const latestRows = rows
    .map((company) => ({ company, latest: company.quarters.at(-1) }))
    .filter(({ latest }) => latest);
  const withGrowth = latestRows.filter(({ latest }) => Number.isFinite(latest.opGrowth));
  const avgGrowth = withGrowth.length
    ? withGrowth.reduce((sum, item) => sum + item.latest.opGrowth, 0) / withGrowth.length
    : null;
  const topGrowth = [...withGrowth].sort((a, b) => b.latest.opGrowth - a.latest.opGrowth)[0];
  const withMargin = latestRows.filter(({ latest }) => Number.isFinite(latest.opMargin));
  const topMargin = [...withMargin].sort((a, b) => b.latest.opMargin - a.latest.opMargin)[0];
  memoryEls.summary.innerHTML = `
    <article data-tone="neutral"><span>${mt("비교 회사", "Companies")}</span><strong>${rows.length}</strong><small>${mt("키옥시아를 제외한 공개 분기 데이터 보유 기업입니다.", "Companies with public quarterly data, excluding Kioxia.")}</small></article>
    <article data-tone="${avgGrowth >= 0 ? "positive" : "negative"}"><span>${mt("평균 이익 증가율", "Avg profit growth")}</span><strong>${mPct(avgGrowth)}</strong><small>${mt("최근 결산 분기 영업이익의 전분기 대비 증가율입니다.", "Latest-quarter operating-profit growth versus the prior quarter.")}</small></article>
    <article data-tone="positive"><span>${mt("이익 증가율 1위", "Top profit growth")}</span><strong>${topGrowth ? escapeHtml(topGrowth.company.name) : "N/A"}</strong><small>${topGrowth ? `${mPct(topGrowth.latest.opGrowth)} · ${topGrowth.latest.date}` : mt("데이터 없음", "No data")}</small></article>
    <article data-tone="neutral"><span>${mt("현재 마진 1위", "Top current margin")}</span><strong>${topMargin ? escapeHtml(topMargin.company.name) : "N/A"}</strong><small>${topMargin ? `${mPct(topMargin.latest.opMargin)} · ${topMargin.latest.date}` : mt("데이터 없음", "No data")}</small></article>
  `;
}

function renderMemoryCycle(companies) {
  const dashboard = document.querySelector(".earnings-dashboard");
  const tabList = dashboard?.querySelector(".earnings-chart-tabs");
  if (!dashboard || !tabList) return;
  const rows = companies.map(enrichedCompany).filter((company) => company.quarters.length >= 2);
  const growth = rows.map((company) => company.quarters.at(-1)?.opGrowth).filter(Number.isFinite);
  const latestMargins = rows.map((company) => company.quarters.at(-1)?.opMargin).filter(Number.isFinite);
  const priorMargins = rows.map((company) => company.quarters.at(-2)?.opMargin).filter(Number.isFinite);
  const avgGrowth = growth.length ? averageMemory(growth) : null;
  const marginChange = latestMargins.length && priorMargins.length ? averageMemory(latestMargins) - averageMemory(priorMargins) : null;
  const priceRows = companies.map((company) => Number(company.priceSummary?.return3m)).filter(Number.isFinite);
  const avgPrice = priceRows.length ? averageMemory(priceRows) : null;
  const regime = Number.isFinite(avgGrowth) && avgGrowth > .1 && Number.isFinite(marginChange) && marginChange > 0
    ? mt("실적 확장", "Earnings expansion")
    : Number.isFinite(avgGrowth) && avgGrowth < -.1
      ? mt("실적 둔화", "Earnings contraction")
      : mt("실적 보합", "Earnings mixed");
  const response = Number.isFinite(avgPrice) && avgPrice > .05
    ? mt("주가 선행 강세", "Shares leading higher")
    : Number.isFinite(avgPrice) && avgPrice < -.05
      ? mt("주가 약세 반영", "Shares pricing in weakness")
      : mt("주가 반응 혼재", "Shares mixed");
  const panel = document.querySelector("#mem-cycle") || document.createElement("section");
  panel.id = "mem-cycle";
  panel.className = "memory-cycle-panel";
  panel.innerHTML = `<div class="capex-structure-head"><div><span>L2 · ${mt("업황과 주가의 선후", "Cycle and market response")}</span><h2>${mt("실적 변화와 주가 반영을 분리해 읽기", "Separate earnings change from price response")}</h2><p>${mt("실적은 최근 결산 분기의 영업이익·마진 변화, 주가는 각 기업 최근 3개월 수익률의 단순 평균입니다. 두 지표의 시점이 다르므로 인과관계가 아닌 선후 관계를 점검합니다.", "Earnings use the latest reported operating-profit and margin changes; share prices use a simple average of each company's latest three-month return. Different timing means this is a lead–lag check, not a causal claim.")}</p></div></div><div class="memory-cycle-grid"><article><span>${mt("실적 국면", "Earnings regime")}</span><strong>${regime}</strong><small>${mt("평균 영업이익 QoQ", "Average operating-profit QoQ")} · ${mPct(avgGrowth)}</small></article><article><span>${mt("마진 변화", "Margin change")}</span><strong>${mPp(marginChange)}</strong><small>${mt("최근 분기 평균 대 직전 분기", "Latest average versus prior quarter")}</small></article><article><span>${mt("시장 반응", "Market response")}</span><strong>${response}</strong><small>${mt("평균 3개월 수익률", "Average 3-month return")} · ${mPct(avgPrice)}</small></article></div>`;
  tabList.before(panel);
}

function averageMemory(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function renderMemoryChart(companies) {
  const rows = chartRows(companies);
  if (!memoryEls.chart) return;
  if (!rows.length) {
    memoryEls.chart.innerHTML = `<text x="450" y="180" text-anchor="middle" fill="currentColor">${mt("표시할 데이터가 없습니다.", "No data to display.")}</text>`;
    if (memoryEls.legend) memoryEls.legend.innerHTML = "";
    return;
  }
  const labels = MEMORY_IS_EN ? ["Q-3", "Q-2", "Q-1", "Latest"] : ["3분기 전", "2분기 전", "직전 분기", "최근 분기"];
  const quarterColors = ["#94a3b8", "#60a5fa", "#f59e0b", "#16a34a"];
  const series = rows.map((company) => ({
    company,
    quarters: company.quarters.filter((q) => Number.isFinite(q.opGrowth)).slice(-4),
  }));
  const values = series.flatMap(({ quarters }) => quarters.map((q) => q.opGrowth)).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const padX = 58;
  const padTop = 34;
  const padBottom = 62;
  const width = 900;
  const height = 360;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const y = (value) => padTop + (max - value) / (max - min || 1) * plotH;
  const zeroY = y(0);
  const groupW = plotW / Math.max(1, series.length);
  const barGap = 5;
  const barW = Math.max(7, Math.min(18, (groupW - 36) / labels.length - barGap));

  const mid = min + (max - min) / 2;
  const ticks = [min, 0, mid, max]
    .map((value) => Number(value.toFixed(6)))
    .filter((value, index, arr) => arr.findIndex((item) => Math.abs(item - value) < 0.000001) === index)
    .sort((a, b) => a - b);
  const grid = ticks.map((value) => {
    const isZero = Math.abs(value) < 0.0001;
    return `
      <line x1="${padX}" x2="${width - padX}" y1="${y(value)}" y2="${y(value)}" stroke="rgba(120,120,120,${isZero ? ".35" : ".12"})" stroke-dasharray="${isZero ? "0" : "3 6"}"/>
      <line x1="${padX - 5}" x2="${padX}" y1="${y(value)}" y2="${y(value)}" stroke="rgba(80,80,80,.45)"/>
      <text x="8" y="${y(value) + 4}" fill="currentColor" opacity=".62">${mPct(value)}</text>
    `;
  }).join("");
  const xLabels = series.map(({ company }, cIndex) => {
    const cx = padX + groupW * cIndex + groupW / 2;
    const displayName = company.name === "Samsung Electronics" ? "Samsung" : company.name === "SK Hynix" ? "SK Hynix" : company.name;
    return `<text x="${cx}" y="${height - 20}" text-anchor="middle" fill="currentColor" opacity=".72">${escapeHtml(displayName)}</text>`;
  }).join("");
  const bars = series.map(({ company, quarters }, cIndex) => {
    return labels.map((_, qIndex) => {
      const q = quarters[qIndex];
      if (!q || !Number.isFinite(q.opGrowth)) return "";
      const groupX = padX + groupW * cIndex + (groupW - labels.length * barW - (labels.length - 1) * barGap) / 2;
      const x = groupX + qIndex * (barW + barGap);
      const barY = Math.min(y(q.opGrowth), zeroY);
      const barH = Math.max(2, Math.abs(zeroY - y(q.opGrowth)));
      return `<rect x="${x}" y="${barY}" width="${barW}" height="${barH}" fill="${quarterColors[qIndex]}" opacity="0.9"><title>${escapeHtml(company.name)} ${q.date}: ${mPct(q.opGrowth)}</title></rect>`;
    }).join("");
  }).join("");

  memoryEls.chart.innerHTML = `${grid}<line x1="${padX}" x2="${width - padX}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(0,0,0,.35)"/>${xLabels}${bars}`;
  if (memoryEls.legend) {
    memoryEls.legend.innerHTML = labels.map((label, index) => `<span><i style="background:${quarterColors[index]}"></i>${label}</span>`).join("");
  }
}

function renderMemoryTimeline(companies) {
  if (!memoryEls.timeline) return;
  const rows = chartRows(companies);
  if (!rows.length) {
    memoryEls.timeline.innerHTML = `<p class="empty-note">${mt("표시할 데이터가 없습니다.", "No data to display.")}</p>`;
    return;
  }
  memoryEls.timeline.innerHTML = rows.map((company) => {
    const quarters = company.quarters.filter((q) => Number.isFinite(q.opGrowth)).slice(-4);
    const cells = quarters.map((q) => {
      const tone = q.opGrowth >= 0 ? "positive" : "negative";
      return `<span><b>${q.date.slice(0, 7)}</b><em class="${tone}">${mPct(q.opGrowth)}</em></span>`;
    }).join("");
    return `<article class="memory-timeline-row"><strong>${escapeHtml(company.name)}</strong><div class="memory-quarter-strip">${cells}</div></article>`;
  }).join("");
}

function renderMemoryTable(companies) {
  if (!memoryEls.table) return;
  const rows = memoryCompanies({ companies }).map(enrichedCompany).map((company) => {
    const latest = company.quarters.at(-1);
    if (!latest) {
      return `<tr><td>${escapeHtml(company.name)}<br><small>${escapeHtml(company.symbol)}</small></td><td>${escapeHtml(company.group)}</td><td colspan="5">${mt("공개 분기 손익 데이터 없음", "No public quarterly income data")}</td></tr>`;
    }
    return `<tr>
      <td>${escapeHtml(company.name)}<br><small>${escapeHtml(company.symbol)}</small></td>
      <td>${escapeHtml(company.group)}</td>
      <td>${latest.date}</td>
      <td>${mMoney(latest.quarterlyTotalRevenue, company.currency)}</td>
      <td>${mPct(latest.revenueGrowth)}</td>
      <td>${mMoney(latest.quarterlyOperatingIncome, company.currency)}</td>
      <td>${mPct(latest.opMargin)}</td>
    </tr>`;
  }).join("");
  memoryEls.table.innerHTML = `<thead><tr><th>${mt("회사", "Company")}</th><th>${mt("분류", "Group")}</th><th>${mt("분기", "Quarter")}</th><th>${mt("매출액", "Revenue")}</th><th>${mt("매출 성장률", "Revenue QoQ")}</th><th>${mt("영업이익", "Operating profit")}</th><th>${mt("영업이익률", "Operating margin")}</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderMemorySources(data) {
  if (!memoryEls.sources) return;
  memoryEls.sources.innerHTML = (data.sources || [])
    .map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a><span>${mt("Yahoo Finance 공개 fundamentals time-series를 사용합니다. 종목별 공개 범위와 회계 기준은 다를 수 있습니다.", "Uses Yahoo Finance public fundamentals time-series. Coverage and accounting basis can vary by ticker.")}</span></li>`)
    .join("");
}

function renderMemoryEventMemo(registry) {
  if (!memoryEls.eventMemo) return;
  const events = (registry.events || []).filter((event) => event.active && event.memorySectorImpact?.displayOnF4);
  if (!events.length) {
    memoryEls.eventMemo.hidden = true;
    return;
  }
  memoryEls.eventMemo.innerHTML = events.map((event) => {
    const impact = event.memorySectorImpact || {};
    const points = MEMORY_IS_EN ? impact.pointsEn : impact.pointsKo;
    const sources = (event.sources || []).map((source) => `
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>
    `).join("");
    return `
      <article class="memory-event-card">
        <div class="memory-event-head">
          <div>
            <span class="memory-event-kicker">${mt("업황 이벤트", "Industry event")} · ${escapeHtml(MEMORY_IS_EN ? impact.levelEn : impact.levelKo)}</span>
            <h2>${escapeHtml(MEMORY_IS_EN ? event.companyEn : event.companyKo)}</h2>
            <p>${escapeHtml(MEMORY_IS_EN ? impact.headlineEn : impact.headlineKo)}</p>
          </div>
          <div class="memory-event-amount">
            <span>${mt("예상 조달액", "Expected proceeds")}</span>
            <strong>US$${memoryNumber.format(event.proceedsUsdBillions)}B</strong>
            <small>${escapeHtml(MEMORY_IS_EN ? event.marketEn : event.marketKo)}</small>
          </div>
        </div>
        <div class="memory-event-body">
          <ul>${(points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
          <div class="memory-event-meta">
            <span>${mt("판단", "Read")}: <b>${escapeHtml(MEMORY_IS_EN ? event.noteEn : event.noteKo)}</b></span>
            <span>${mt("확인일", "Checked")}: ${escapeHtml(registry.updatedAt || event.announcedDate || "N/A")}</span>
            <span class="memory-event-sources">${mt("출처", "Sources")}: ${sources || "TODO"}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
  memoryEls.eventMemo.hidden = false;
}

async function loadMemoryEvents() {
  if (!memoryEls.eventMemo) return;
  try {
    const response = await fetch(`/data/global-mega-ipo-events.json?ts=${Date.now()}`, { cache: "no-store" });
    const registry = await response.json().catch(() => null);
    if (!response.ok || !registry) throw new Error("event data unavailable");
    renderMemoryEventMemo(registry);
  } catch (error) {
    memoryEls.eventMemo.hidden = true;
  }
}

function setupMemoryTabs() {
  if (!memoryEls.tabs.length || !memoryEls.panels.length) return;
  memoryEls.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.memoryTab;
      memoryEls.tabs.forEach((tab) => {
        const active = tab.dataset.memoryTab === target;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      memoryEls.panels.forEach((panel) => {
        panel.hidden = panel.dataset.memoryPanel !== target;
      });
    });
  });
}

async function loadMemoryEarnings() {
  setMemoryStatus(mt("메모리 실적 데이터를 불러오는 중입니다.", "Loading memory earnings data."));
  try {
    const [response, stateResponse] = await Promise.all([
      fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`/data/daily-state.json?ts=${Date.now()}`, { cache: "no-store" }),
    ]);
    const data = await response.json().catch(() => null);
    const state = stateResponse.ok ? await stateResponse.json() : null;
    if (!response.ok || !data?.ok) throw new Error(mt("메모리 실적 데이터를 불러오지 못했습니다.", "Could not load memory earnings data."));
    const companies = memoryCompanies(data);
    renderMemorySummary(companies);
    renderMemoryCycle(companies);
    renderMemoryReleaseHighlights(companies);
    renderMemoryChart(companies);
    renderMemoryTimeline(companies);
    renderMemoryTable(companies);
    renderMemorySources(data);
    const updatedAt = new Date(data.generatedAt);
    const readableUpdatedAt = Number.isNaN(updatedAt.getTime())
      ? data.generatedAt
      : new Intl.DateTimeFormat(MEMORY_IS_EN ? "en-US" : "ko-KR", {
        year: "numeric",
        month: MEMORY_IS_EN ? "short" : "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: MEMORY_IS_EN,
        timeZone: "Asia/Seoul",
      }).format(updatedAt);
    const memory = state?.regime?.axes?.find((axis) => axis.id === "memory");
    const label = { expanding: mt("실적 확장", "Earnings expanding"), flat: mt("실적 보합", "Earnings flat"), contracting: mt("실적 둔화", "Earnings contracting") }[memory?.state] || mt("상태 확인 중", "Checking regime");
    setMemoryStatus(mt(`공통 상태: ${label} · 업데이트: ${readableUpdatedAt}`, `Shared regime: ${label} · updated: ${readableUpdatedAt}`), "ok");
  } catch (error) {
    setMemoryStatus(error.message || mt("메모리 실적 데이터를 불러오지 못했습니다.", "Could not load memory earnings data."), "error");
  }
}

setupMemoryTabs();
loadMemoryEarnings();
loadMemoryEvents();
