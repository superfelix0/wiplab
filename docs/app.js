const output = {
  status: document.querySelector("#status"),
  refreshButton: document.querySelector("#refreshButton"),
  adrSymbolLabel: document.querySelector("#adrSymbolLabel"),
  adrPrice: document.querySelector("#adrPrice"),
  adrTime: document.querySelector("#adrTime"),
  kospiPrice: document.querySelector("#kospiPrice"),
  kospiTime: document.querySelector("#kospiTime"),
  fxRate: document.querySelector("#fxRate"),
  fxTime: document.querySelector("#fxTime"),
  convertedPrice: document.querySelector("#convertedPrice"),
  premiumRate: document.querySelector("#premiumRate"),
  premiumLabel: document.querySelector("#premiumLabel"),
  priceGap: document.querySelector("#priceGap"),
  priceChart: document.querySelector("#priceChart"),
  chartEmpty: document.querySelector("#chartEmpty"),
};

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const won = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
});

const chartDate = new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
  month: "short",
  day: "numeric",
});

const chartDateTime = new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function t(ko, en) {
  return IS_EN ? en : ko;
}

async function fetchQuotes() {
  const response = await fetch("/api/quotes", { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || t(`시세 API 오류: HTTP ${response.status}`, `Quote API error: HTTP ${response.status}`));
  }
  return data;
}

