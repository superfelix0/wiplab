(() => {
  const tickerEls = {
    kospi: document.querySelector("#tickerKospi"),
    nasdaq: document.querySelector("#tickerNasdaq"),
    sp500: document.querySelector("#tickerSp500"),
    usdk: document.querySelector("#tickerUsdKrw"),
  };

  if (!Object.values(tickerEls).some(Boolean)) return;

  const isEn = document.documentElement.lang?.toLowerCase().startsWith("en");
  const tickerNumber = new Intl.NumberFormat(isEn ? "en-US" : "ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const timeFormat = new Intl.DateTimeFormat(isEn ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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

        const quoteTime = item.marketTime ? timeFormat.format(new Date(item.marketTime)) : (isEn ? "time unavailable" : "시각 미확인");
        const delay = Number.isFinite(item.delayMinutes) && item.delayMinutes > 0
          ? (isEn ? ` · about ${item.delayMinutes} min delayed` : ` · 약 ${item.delayMinutes}분 지연`)
          : (isEn ? " · free delayed quote" : " · 무료 지연 시세");
        element.closest("span").title = `${item.label} · ${quoteTime} KST${delay} · ${data.provider || "Yahoo Finance"}`;
      });
    } catch {
      // Keep the last displayed quote if a refresh temporarily fails.
    }
  }

  loadMarketTicker();
  window.setInterval(loadMarketTicker, 60_000);
})();
