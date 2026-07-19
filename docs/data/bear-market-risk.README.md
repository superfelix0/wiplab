# Bear Market Risk Dashboard data

The F7 page reads `docs/data/bear-market-risk.json`.

Update workflow:

1. Edit `summary.totalScore`, `summary.previousScore`, `lastUpdated`, and `summary.interpretation`.
2. Edit each item in `indicators`.
   - `score`: 0 to 2 points.
   - `statusKo` / `statusEn`: visible status label.
   - `observation`, `recentChange`, `judgment`, `data`, `criteria`, `interpretation`: card and detail copy.
   - `sources`: keep empty or TODO until a real source is actually used. When connected, add source name, institution/type, URL, checked date, and notes.
3. Add one row to `history` for the weekly score trend and change log.
4. Keep `sourceFramework.video` fields as `TODO` until the original video title, channel, published date, and URL are verified. Do not invent these fields.

Score bands:

- 0-2: Normal
- 2.5-4: Watch
- 4.5-6: Caution
- 6.5-8: Alert
- 8.5-10: Risk

Current state:

- `sample: true` means the page clearly displays sample data.
- Indicator source arrays are intentionally empty until actual data sources are connected.