function pathFromPoints(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderChart(history) {
  const svg = output.priceChart;
  if (!svg) return;

  if (!Array.isArray(history) || history.length < 2) {
    if (!output.chartEmpty) return;
    output.chartEmpty.textContent = t(
      "ADR 일자별 가격 데이터가 아직 충분하지 않습니다. 2거래일 이상 쌓이면 본주와 함께 그래프로 표시됩니다.",
      "ADR historical price data is not sufficient yet. Once two or more trading days are collected, it will be shown with the common-share price."
    );
    output.chartEmpty.hidden = false;
    return;
  }

  if (output.chartEmpty) output.chartEmpty.hidden = true;
  svg.replaceChildren();

  const width = 900;
  const height = 360;
  const padding = { top: 26, right: 28, bottom: 46, left: 78 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = history.flatMap((point) => [point.adrConverted, point.kospi]);
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const span = max - min || 1;

  const x = (index) => padding.left + (index / (history.length - 1)) * innerWidth;
  const y = (value) => padding.top + innerHeight - ((value - min) / span) * innerHeight;

  const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grid.setAttribute("class", "chart-grid");

  for (let i = 0; i <= 4; i += 1) {
    const lineY = padding.top + (innerHeight / 4) * i;
    const value = max - (span / 4) * i;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padding.left);
    line.setAttribute("x2", width - padding.right);
    line.setAttribute("y1", lineY);
    line.setAttribute("y2", lineY);
    grid.append(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", padding.left - 12);
    label.setAttribute("y", lineY + 4);
    label.setAttribute("text-anchor", "end");
    label.textContent = IS_EN
      ? `${Math.round(value / 1000).toLocaleString("en-US")}K`
      : `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
    grid.append(label);
  }

  svg.append(grid);

  const first = history[0];
  const middle = history[Math.floor(history.length / 2)];
  const last = history.at(-1);
  const useTimeLabels = first.date === last.date;

  [first, middle, last].forEach((point) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "chart-date");
    label.setAttribute("x", x(history.indexOf(point)));
    label.setAttribute("y", height - 14);
    label.setAttribute("text-anchor", point === first ? "start" : point === last ? "end" : "middle");
    label.textContent = useTimeLabels
      ? chartDateTime.format(new Date(point.time))
      : chartDate.format(new Date(`${point.date}T00:00:00Z`));
    svg.append(label);
  });

  const adrPoints = history.map((point, index) => ({ x: x(index), y: y(point.adrConverted) }));
  const kospiPoints = history.map((point, index) => ({ x: x(index), y: y(point.kospi) }));

  [
    ["chart-line chart-line-adr", adrPoints],
    ["chart-line chart-line-kospi", kospiPoints],
  ].forEach(([className, points]) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", className);
    path.setAttribute("d", pathFromPoints(points));
    svg.append(path);
  });
}

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return t("방금", "just now");
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 1) return t("방금", "just now");
  if (minutes < 60) return IS_EN ? `${minutes} min ago` : `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return IS_EN ? `${hours} hr ago` : `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return IS_EN ? `${days} day${days === 1 ? "" : "s"} ago` : `${days}일 전`;
}

function renderQuote(quote, valueEl, timeEl, formatter, suffix = "") {
  valueEl.textContent = `${formatter.format(quote.price)}${suffix}`;
  const time = quote.marketTime ? dateTime.format(new Date(quote.marketTime)) : t("시간 정보 없음", "No time data");
  const freshness = quote.marketTime ? ` · ${formatAge(Date.now() - quote.marketTime)} ${t("기준", "basis")}` : "";
  timeEl.textContent = `${quote.exchange} · ${time}${freshness}`;
}

function buildTimingNotice(quotes) {
  const times = [quotes.adr.marketTime, quotes.kospi.marketTime, quotes.fx.marketTime].filter(Number.isFinite);

  if (times.length < 2) {
    return t("일부 시세의 기준 시각을 확인하지 못했습니다.", "Could not verify the timestamp for some quotes.");
  }

  const spreadMs = Math.max(...times) - Math.min(...times);
  const oldestMs = Date.now() - Math.min(...times);

  if (spreadMs >= 2 * 60 * 60 * 1000) {
    return t(
      `세션 불일치 가능성이 있습니다. 세 가격의 기준 시각 차이가 약 ${formatAge(spreadMs)}입니다.`,
      `Session mismatch is possible. The quote timestamps differ by about ${formatAge(spreadMs)}.`
    );
  }

  if (oldestMs >= 6 * 60 * 60 * 1000) {
    return t(
      `일부 가격이 오래된 값일 수 있습니다. 가장 오래된 기준 시각은 약 ${formatAge(oldestMs)}입니다.`,
      `Some prices may be stale. The oldest timestamp is about ${formatAge(oldestMs)}.`
    );
  }

  return "";
}

function renderResult({ adr, kospi, fx }, result) {
  output.adrSymbolLabel.textContent = `${adr.symbol} ADR`;
  renderQuote(adr, output.adrPrice, output.adrTime, usd);
  renderQuote(kospi, output.kospiPrice, output.kospiTime, won);
  renderQuote(fx, output.fxRate, output.fxTime, number, t("원", " KRW"));

  output.convertedPrice.textContent = won.format(result.converted);
  output.priceGap.textContent = won.format(result.gap);
  output.premiumRate.textContent = percent.format(result.premium);

  let premiumMessage = "";
  if (result.premium > 0.0025) {
    output.premiumRate.dataset.state = "premium";
    premiumMessage = t("ADR 환산 본주가가 코스피보다 높습니다.", "The ADR-implied common-share price is above the KOSPI share price.");
  } else if (result.premium < -0.0025) {
    output.premiumRate.dataset.state = "discount";
    premiumMessage = t("ADR 환산 본주가가 코스피보다 낮습니다.", "The ADR-implied common-share price is below the KOSPI share price.");
  } else {
    output.premiumRate.dataset.state = "neutral";
    premiumMessage = t("두 시장 가격이 거의 비슷한 구간입니다.", "The two market prices are nearly aligned.");
  }

  const timingNotice = buildTimingNotice({ adr, kospi, fx });
  output.premiumLabel.textContent = timingNotice ? `${premiumMessage} ${timingNotice}` : premiumMessage;
}

function setLoading(isLoading) {
  if (!output.refreshButton) return;
  output.refreshButton.disabled = isLoading;
  output.refreshButton.textContent = isLoading ? t("불러오는 중", "Loading") : t("새로고침", "Refresh");
}

function setStatus(message, state = "neutral") {
  output.status.textContent = message;
  output.status.dataset.state = state;
}

async function refreshQuotes() {
  setLoading(true);
  setStatus(t("시세를 불러오는 중입니다.", "Loading quotes."));

  try {
    const data = await fetchQuotes();
    renderResult(data.quotes, data.result);
    renderChart(data.history);
    setStatus(t(
      "시세 반영 완료. 데이터는 거래소·제공사 기준으로 지연될 수 있습니다.",
      "Quotes updated. Data may be delayed depending on the exchange or provider."
    ), "ok");
  } catch (error) {
    setStatus(`${error.message} ${t("잠시 후 다시 새로고침해 주세요.", "Please refresh again shortly.")}`, "error");
  } finally {
    setLoading(false);
  }
}

output.refreshButton?.addEventListener("click", refreshQuotes);
refreshQuotes();
