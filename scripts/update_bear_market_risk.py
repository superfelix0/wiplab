from __future__ import annotations

import csv
import io
import json
import math
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
import xml.etree.ElementTree as ET


KST = timezone(timedelta(hours=9))
OUT = Path("docs/data/bear-market-risk.json")
SENTIMENT_CSV = Path("docs/data/kospi-sentiment.csv")
SENTIMENT_META = Path("docs/data/kospi-sentiment-meta.json")
LIQUIDITY_JSON = Path("docs/data/us-liquidity.json")
EARNINGS_JSON = Path("docs/data/ai-earnings.json")
MARKET_PER_JSON = Path("docs/data/market-per.json")
FORWARD_PER_CSV = Path("docs/data/kospi-forward-per-history.csv")
GLOBAL_MEGA_IPO_JSON = Path("docs/data/global-mega-ipo-events.json")
SEC_IPO_XLSX_URL = "https://www.sec.gov/files/sec-stats-ipos-20260630.xlsx"
SEC_IPO_PAGE_URL = "https://www.sec.gov/data-research/statistics-data-visualizations/initial-public-offerings-ipos"

SOURCE_FRAMEWORK = {
    "nameKo": "신영증권 김효진 박사 약세장 전환 신호 프레임워크",
    "nameEn": "Bear-market transition signal framework discussed by Dr. Hyojin Kim of Shinyoung Securities",
    "video": {
        "title": "약세장 시작됐나?...증시 꺽일때 반드시 나오는 4가지 신호? with. 김효진 신영증권 박사｜윤지호의 경제쇼｜KBS 260710 방송",
        "channel": "윤지호의 경제쇼 / [KBS] 경제쇼",
        "publishedDate": "2026-07-10 broadcast; Apple Podcasts lists 2026-07-11 04:30 UTC publication",
        "url": "https://youtu.be/26QbzzM07EM",
        "podcastUrl": "https://podcasts.apple.com/kr/podcast/7-10-%EA%B8%88-%EC%9C%A4%EC%A7%80%ED%98%B8%EC%9D%98-pick-%EC%95%BD%EC%84%B8%EC%9E%A5-%EC%8B%9C%EC%9E%91%EB%90%90%EB%82%98-%EC%A6%9D%EC%8B%9C-%EA%BA%BD%EC%9D%BC%EB%95%8C-%EB%B0%98%EB%93%9C%EC%8B%9C-%EB%82%98%EC%98%A4%EB%8A%94-4%EA%B0%80%EC%A7%80-%EC%8B%A0%ED%98%B8/id1494088134?i=1000776345059",
        "noteKo": "YouTube URL과 미리보기 제목은 Blind 게시글에 노출된 링크 정보를 기준으로 확인했습니다. Apple Podcasts의 동일 에피소드 목록에서 프로그램명과 발행 정보를 보조 확인했습니다.",
        "noteEn": "The YouTube URL and preview title were verified from the link preview shown in a Blind post. The program and publication information were cross-checked with the matching Apple Podcasts episode listing.",
    },
    "timestampCandidates": [
        {"labelKo": "주변부 붕괴", "labelEn": "Peripheral weakness", "time": "29:12"},
        {"labelKo": "주도주 역전/이익 훼손", "labelEn": "Leadership reversal / earnings damage", "time": "21:15"},
        {"labelKo": "전방 수요 피크아웃", "labelEn": "End-demand peak-out", "time": "22:30"},
        {"labelKo": "초대형 IPO 질적 악화", "labelEn": "Quality deterioration in mega IPOs", "time": "32:45"},
        {"labelKo": "초대형 IPO 관련 설명", "labelEn": "Mega IPO related discussion", "time": "36:52"},
    ],
}

DISCLAIMER = {
    "ko": "본 페이지는 정보 제공 목적의 실험적 리서치 도구입니다. 특정 금융상품의 매수·매도 권유가 아니며, 운영자의 판단과 가정이 포함됩니다. 미래 수익이나 손실 회피를 보장하지 않습니다.",
    "en": "This page is an experimental research tool for informational purposes only. It is not a recommendation to buy or sell any financial product, includes operator judgment and assumptions, and does not guarantee future returns or loss avoidance.",
}


def now_kst() -> datetime:
    return datetime.now(tz=KST)


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def finite(value) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value)


def clamp(value: float, low: float = 0.0, high: float = 2.0) -> float:
    return max(low, min(high, value))


def pct(value: float | None) -> str:
    if not finite(value):
        return "N/A"
    return f"{value * 100:+.1f}%"


