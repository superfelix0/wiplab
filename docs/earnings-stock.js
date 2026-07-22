(() => {
  const panel = document.querySelector("[data-stock-group]");
  if (!panel) return;

  const isEn = document.documentElement.lang?.toLowerCase().startsWith("en");
  const group = panel.dataset.stockGroup;
  const status = panel.querySelector("[data-stock-status]");
  const comment = panel.querySelector("[data-stock-comment]");
  const chart = panel.querySelector("[data-stock-chart]");
  const legend = panel.querySelector("[data-stock-legend]");
  const table = panel.querySelector("[data-stock-table]");
  const colors = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f", "#9333ea", "#0f766e", "#a16207"];
  const number = new Intl.NumberFormat(isEn ? "en-US" : "ko-KR", { maximumFractionDigits: 2 });
  const t = (ko, en) => isEn ? en : ko;
  const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%` : "N/A";
  const money = (value, currency) => Number.isFinite(value) ? `${number.format(value)} ${currency || ""}`.trim() : "N/A";
  const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

  function relevantCompanies(data) {
    return (data.companies || []).filter((company) => {
      if (group === "all") return true;
      if (group === "hyperscalers") return company.group === "Hyperscaler";
      return company.group !== "Hyperscaler" && (group === "memory-all" || company.id !== "kioxia");
    }).filter((company) => company.priceHistory?.length >= 2);
  }

  function groupSignal(data) {
    return data.stockSignals?.[group === "memory-all" ? "memoryAll" : group] || {};
  }

  function renderComment(data) {
    const signal = groupSignal(data);
    const label = isEn ? signal.labelEn : signal.labelKo;
    const average = signal.averageReturn3m;
    const count = signal.positiveCount;
    const total = signal.total;
    const marketMeaning = group === "hyperscalers"
      ? t("AI 투자와 반도체 수요 기대가 한국 기술주에 주는 간접 신호", "an indirect signal for Korean technology stocks through AI investment and semiconductor-demand expectations")
      : group === "all"
        ? t("AI 투자와 메모리 업황 기대를 함께 반영하는 한국 기술주 보조 신호", "a supporting signal for Korean technology equities through AI investment and the memory cycle")
        : t("메모리 업황과 한국 반도체 주가에 주는 직접 신호", "a direct signal for the memory cycle and Korean semiconductor equities");
    comment.textContent = Number.isFinite(average)
      ? t(`최근 3개월 평균 수익률 ${pct(average)}, 상승 종목 ${count}/${total}개로 ${label}입니다. 이는 ${marketMeaning}로 해석합니다.`, `The average three-month return is ${pct(average)} with ${count}/${total} stocks up, a ${label.toLowerCase()} read. We interpret this as ${marketMeaning}.`)
      : t("주가 이력이 쌓이면 국내 시장에 대한 시사점을 함께 계산합니다.", "The Korea-market implication will be calculated once sufficient price history is available.");
    panel.dataset.tone = signal.status || "neutral";
  }

  function renderChart(companies) {
    const series = companies.map((company, index) => {
      const history = company.priceHistory.slice(-64);
      const base = history[0]?.close;
      return { company, color: colors[index % colors.length], points: history.map((point) => ({ ...point, index: (point.close / base) * 100 })) };
    }).filter((item) => Number.isFinite(item.points[0]?.index));
    if (!series.length) return;
    const all = series.flatMap((item) => item.points.map((point) => point.index));
    const min = Math.min(95, ...all) - 3;
    const max = Math.max(105, ...all) + 3;
    const width = 900; const height = 330; const left = 52; const right = 22; const top = 20; const bottom = 42;
    const plotW = width - left - right; const plotH = height - top - bottom;
    const x = (index, length) => left + index / Math.max(1, length - 1) * plotW;
    const y = (value) => top + (max - value) / (max - min || 1) * plotH;
    const ticks = [min, (min + max) / 2, max].map((value) => Math.round(value));
    const grid = ticks.map((value) => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 9}" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join("");
    const baseLine = `<line class="stock-base-line" x1="${left}" x2="${width - right}" y1="${y(100)}" y2="${y(100)}"/>`;
    const lines = series.map((item) => `<path d="${item.points.map((point, index) => `${index ? "L" : "M"}${x(index, item.points.length).toFixed(1)} ${y(point.index).toFixed(1)}`).join(" ")}" stroke="${item.color}"/>`).join("");
    const reference = series[0].points;
    const labels = [0, Math.floor(reference.length / 2), reference.length - 1].map((index) => `<text x="${x(index, reference.length)}" y="${height - 13}" text-anchor="middle">${reference[index]?.date?.slice(5)}</text>`).join("");
    chart.innerHTML = `<g class="stock-chart-grid">${grid}</g>${baseLine}<g class="stock-chart-lines">${lines}</g>${labels}`;
    legend.innerHTML = series.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.company.name)}</span>`).join("");
  }

  function renderTable(companies) {
    const rows = companies.map((company) => {
      const summary = company.priceSummary || {};
      return `<tr><td>${escapeHtml(company.name)}<br><small>${escapeHtml(company.symbol)}</small></td><td>${summary.latestDate || "N/A"}</td><td>${money(summary.latestClose, company.currency)}</td><td>${pct(summary.return1m)}</td><td>${pct(summary.return3m)}</td><td>${pct(summary.return6m)}</td></tr>`;
    }).join("");
    table.innerHTML = `<thead><tr><th>${t("회사", "Company")}</th><th>${t("기준일", "As of")}</th><th>${t("종가", "Close")}</th><th>1M</th><th>3M</th><th>6M</th></tr></thead><tbody>${rows}</tbody>`;
  }

  async function load() {
    try {
      const response = await fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error("data unavailable");
      const companies = relevantCompanies(data);
      if (!companies.length) throw new Error("no history");
      renderComment(data); renderChart(companies); renderTable(companies);
      status.textContent = t("일별 종가 기준 · 시작점=100으로 환산", "Daily closes · rebased to 100 at the start");
      status.dataset.state = "ok";
    } catch {
      status.textContent = t("주가 흐름 데이터를 불러오지 못했습니다.", "Could not load share-price history.");
      status.dataset.state = "error";
    }
  }
  load();
})();
