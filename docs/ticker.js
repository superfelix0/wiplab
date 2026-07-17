(() => {
  const tickerEls = {
    kospi: document.querySelector("#tickerKospi"),
    nasdaq: document.querySelector("#tickerNasdaq"),
    sp500: document.querySelector("#tickerSp500"),
    usdk: document.querySelector("#tickerUsdKrw"),
  };

  if (!Object.values(tickerEls).some(Boolean)) return;

  const tickerNumber = new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function formatChangePct(value) {
    if (!Number.isFinite(value)) return "";
    return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
  }

  async function loadMarketTicker() {
    try {
      const response = await fetch(`/api/market-ticker?ts=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;

      data.items.forEach((item) => {
        const element = tickerEls[item.id];
        if (!element) return;

        const changeText = formatChangePct(item.changePct);
        const changeClass = item.changePct > 0 ? "positive" : item.changePct < 0 ? "negative" : "neutral";
        element.innerHTML = `${tickerNumber.format(item.close)}${changeText ? ` <em class="${changeClass}">${changeText}</em>` : ""}`;
        element.closest("span").title = `${item.label} 최근 종가 기준일: ${item.date}${item.previousDate ? ` · 직전 기준일: ${item.previousDate}` : ""}`;
      });
    } catch {
      // Keep placeholders if the ticker endpoint is temporarily unavailable.
    }
  }

  loadMarketTicker();
})();
