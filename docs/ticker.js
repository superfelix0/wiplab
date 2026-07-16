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

  async function loadMarketTicker() {
    try {
      const response = await fetch(`/api/market-ticker?ts=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;

      data.items.forEach((item) => {
        const element = tickerEls[item.id];
        if (!element) return;
        element.textContent = tickerNumber.format(item.close);
        element.closest("span").title = `${item.label} 최근 종가 기준일: ${item.date}`;
      });
    } catch {
      // Keep placeholders if the ticker endpoint is temporarily unavailable.
    }
  }

  loadMarketTicker();
})();
