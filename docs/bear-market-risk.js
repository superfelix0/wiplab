(() => {
const bearEls = {
  status: document.querySelector("#bearStatus"),
  score: document.querySelector("#bearScore"),
  stage: document.querySelector("#bearStage"),
  weekChange: document.querySelector("#bearWeekChange"),
  updated: document.querySelector("#bearUpdated"),
  summary: document.querySelector("#bearSummary"),
  cards: document.querySelector("#bearCards"),
  details: document.querySelector("#bearDetails"),
  chart: document.querySelector("#bearChart"),
  historyTable: document.querySelector("#bearHistoryTable"),
  methodology: document.querySelector("#bearMethodology"),
  sources: document.querySelector("#bearSources"),
  disclaimer: document.querySelector("#bearDisclaimer"),
};

const BEAR_IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const bearNumber = new Intl.NumberFormat(BEAR_IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });

function bt(ko, en) {
  return BEAR_IS_EN ? en : ko;
}

function bText(value) {
  if (!value || typeof value !== "object") return String(value ?? "");
  return BEAR_IS_EN ? value.en ?? value.ko ?? "" : value.ko ?? value.en ?? "";
}

function escapeBear(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreText(value) {
  return Number.isFinite(value) ? bearNumber.format(value) : "N/A";
}

function stageFor(score, scale) {
  return (scale || []).find((item) => score >= item.min && score <= item.max) || { labelKo: "확인 필요", labelEn: "Needs data", tone: "neutral" };
}

function setBearStatus(message, state = "neutral") {
  if (!bearEls.status) return;
  bearEls.status.textContent = message;
  bearEls.status.dataset.state = state;
}

function renderSummary(data, dailyState = null) {
  const dailyRisk = dailyState?.regime?.axes?.find((axis) => axis.id === "risk");
  const total = Number.isFinite(Number(dailyRisk?.value)) ? Number(dailyRisk.value) : Number(data?.summary?.totalScore);
  const previous = Number(data?.summary?.previousScore);
  const delta = Number.isFinite(total) && Number.isFinite(previous) ? total - previous : null;
  const dailyLabels = { normal: ["정상", "Normal"], watch: ["관찰", "Watch"], caution: ["주의", "Caution"], alert: ["경계", "Alert"], danger: ["위험", "Risk"] };
  const stage = dailyRisk ? { labelKo: dailyLabels[dailyRisk.state]?.[0] || "확인 필요", labelEn: dailyLabels[dailyRisk.state]?.[1] || "Needs data", tone: dailyRisk.state } : stageFor(total, data.scoreScale);
  bearEls.score.textContent = `${scoreText(total)} / 10`;
  bearEls.stage.textContent = BEAR_IS_EN ? stage.labelEn : stage.labelKo;
  bearEls.stage.dataset.tone = stage.tone;
  bearEls.weekChange.textContent = Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${scoreText(delta)} ${bt("점", "pts")}` : "N/A";
  bearEls.updated.textContent = dailyState?.meta?.basisDate || data.lastUpdated || data.generatedAt || "N/A";
  bearEls.summary.textContent = bText(data.summary?.interpretation);
}

function renderCards(data) {
  bearEls.cards.innerHTML = (data.indicators || []).map((item) => `
    <article data-tone="${scoreTone(item.score)}">
      <div class="risk-card-head"><span>${escapeBear(item.id)}</span><strong>${scoreText(item.score)} / 2</strong></div>
      <h3>${escapeBear(BEAR_IS_EN ? item.titleEn : item.titleKo)}</h3>
      <b class="risk-state">${escapeBear(BEAR_IS_EN ? item.statusEn : item.statusKo)}</b>
      <p>${escapeBear(BEAR_IS_EN ? item.observationEn : item.observationKo)}</p>
      <small>${escapeBear(BEAR_IS_EN ? item.recentChangeEn : item.recentChangeKo)}</small>
      <a href="${escapeBear(item.anchor)}">${bt("상세 보기", "View detail")}</a>
    </article>
  `).join("");
}

function scoreTone(score) {
  if (score >= 1.5) return "negative";
  if (score >= 1) return "caution";
  if (score >= 0.5) return "neutral";
  return "positive";
}

function sourceList(sources = []) {
  if (!sources.length) return `<li>${bt("TODO: 실제 데이터 출처 연결 전입니다.", "TODO: Live data source not connected yet.")}</li>`;
  return sources.map((source) => `
    <li>
      <strong>${escapeBear(source.name || "TODO")}</strong>
      <span>${escapeBear(source.type || source.institution || "TODO")} · ${escapeBear(source.checkedAt || "TODO")}</span>
      ${source.url ? `<a href="${escapeBear(source.url)}" target="_blank" rel="noopener noreferrer">${escapeBear(source.url)}</a>` : ""}
      ${source.note ? `<small>${escapeBear(source.note)}</small>` : ""}
    </li>
  `).join("");
}

function renderDetails(data) {
  bearEls.details.innerHTML = (data.indicators || []).map((item) => `
    <section class="risk-detail" id="${escapeBear(item.id)}" tabindex="-1">
      <div class="section-title">
        <div>
          <p class="eyebrow">${escapeBear(item.id)}</p>
          <h2>${escapeBear(BEAR_IS_EN ? item.titleEn : item.titleKo)}</h2>
        </div>
        <strong class="risk-detail-score">${scoreText(item.score)} / 2 · ${escapeBear(BEAR_IS_EN ? item.statusEn : item.statusKo)}</strong>
      </div>
      <div class="risk-detail-grid">
        <article><span>${bt("현재 판단", "Current read")}</span><p>${escapeBear(BEAR_IS_EN ? item.judgmentEn : item.judgmentKo)}</p></article>
        <article><span>${bt("확인 데이터", "Data to check")}</span><p>${escapeBear(BEAR_IS_EN ? item.dataEn : item.dataKo)}</p></article>
        <article><span>${bt("위험 신호 기준", "Risk criteria")}</span><p>${escapeBear(BEAR_IS_EN ? item.criteriaEn : item.criteriaKo)}</p></article>
        <article><span>${bt("이번 업데이트 해석", "Latest interpretation")}</span><p>${escapeBear(BEAR_IS_EN ? item.interpretationEn : item.interpretationKo)}</p></article>
      </div>
      <div class="risk-subgrid">
        <div><h3>${bt("데이터 출처", "Data sources")}</h3><ul>${sourceList(item.sources)}</ul></div>
        <div><h3>${bt("최근 변경 이력", "Recent changes")}</h3><ul>${(BEAR_IS_EN ? item.historyEn || [] : item.historyKo || []).map((entry) => `<li>${escapeBear(entry)}</li>`).join("")}</ul></div>
      </div>
    </section>
  `).join("");
}

function renderChart(data) {
  const history = (data.history || []).slice(-12);
  if (!history.length) return;
  const width = 900;
  const height = 280;
  const padX = 52;
  const padY = 30;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const x = (index) => padX + (index / Math.max(1, history.length - 1)) * plotW;
  const y = (value) => padY + (10 - value) / 10 * plotH;
  const points = history.map((row, index) => `${x(index)},${y(row.totalScore)}`).join(" ");
  const grid = [0, 2, 4, 6, 8, 10].map((value) => `
    <line x1="${padX}" x2="${width - padX}" y1="${y(value)}" y2="${y(value)}" stroke="rgba(120,120,120,.16)" stroke-dasharray="3 6"/>
    <text x="12" y="${y(value) + 4}" fill="currentColor" opacity=".62">${value}</text>
  `).join("");
  const dots = history.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.totalScore)}" r="4" fill="#a97015"><title>${row.date}: ${scoreText(row.totalScore)}</title></circle>`).join("");
  const labels = history.map((row, index) => index % 2 === 0 || index === history.length - 1 ? `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" fill="currentColor" opacity=".62">${row.date.slice(5)}</text>` : "").join("");
  bearEls.chart.innerHTML = `${grid}<polyline points="${points}" fill="none" stroke="#23784a" stroke-width="2.5"/>${dots}${labels}`;
  bearEls.historyTable.innerHTML = `
    <thead><tr><th>${bt("날짜", "Date")}</th><th>${bt("총점", "Score")}</th><th>${bt("변경 내역", "Changes")}</th></tr></thead>
    <tbody>${history.slice().reverse().map((row) => `<tr><td>${row.date}</td><td>${scoreText(row.totalScore)} / 10</td><td>${escapeBear((BEAR_IS_EN ? row.changesEn || [] : row.changesKo || []).join(" · "))}</td></tr>`).join("")}</tbody>
  `;
}

function renderMethodology(data) {
  const framework = data.sourceFramework || {};
  const video = framework.video || {};
  bearEls.methodology.innerHTML = `
    <p>${bt("본 대시보드는 신영증권 김효진 박사가 제시한 약세장 전환 신호 프레임워크를 참고해 제작되었습니다.", "This dashboard was built with reference to the bear-market transition signal framework discussed by Dr. Hyojin Kim of Shinyoung Securities.")}</p>
    <p>${bt("시장 폭, 주도주 경쟁력, 전방 수요, IPO, EPS 전망을 활용한 세부 지표 구성, 점수 체계, 업데이트 기준과 해석은 운영자가 독자적으로 설계했습니다.", "The detailed indicators, scoring system, update rules, and interpretation using market breadth, leadership quality, end demand, IPO activity, and EPS forecasts were independently designed by the site operator.")}</p>
    <dl class="risk-video-meta">
      <div><dt>${bt("원본 영상 제목", "Original video title")}</dt><dd>${escapeBear(video.title || "TODO")}</dd></div>
      <div><dt>${bt("채널명", "Channel")}</dt><dd>${escapeBear(video.channel || "TODO")}</dd></div>
      <div><dt>${bt("게시일", "Published date")}</dt><dd>${escapeBear(video.publishedDate || "TODO")}</dd></div>
      <div><dt>URL</dt><dd>${video.url && video.url !== "TODO" ? `<a href="${escapeBear(video.url)}" target="_blank" rel="noopener noreferrer">${escapeBear(video.url)}</a>` : "TODO"}</dd></div>
      <div><dt>${bt("보조 확인 링크", "Cross-check link")}</dt><dd>${video.podcastUrl ? `<a href="${escapeBear(video.podcastUrl)}" target="_blank" rel="noopener noreferrer">Apple Podcasts</a>` : "TODO"}</dd></div>
    </dl>
    <h3>${bt("확인된 타임스탬프 후보", "Verified timestamp candidates")}</h3>
    <ul>${(framework.timestampCandidates || []).map((item) => `<li>${escapeBear(BEAR_IS_EN ? item.labelEn : item.labelKo)} · ${escapeBear(item.time)}</li>`).join("")}</ul>
  `;
}

function renderSourceRegistry(data) {
  const registry = data.sourceRegistry || {};
  bearEls.sources.innerHTML = `
    <p>${escapeBear(BEAR_IS_EN ? registry.noteEn : registry.noteKo)}</p>
    <ul>${(registry.examples || []).map((item) => `<li>${escapeBear(item)}</li>`).join("")}</ul>
  `;
}

async function loadBearRisk() {
  setBearStatus(bt("약세장 위험 데이터를 불러오는 중입니다.", "Loading bear-market risk data."));
  try {
    const [response, dailyResponse] = await Promise.all([
      fetch(`/data/bear-market-risk.json?ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`/data/daily-state.json?ts=${Date.now()}`, { cache: "no-store" }),
    ]);
    const data = await response.json();
    const dailyState = dailyResponse.ok ? await dailyResponse.json() : null;
    if (!response.ok || !data?.ok) throw new Error(bt("약세장 위험 데이터를 불러오지 못했습니다.", "Could not load bear-market risk data."));
    renderSummary(data, dailyState);
    renderCards(data);
    renderDetails(data);
    renderChart(data);
    renderMethodology(data);
    renderSourceRegistry(data);
    bearEls.disclaimer.textContent = BEAR_IS_EN ? data.disclaimer?.en : data.disclaimer?.ko;
    setBearStatus(data.sample ? bText({ ko: data.operatorNote?.ko, en: data.operatorNote?.en }) : bt("데이터 불러오기 성공", "Data loaded"), data.sample ? "neutral" : "ok");
  } catch (error) {
    setBearStatus(error.message || bt("약세장 위험 데이터를 불러오지 못했습니다.", "Could not load bear-market risk data."), "error");
  }
}

loadBearRisk();
})();
