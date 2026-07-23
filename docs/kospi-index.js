(() => {
  const chart = document.querySelector("#kospiTrendChart");
  const status = document.querySelector("#kospiTrendStatus");
  if (!chart || !status) return;
  chart.closest(".price-trend-panel")?.setAttribute("id", "kospi-index");
  const en = document.documentElement.lang.startsWith("en");
  const say = (ko, english) => en ? english : ko;

  const render = (rows) => {
    const points = rows.slice(-252);
    const values = points.map((row) => row.close).filter(Number.isFinite);
    if (values.length < 2) throw new Error("history unavailable");
    const width = 900, height = 300, left = 52, right = 48, top = 20, bottom = 38;
    const min = Math.floor(Math.min(...values) / 100) * 100;
    const max = Math.ceil(Math.max(...values) / 100) * 100;
    const x = (i) => left + (i / (points.length - 1)) * (width - left - right);
    const y = (value) => top + ((max - value) / Math.max(1, max - min)) * (height - top - bottom);
    const ticks = [min, (min + max) / 2, max];
    const grid = ticks.map((value) => `<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 8}" y="${y(value)+4}" text-anchor="end">${Math.round(value).toLocaleString()}</text>`).join("");
    const path = points.map((row, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(row.close).toFixed(1)}`).join(" ");
    const labels = [0, Math.floor(points.length / 2), points.length - 1].map((i) => {
      const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
      return `<text x="${x(i)}" y="${height-12}" text-anchor="${anchor}">${points[i].date.slice(2).replaceAll("-", ".")}</text>`;
    }).join("");
    chart.innerHTML = `<g class="stock-chart-grid">${grid}</g><path class="kospi-index-line" d="${path}"/>${labels}`;
    const first = points[0].close, last = points.at(-1).close, change = (last / first - 1) * 100;
    status.textContent = say(`최근 ${points.length}거래일 · ${last.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} (${change >= 0 ? "+" : ""}${change.toFixed(1)}%)`, `Last ${points.length} sessions · ${last.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${change >= 0 ? "+" : ""}${change.toFixed(1)}%)`);
    status.dataset.state = "ok";
  };

  fetch(`/data/kospi-sentiment.csv?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => { if (!response.ok) throw new Error("load failed"); return response.text(); })
    .then((text) => text.trim().split(/\r?\n/).slice(1).map((line) => { const [date, close] = line.split(","); return { date, close: Number(close) }; }).filter((row) => row.date && Number.isFinite(row.close)))
    .then(render)
    .catch(() => { status.textContent = say("KOSPI 지수 이력을 불러오지 못했습니다.", "Could not load KOSPI index history."); status.dataset.state = "error"; });
})();
