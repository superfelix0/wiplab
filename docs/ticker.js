(() => {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path !== "" && path !== "/en") {
    document.querySelector(".ticker-strip")?.remove();
    return;
  }

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

  function quoteStatus(item, quoteTime) {
    const state = String(item.marketState || "").toUpperCase();
    const delayed = Number.isFinite(item.delayMinutes) && item.delayMinutes > 0;
    const latency = delayed
      ? (isEn ? `~${item.delayMinutes} min delayed` : `약 ${item.delayMinutes}분 지연`)
      : (isEn ? "free quote · delay not confirmed" : "무료 시세 · 지연시간 미확인");
    const kstParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const kstMinutes = Number(kstParts.hour) * 60 + Number(kstParts.minute);
    const koreaRegular = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(kstParts.weekday) && kstMinutes >= 540 && kstMinutes < 930;
    if (item.id === "kospi" && (!koreaRegular || state === "CLOSED")) {
      return isEn ? `Korea market closed · ${quoteTime} KST close` : `한국 장마감 · ${quoteTime} KST 종가`;
    }
    if (state === "CLOSED") return isEn ? `Market closed · ${quoteTime} KST close` : `장마감 · ${quoteTime} KST 종가`;
    if (state === "PRE" || state === "POST") return isEn ? `Extended hours · ${latency}` : `시간외 · ${latency}`;
    if (state === "REGULAR") return isEn ? `Market open · ${latency}` : `장중 · ${latency}`;
    return isEn ? `As of ${quoteTime} KST · ${latency}` : `${quoteTime} KST 기준 · ${latency}`;
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
        const quoteTime = item.marketTime ? timeFormat.format(new Date(item.marketTime)) : (isEn ? "time unavailable" : "시간 미확인");
        const status = quoteStatus(item, quoteTime);
        element.innerHTML = `<span class="ticker-price">${tickerNumber.format(item.close)}${changeText ? ` <em class="${changeClass}">${changeText}</em>` : ""}</span><small class="ticker-status">${status}</small>`;
        element.closest("span").title = `${item.label} · ${status} · ${data.provider || "Yahoo Finance"}`;
      });
    } catch {
      // Keep the last displayed quote if a refresh temporarily fails.
    }
  }

  loadMarketTicker();
  window.setInterval(loadMarketTicker, 60_000);
})();
