(() => {
  const root = document.querySelector("[data-market-flow]");
  if (!root) return;
  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  const money = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}${en ? "T KRW" : "조원"}`;
  const keys = [
    ["foreignSpot", t("외국인", "Foreign")],
    ["individualSpot", t("개인", "Individuals")],
    ["institutionSpot", t("기관", "Institutions")],
  ];
  const calculate = (rows) => {
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1), previous = sorted.at(-2);
    const week = sorted.slice(-5), prevWeek = sorted.slice(-10, -5);
    return { sorted, latest, previous, week, prevWeek };
  };
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const read = ({ latest, previous, week, prevWeek }) => {
    const cards = keys.map(([key, label]) => {
      const day = Number(latest?.[key] || 0), dayChange = day - Number(previous?.[key] || 0);
      const weekTotal = sum(week, key), weekChange = weekTotal - sum(prevWeek, key);
      return `<article><span>${label}</span><strong>${money(day)}</strong><small>${t("전일 대비", "vs prior day")} ${money(dayChange)} · ${t("5일 누적", "5-day total")} ${money(weekTotal)}</small><small>${t("직전 5일 대비", "vs prior 5 sessions")} ${money(weekChange)}</small></article>`;
    }).join("");
    root.querySelector("[data-flow-cards]").innerHTML = cards;
    const foreign = sum(week, "foreignSpot"), institution = sum(week, "institutionSpot"), individual = sum(week, "individualSpot");
    const note = foreign > 0 && institution > 0
      ? t("외국인과 기관이 함께 순매수해 단기 수급은 우호적입니다. 개인은 반대 방향인지 함께 확인하세요.", "Foreign and institutions are both net buyers, making short-term flow constructive. Check whether individuals are taking the other side.")
      : foreign < 0 && institution < 0
        ? t("외국인과 기관이 함께 순매도해 단기 수급은 보수적으로 볼 구간입니다.", "Foreign and institutions are both net sellers, calling for a cautious short-term flow read.")
        : t("주체별 방향이 엇갈립니다. 외국인 한 주체보다 기관·개인까지 함께 보며 지속성을 확인하세요.", "Investor groups are diverging. Check persistence across institutions and individuals rather than relying on foreign flow alone.");
    root.querySelector("[data-flow-note]").textContent = note;
    root.querySelector("[data-flow-date]").textContent = latest?.date || "--";
    root.querySelector("[data-flow-table]").innerHTML = `<thead><tr><th>${t("날짜", "Date")}</th><th>${t("외국인 현물", "Foreign spot")}</th><th>${t("개인", "Individuals")}</th><th>${t("기관", "Institutions")}</th><th>${t("외국인 선물", "Foreign futures")}</th></tr></thead><tbody>${sorted.slice(-10).reverse().map((row) => `<tr><td>${row.date}</td><td>${money(Number(row.foreignSpot || 0))}</td><td>${money(Number(row.individualSpot || 0))}</td><td>${money(Number(row.institutionSpot || 0))}</td><td>${money(Number(row.foreignFutures || 0))}</td></tr>`).join("")}</tbody>`;
  };
  fetch(`/data/foreign-flow-pulse.json?ts=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((data) => {
    if (!data?.ok || !Array.isArray(data.rows)) throw new Error("unavailable");
    read(calculate(data.rows)); root.querySelector("[data-flow-status]").textContent = t("KRX 자동 수집 데이터", "Automatic KRX data");
  }).catch(() => { root.querySelector("[data-flow-status]").textContent = t("수급 데이터를 불러오지 못했습니다.", "Could not load flow data."); });
})();