def money_b(value: float | None) -> str:
    if not finite(value):
        return "N/A"
    return f"{value:+.1f}B USD"


def qoq(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    try:
        return (float(current) - float(previous)) / abs(float(previous))
    except (TypeError, ValueError):
        return None


def to_float(value) -> float | None:
    try:
        result = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def parse_sentiment_rows() -> list[dict]:
    if not SENTIMENT_CSV.exists():
        return []
    rows = []
    with SENTIMENT_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            date = row.get("date")
            close = to_float(row.get("close"))
            indiv = to_float(row.get("indiv_krw"))
            if date and close is not None and indiv is not None:
                rows.append({"date": date, "close": close, "indivKrw": indiv})
    return rows


def week_key(date_text: str) -> str:
    date = datetime.fromisoformat(f"{date_text}T00:00:00+09:00")
    day = date.weekday()
    date += timedelta(days=(4 - day))
    return date.date().isoformat()


def weekly_sentiment_points(rows: list[dict]) -> list[dict]:
    if len(rows) < 10:
        return []
    rows = sorted(rows, key=lambda item: item["date"])
    weeks: dict[str, dict] = {}
    for row in rows:
        key = week_key(row["date"])
        week = weeks.setdefault(key, {"key": key, "date": row["date"], "close": row["close"], "indivKrw": 0.0})
        week["date"] = row["date"]
        week["close"] = row["close"]
        week["indivKrw"] += row["indivKrw"]
    grouped = sorted(weeks.values(), key=lambda item: item["key"])
    points = []
    for index in range(1, len(grouped)):
        prev = grouped[index - 1]
        cur = grouped[index]
        points.append(
            {
                "date": cur["date"],
                "retPct": (cur["close"] / prev["close"] - 1) * 100,
                "indivT": cur["indivKrw"] / 1e12,
            }
        )
    return points


def regression(points: list[dict]) -> dict | None:
    if len(points) < 8:
        return None
    mean_x = sum(p["retPct"] for p in points) / len(points)
    mean_y = sum(p["indivT"] for p in points) / len(points)
    ss_x = sum((p["retPct"] - mean_x) ** 2 for p in points)
    if ss_x == 0:
        return None
    cov = sum((p["retPct"] - mean_x) * (p["indivT"] - mean_y) for p in points)
    slope = cov / ss_x
    intercept = mean_y - slope * mean_x
    residuals = [p["indivT"] - (intercept + slope * p["retPct"]) for p in points]
    sd = math.sqrt(sum(r * r for r in residuals) / max(1, len(points) - 2))
    return {"slope": slope, "intercept": intercept, "sd": sd or 1}


def latest_flow_signal() -> dict | None:
    points = weekly_sentiment_points(parse_sentiment_rows())
    model = regression(points)
    if not points or not model:
        return None
    point = points[-1]
    expected = model["intercept"] + model["slope"] * point["retPct"]
    residual = point["indivT"] - expected
    z = residual / model["sd"]
    return {**point, "expected": expected, "residual": residual, "z": z}


def liquidity_score(liquidity: dict) -> tuple[float, str, str, list[dict]]:
    summary = liquidity.get("summary", {})
    market = summary.get("marketLiquidity", {})
    change = market.get("change")
    positives = summary.get("positives")
    total = summary.get("total") or 4
    adverse = max(0, total - positives) if finite(positives) else None
    if finite(adverse):
        score = clamp(adverse / total * 2)
    elif finite(change):
        score = 0.0 if change > 0 else 1.5
    else:
        score = 0.5
    return (
        score,
        f"실질 유동성 보조값 3개월 변화 {money_b(change)}",
        f"3-month real-liquidity proxy change {money_b(change)}",
        [
            {"name": "FRED M2SL", "type": "public data", "url": "https://fred.stlouisfed.org/series/M2SL", "checkedAt": liquidity.get("generatedAt", "")},
            {"name": "FRED WRESBAL", "type": "public data", "url": "https://fred.stlouisfed.org/series/WRESBAL", "checkedAt": liquidity.get("generatedAt", "")},
            {"name": "FRED RRPONTSYD", "type": "public data", "url": "https://fred.stlouisfed.org/series/RRPONTSYD", "checkedAt": liquidity.get("generatedAt", "")},
            {"name": "FRED WTREGEN", "type": "public data", "url": "https://fred.stlouisfed.org/series/WTREGEN", "checkedAt": liquidity.get("generatedAt", "")},
        ],
    )


def build_breadth_liquidity(liquidity: dict) -> dict:
    flow = latest_flow_signal()
    liq_score, liq_ko, liq_en, sources = liquidity_score(liquidity)
    flow_score = 0.5
    flow_ko = "개인 수급 심리 데이터가 부족해 중립 점수로 처리"
    flow_en = "Retail-flow sentiment is insufficient, so a neutral score is used"
    if flow:
        if flow["z"] <= -1.45:
            flow_score = 2.0
        elif flow["z"] <= -0.75:
            flow_score = 1.0
        elif flow["z"] >= 1.45 and flow["retPct"] > 0:
            flow_score = 1.0
        else:
            flow_score = 0.0
        flow_ko = f"최근 주간 개인 순매수는 평소 패턴 대비 {flow['residual']:+.2f}조원, z={flow['z']:+.2f}"
        flow_en = f"Latest weekly retail net buying is {flow['residual']:+.2f}T KRW versus its usual pattern, z={flow['z']:+.2f}"
        sources.append({"name": "KRX investor flow via pykrx", "type": "public market data", "url": "https://github.com/sharebook-kr/pykrx", "checkedAt": flow["date"]})
    score = round(clamp(max(flow_score, liq_score)), 1)
    return indicator(
        "breadth-liquidity",
        score,
        "시장 폭·유동성 다이버전스",
        "Market breadth & liquidity divergence",
        f"{flow_ko}. {liq_ko}.",
        f"{flow_en}. {liq_en}.",
        "개인 수급의 비정상적 위축과 미국 유동성 악화를 함께 봅니다.",
        "Combines unusual retail-flow weakness and U.S. liquidity deterioration.",
        "개인 순매수 잔차, KOSPI 주간 수익률, FRED 유동성 보조값.",
        "Retail-flow residuals, KOSPI weekly returns, and FRED liquidity proxy.",
        "개인 수급이 평소 패턴보다 크게 약하거나 유동성 방향이 악화되면 점수를 높입니다.",
        "Score rises when retail flow is unusually weak or liquidity direction deteriorates.",
        sources,
    )


def latest_company_rows(earnings: dict, group_filter) -> list[dict]:
    rows = []
    for company in earnings.get("companies", []):
        if not group_filter(company):
            continue
        quarters = company.get("quarters") or []
        if len(quarters) < 2:
            continue
        latest, previous = quarters[-1], quarters[-2]
        rows.append({"company": company, "latest": latest, "previous": previous})
    return rows


def avg(values: list[float | None]) -> float | None:
    valid = [v for v in values if finite(v)]
    return sum(valid) / len(valid) if valid else None


def build_leadership(earnings: dict) -> dict:
    rows = latest_company_rows(earnings, lambda c: c.get("group") == "Hyperscaler")
    capex_ocf = []
    capex_ni = []
    profit_growth = []
    for row in rows:
        latest, previous = row["latest"], row["previous"]
        ocf = abs(latest.get("operatingCashFlow") or 0)
        ni = latest.get("profit")
        capex = abs(latest.get("capex") or 0)
        capex_ocf.append(capex / ocf if ocf else None)
        capex_ni.append(capex / ni if ni and ni > 0 else None)
        profit_growth.append(qoq(latest.get("profit"), previous.get("profit")))
    avg_ocf = avg(capex_ocf)
    avg_ni = avg(capex_ni)
    avg_profit = avg(profit_growth)
    score = 0.0
    if finite(avg_ocf) and avg_ocf > 1.0:
        score += 0.8
    elif finite(avg_ocf) and avg_ocf > 0.75:
        score += 0.4
    if finite(avg_ni) and avg_ni > 1.2:
        score += 0.8
    elif finite(avg_ni) and avg_ni > 0.9:
        score += 0.4
    if finite(avg_profit) and avg_profit < 0:
        score += 0.4
    return indicator(
        "leadership-quality",
        round(clamp(score), 1),
        "주도주 경쟁력 약화",
        "Leadership quality weakening",
        f"하이퍼스케일러 평균 CAPEX/OCF {pct(avg_ocf)}, CAPEX/순이익 {pct(avg_ni)}, 순이익 QoQ {pct(avg_profit)}.",
        f"Hyperscaler average CAPEX/OCF {pct(avg_ocf)}, CAPEX/net income {pct(avg_ni)}, net-income QoQ {pct(avg_profit)}.",
        "AI 주도주의 투자 부담이 현금흐름과 이익을 과도하게 압박하는지 봅니다.",
        "Checks whether AI leaders' investment burden is pressuring cash flow and earnings.",
        "Yahoo Finance 분기 현금흐름·손익계산서 기반 CAPEX/OCF, CAPEX/순이익, 순이익 증가율.",
        "CAPEX/OCF, CAPEX/net income, and net-income growth from Yahoo Finance quarterly fundamentals.",
        "CAPEX가 OCF나 순이익을 크게 초과하거나 이익 증가율이 둔화되면 점수를 높입니다.",
        "Score rises when CAPEX materially exceeds OCF/net income or earnings growth weakens.",
        [{"name": "Yahoo Finance fundamentals time-series", "type": "public endpoint", "url": "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/MSFT", "checkedAt": earnings.get("generatedAt", "")}],
    )


def build_end_demand(earnings: dict) -> dict:
    rows = latest_company_rows(earnings, lambda c: c.get("group") != "Hyperscaler" and c.get("id") != "kioxia")
    revenue_growth = [qoq(r["latest"].get("quarterlyTotalRevenue"), r["previous"].get("quarterlyTotalRevenue")) for r in rows]
    op_growth = [qoq(r["latest"].get("quarterlyOperatingIncome"), r["previous"].get("quarterlyOperatingIncome")) for r in rows]
    avg_rev = avg(revenue_growth)
    avg_op = avg(op_growth)
    negative_rev = sum(1 for v in revenue_growth if finite(v) and v < 0)
    score = 0.0
    if finite(avg_rev) and avg_rev < -0.03:
        score += 1.2
    elif finite(avg_rev) and avg_rev < 0.03:
        score += 0.6
    if negative_rev >= 2:
        score += 0.5
    if finite(avg_op) and avg_op < 0:
        score += 0.3
    return indicator(
        "end-demand",
        round(clamp(score), 1),
        "전방 수요 피크아웃",
        "End-demand peak-out",
        f"메모리 업체 평균 매출 QoQ {pct(avg_rev)}, 영업이익 QoQ {pct(avg_op)}.",
        f"Memory-company average revenue QoQ {pct(avg_rev)}, operating-profit QoQ {pct(avg_op)}.",
        "메모리 업체 매출과 영업이익이 동시에 둔화되는지 봅니다.",
        "Checks whether memory-company revenue and operating profit weaken together.",
        "TSMC, SanDisk, Micron, Samsung Electronics, SK Hynix의 분기 매출과 영업이익.",
        "Quarterly revenue and operating profit for TSMC, SanDisk, Micron, Samsung Electronics, and SK Hynix.",
        "평균 매출 증가율이 0% 근처로 내려오거나 음수 기업이 늘면 점수를 높입니다.",
        "Score rises when average revenue growth approaches zero or more companies turn negative.",
        [{"name": "Yahoo Finance fundamentals time-series", "type": "public endpoint", "url": "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/MU", "checkedAt": earnings.get("generatedAt", "")}],
    )


def excel_col_index(cell_ref: str) -> int:
    col = "".join(ch for ch in cell_ref if ch.isalpha())
    result = 0
    for ch in col:
        result = result * 26 + ord(ch.upper()) - ord("A") + 1
    return result - 1


def fetch_sec_ipo_rows() -> list[dict]:
    req = urllib.request.Request(
        SEC_IPO_XLSX_URL,
        headers={
            "User-Agent": "wiplabs-research contact@example.com",
            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        workbook = response.read()

    zf = zipfile.ZipFile(io.BytesIO(workbook))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    shared = []
    for item in shared_root.findall("m:si", ns):
        shared.append("".join((node.text or "") for node in item.findall(".//m:t", ns)))

    def cell_value(cell):
        value = cell.find("m:v", ns)
        if value is None:
            return ""
        raw = value.text or ""
        if cell.get("t") == "s":
            return shared[int(raw)]
        try:
            number = float(raw)
            return int(number) if number.is_integer() else number
        except ValueError:
            return raw

    sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.findall(".//m:row", ns):
        values = []
        for cell in row.findall("m:c", ns):
            idx = excel_col_index(cell.get("r", "A1"))
            while len(values) <= idx:
                values.append("")
            values[idx] = cell_value(cell)
        if any(value != "" for value in values):
            rows.append(values)
    if len(rows) < 3:
        raise RuntimeError("SEC IPO workbook has no usable data rows.")
    headers = [str(value) for value in rows[0]]
    return [dict(zip(headers, row)) for row in rows[1:] if row and row[0] != ""]


def to_number(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if value in ("", "-", None):
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def average(values: list[float | None]) -> float | None:
    clean = [value for value in values if finite(value)]
    if not clean:
        return None
    return sum(clean) / len(clean)


def period_sort_key(row: dict) -> tuple[int, int]:
    period = str(row.get("Time Period", ""))
    if ":Q" in period:
        year, quarter = period.split(":Q", 1)
        return int(year), int(quarter)
    return int(float(period)), 4


def global_mega_ipo_overlay() -> tuple[float, dict]:
    registry = read_json(GLOBAL_MEGA_IPO_JSON)
    active_events = [event for event in registry.get("events", []) if event.get("active")]
    event_results = []
    total = 0.0
    sources = []
    for event in active_events:
        proceeds = to_float(event.get("proceedsUsdBillions")) or 0.0
        event_score = 0.3 if proceeds >= 10 else 0.2 if proceeds >= 5 else 0.0
        if event.get("directLeaderSector"):
            event_score += 0.1
        if event.get("speculativeDemandConcern"):
            event_score += 0.1
        event_score = min(0.5, event_score)
        total += event_score
        event_results.append({**event, "overlayScore": round(event_score, 1)})
        sources.extend(event.get("sources", []))
    return round(min(0.5, total), 1), {
        "updatedAt": registry.get("updatedAt"),
        "methodology": registry.get("methodology", {}),
        "events": event_results,
        "sources": sources,
    }


def build_ipo(previous: dict) -> dict:
    previous_item = next((item for item in previous.get("indicators", []) if item.get("id") == "ipo-liquidity"), {})
    try:
        rows = sorted(fetch_sec_ipo_rows(), key=period_sort_key)
        quarter_rows = [row for row in rows if ":Q" in str(row.get("Time Period", ""))]
        latest = quarter_rows[-1]
        base = quarter_rows[-5:-1]
        latest_period = str(latest.get("Time Period"))
        total_ipos = to_number(latest.get("Total number of IPOs"))
        total_proceeds = to_number(latest.get("IPO total proceeds (US$ Millions)"))
        spac_ipos = to_number(latest.get("Number of IPOs by blank check/SPAC issuers"))
        corporate_ipos = to_number(latest.get("Number of IPOs by corporate issuers"))
        median_proceeds = to_number(latest.get("IPO median proceeds (US$ Millions)"))
        avg_ipos = average([to_number(row.get("Total number of IPOs")) for row in base])
        avg_proceeds = average([to_number(row.get("IPO total proceeds (US$ Millions)")) for row in base])
        avg_median = average([to_number(row.get("IPO median proceeds (US$ Millions)")) for row in base])
        count_ratio = total_ipos / avg_ipos if finite(total_ipos) and finite(avg_ipos) and avg_ipos else None
        proceeds_ratio = total_proceeds / avg_proceeds if finite(total_proceeds) and finite(avg_proceeds) and avg_proceeds else None
        median_ratio = median_proceeds / avg_median if finite(median_proceeds) and finite(avg_median) and avg_median else None
        spac_share = spac_ipos / total_ipos if finite(spac_ipos) and finite(total_ipos) and total_ipos else None
        sec_raw_score = 0.0
        if finite(proceeds_ratio):
            sec_raw_score += 0.6 if proceeds_ratio >= 1.25 else 0.3 if proceeds_ratio >= 1.05 else 0.0
        if finite(count_ratio):
            sec_raw_score += 0.4 if count_ratio >= 1.15 else 0.2 if count_ratio >= 1.0 else 0.0
        if finite(spac_share):
            sec_raw_score += 0.6 if spac_share >= 0.5 else 0.3 if spac_share >= 0.35 else 0.0
        if finite(median_ratio):
            sec_raw_score += 0.4 if median_ratio >= 1.5 else 0.2 if median_ratio >= 1.2 else 0.0
        sec_score = round(clamp(sec_raw_score) * 0.75, 2)
        global_score, global_overlay = global_mega_ipo_overlay()
        score = round(clamp(sec_score + global_score), 1)
        active_names_ko = ", ".join(event.get("companyKo", event.get("id", "")) for event in global_overlay["events"])
        active_names_en = ", ".join(event.get("companyEn", event.get("id", "")) for event in global_overlay["events"])
        global_obs_ko = f" 미국 외 초대형 IPO 보정 {global_score:.1f}점({active_names_ko})을 포함합니다." if active_names_ko else ""
        global_obs_en = f" Includes a {global_score:.1f}-point non-U.S. mega-IPO overlay ({active_names_en})." if active_names_en else ""
        checked_at = now_kst().date().isoformat()
        item = indicator(
            "ipo-liquidity",
            score,
            "IPO 질적 악화 및 유동성 흡수",
            "IPO quality deterioration & liquidity absorption",
            f"SEC {latest_period} 기준 IPO {total_ipos:.0f}건, 조달액 {total_proceeds:,.1f}백만 달러, SPAC 비중 {spac_share * 100:.1f}%입니다.",
            f"SEC {latest_period}: {total_ipos:.0f} IPOs, US${total_proceeds:,.1f} million proceeds, and {spac_share * 100:.1f}% SPAC share.{global_obs_en}",
            "IPO 시장이 과열되어 시중 유동성을 흡수하거나, SPAC·백지수표 회사 비중이 높아져 상장 품질이 낮아지는지 봅니다.",
            "Checks whether IPO activity absorbs liquidity or whether a high SPAC/blank-check share points to weaker listing quality.",
            f"최근 분기와 직전 4개 분기 평균 비교: 건수 {pct(count_ratio - 1 if finite(count_ratio) else None)}, 조달액 {pct(proceeds_ratio - 1 if finite(proceeds_ratio) else None)}, 중간 조달액 {pct(median_ratio - 1 if finite(median_ratio) else None)}. 일반 기업 IPO {corporate_ipos:.0f}건, SPAC {spac_ipos:.0f}건.",
            f"Latest quarter versus prior four-quarter average: count {pct(count_ratio - 1 if finite(count_ratio) else None)}, proceeds {pct(proceeds_ratio - 1 if finite(proceeds_ratio) else None)}, median proceeds {pct(median_ratio - 1 if finite(median_ratio) else None)}. Corporate IPOs {corporate_ipos:.0f}, SPACs {spac_ipos:.0f}.{global_obs_en}",
            "조달액·건수가 직전 4개 분기 평균보다 빠르게 늘고 SPAC 비중이 35~50%를 넘으면 위험 점수가 올라갑니다. 상장 후 수익률과 적자 기업 비중은 아직 무료 자동 원천을 확정하지 않아 보조 판단에서 제외합니다.",
            "Score rises when proceeds/counts run above the prior four-quarter average and SPAC share exceeds 35-50%. Aftermarket returns and loss-making issuer share are not yet included because a free automated source has not been confirmed.",
            [{
                "name": "SEC IPO Statistics",
                "type": "official public statistics",
                "url": SEC_IPO_PAGE_URL,
                "checkedAt": checked_at,
                "note": "Quarterly IPO counts/proceeds and issuer-type breakdown; downloadable workbook through 2026:Q1.",
            }, *global_overlay["sources"]],
        )
        item["observationKo"] += global_obs_ko
        item["interpretationKo"] += global_obs_ko
        item["recentChangeKo"] = f"SEC 기본 {sec_score:.2f}점 + 미국 외 초대형 IPO 보정 {global_score:.1f}점"
        item["recentChangeEn"] = f"SEC base {sec_score:.2f} + non-U.S. mega-IPO overlay {global_score:.1f}"
        item["computedData"] = {
            "latestPeriod": latest_period,
            "totalIpos": total_ipos,
            "totalProceedsUsdMillions": total_proceeds,
            "spacIpos": spac_ipos,
            "corporateIpos": corporate_ipos,
            "spacShare": spac_share,
            "priorFourQuarterAverageIpos": avg_ipos,
            "priorFourQuarterAverageProceedsUsdMillions": avg_proceeds,
            "countRatio": count_ratio,
            "proceedsRatio": proceeds_ratio,
            "medianProceedsRatio": median_ratio,
            "componentScores": {"secBase": sec_score, "globalMegaIpoOverlay": global_score},
            "globalMegaIpoEvents": global_overlay["events"],
        }
        return item
    except Exception as exc:
        cached = previous_item.get("computedData")
        if cached:
            item = dict(previous_item)
            item["recentChangeKo"] = "SEC 실시간 확인 실패, 직전 산출값 유지"
            item["recentChangeEn"] = "SEC live check failed; kept prior computed value"
            item["historyKo"] = [f"{now_kst().date().isoformat()} SEC 수집 실패: {exc}"]
            item["historyEn"] = [f"{now_kst().date().isoformat()} SEC fetch failed: {exc}"]
            item["stale"] = True
            return item
        item = indicator(
            "ipo-liquidity",
            0.0,
            "IPO 질적 악화 및 유동성 흡수",
            "IPO quality deterioration & liquidity absorption",
            "SEC IPO 통계 수집에 실패해 이번 산출에서는 0점으로 둡니다.",
            "SEC IPO statistics could not be fetched, so this item is set to 0 for this run.",
            "무료 원천은 SEC 분기 IPO 통계를 우선 사용하고, 개별 IPO 캘린더는 추후 보조 데이터로 연결합니다.",
            "Uses SEC quarterly IPO statistics first; individual IPO calendars may be added later as a secondary source.",
            "데이터 수집 실패. 다음 자동 실행에서 다시 시도합니다.",
            "Data fetch failed. The next scheduled run will retry.",
            "실제 원천 수집 실패 시 점수 왜곡을 막기 위해 0점으로 처리합니다.",
            "When the live source fails and no cache exists, score is set to 0 to avoid overstating risk.",
            [],
        )
        item["statusKo"] = "데이터 대기"
        item["statusEn"] = "Data pending"
        item["dataPending"] = True
        return item


def latest_forward_per_reference() -> float:
    """Use the latest explicitly sourced forward-PER CSV observation."""
    try:
        with FORWARD_PER_CSV.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        valid = [row for row in rows if finite(float(row.get("value", "")))]
        if valid:
            return float(valid[-1]["value"])
    except (OSError, ValueError, KeyError):
        pass
    return 6.35


def build_eps(market: dict) -> dict:
    kospi = market.get("markets", {}).get("kospi200", {})
    current = kospi.get("per")
    average = kospi.get("historicalAveragePer")
    forward = latest_forward_per_reference()
    implied_growth = (current / forward - 1) if finite(current) and forward else None
    valuation_gap = (current / average - 1) if finite(current) and finite(average) and average else None
    score = 0.5
    if finite(implied_growth):
        if implied_growth < 0:
            score = 2.0
        elif implied_growth < 0.1:
            score = 1.5
        elif implied_growth < 0.25:
            score = 1.0
        else:
            score = 0.3
    if finite(valuation_gap) and valuation_gap > 0.25:
        score += 0.3
    return indicator(
        "eps-revision",
        round(clamp(score), 1),
        "EPS 전망 하향 조정",
        "EPS forecast downgrades",
        f"현행 PER {current}배, 역사적 평균 {average}배, Forward PER 참고치 {forward}배. 내재 이익 개선 기대 {pct(implied_growth)}.",
        f"Current PER {current}x, historical average {average}x, forward PER reference {forward}x. Implied earnings-growth expectation {pct(implied_growth)}.",
        "현재 PER와 Forward PER 참고치의 차이로 이익 기대가 충분한지 점검합니다.",
        "Uses the gap between current PER and a forward PER reference to check whether earnings expectations look sufficient.",
        "KRX KOSPI PER, 사용자 제공 역사적 PER CSV, 공개 기사 기반 Forward PER 참고치.",
        "KRX KOSPI PER, user-provided historical PER CSV, and public-article forward PER reference.",
        "Forward PER가 현행 PER와 평균 PER보다 높거나 내재 이익 개선 기대가 낮으면 점수를 높입니다.",
        "Score rises when forward PER is high relative to current/average PER or implied earnings growth is weak.",
        [{"name": "KRX KOSPI PER data", "type": "public/user-provided market data", "url": "https://data.krx.co.kr/", "checkedAt": market.get("generatedAt", "")}],
    )


def stage(score: float) -> tuple[str, str, str]:
    if score <= 2:
        return "정상", "Normal", "positive"
    if score <= 4:
        return "관찰", "Watch", "neutral"
    if score <= 6:
        return "주의", "Caution", "caution"
    if score <= 8:
        return "경계", "Alert", "warning"
    return "위험", "Risk", "negative"


def indicator(id_: str, score: float, title_ko: str, title_en: str, obs_ko: str, obs_en: str, judgment_ko: str, judgment_en: str, data_ko: str, data_en: str, criteria_ko: str, criteria_en: str, sources: list[dict]) -> dict:
    status_ko, status_en, _tone = stage(score * 5)
    return {
        "id": id_,
        "score": score,
        "statusKo": status_ko,
        "statusEn": status_en,
        "titleKo": title_ko,
        "titleEn": title_en,
        "anchor": f"#{id_}",
        "observationKo": obs_ko,
        "observationEn": obs_en,
        "recentChangeKo": "자동 산출",
        "recentChangeEn": "Auto-calculated",
        "judgmentKo": judgment_ko,
        "judgmentEn": judgment_en,
        "dataKo": data_ko,
        "dataEn": data_en,
        "criteriaKo": criteria_ko,
        "criteriaEn": criteria_en,
        "interpretationKo": obs_ko,
        "interpretationEn": obs_en,
        "sources": sources,
        "historyKo": [f"{now_kst().date().isoformat()} 자동 산출"],
        "historyEn": [f"{now_kst().date().isoformat()} auto-calculated"],
    }


def load_previous_history(previous: dict) -> list[dict]:
    return list(previous.get("history", []))[-11:]


def previous_comparison_score(previous: dict, date: str, fallback: float) -> float:
    for row in reversed(previous.get("history", [])):
        if row.get("date") != date and finite(row.get("totalScore")):
            return row["totalScore"]
    value = previous.get("summary", {}).get("totalScore")
    return value if finite(value) else fallback


def main() -> None:
    previous = read_json(OUT)
    liquidity = read_json(LIQUIDITY_JSON)
    earnings = read_json(EARNINGS_JSON)
    market = read_json(MARKET_PER_JSON)
    indicators = [
        build_breadth_liquidity(liquidity),
        build_leadership(earnings),
        build_end_demand(earnings),
        build_ipo(previous),
        build_eps(market),
    ]
    total = round(sum(item["score"] for item in indicators) * 2) / 2
    label_ko, label_en, tone = stage(total)
    date = now_kst().date().isoformat()
    previous_score = previous_comparison_score(previous, date, total)
    summary_ko = f"실제 연결 데이터 기준 현재 총점은 {total:.1f}/10, {label_ko} 단계입니다. IPO 항목은 SEC 분기 IPO 통계를 이용해 산출합니다."
    summary_ko += " IPO 항목은 SEC 분기 통계와 미국 외 초대형 IPO 사건을 함께 반영합니다."
    summary_en = f"Using connected data, the current score is {total:.1f}/10, {label_en} stage. The IPO item combines SEC quarterly statistics with verified non-U.S. mega-IPO events."
    history = load_previous_history(previous)
    if not history or history[-1].get("date") != date:
        history.append({"date": date, "totalScore": total, "changesKo": ["자동 산출 데이터 갱신"], "changesEn": ["Auto-calculated data update"]})
    else:
        history[-1] = {"date": date, "totalScore": total, "changesKo": ["자동 산출 데이터 갱신"], "changesEn": ["Auto-calculated data update"]}
    payload = {
        "ok": True,
        "sample": False,
        "generatedAt": now_kst().isoformat(timespec="seconds"),
        "lastUpdated": date,
        "operatorNote": {
            "ko": "기존 사이트 수집 데이터와 공개 데이터 대용치를 이용해 자동 산출합니다.",
            "en": "Automatically calculated from existing site datasets and public-data proxies.",
        },
        "summary": {"totalScore": total, "previousScore": previous_score, "interpretation": {"ko": summary_ko, "en": summary_en}},
        "scoreScale": [
            {"min": 0, "max": 2, "labelKo": "정상", "labelEn": "Normal", "tone": "positive"},
            {"min": 2.5, "max": 4, "labelKo": "관찰", "labelEn": "Watch", "tone": "neutral"},
            {"min": 4.5, "max": 6, "labelKo": "주의", "labelEn": "Caution", "tone": "caution"},
            {"min": 6.5, "max": 8, "labelKo": "경계", "labelEn": "Alert", "tone": "warning"},
            {"min": 8.5, "max": 10, "labelKo": "위험", "labelEn": "Risk", "tone": "negative"},
        ],
        "sourceFramework": SOURCE_FRAMEWORK,
        "indicators": indicators,
        "history": history[-12:],
        "sourceRegistry": {
            "noteKo": "F7은 기존 WIP Labs 데이터 파일과 무료 공개 원천을 조합해 자동 산출합니다. IPO 항목은 SEC 분기 IPO 통계를 우선 사용합니다.",
            "noteEn": "F7 combines existing WIP Labs datasets with free public sources. The IPO item combines SEC quarterly statistics with a verified non-U.S. mega-IPO event registry.",
            "examples": ["KRX/pykrx", "FRED", "Yahoo Finance fundamentals", "SEC IPO Statistics", "verified non-U.S. mega-IPO reports"],
        },
        "disclaimer": DISCLAIMER,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}: score={total:.1f}/10, stage={label_en}, tone={tone}")


if __name__ == "__main__":
    main()
