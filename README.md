# Mare — concept site

A single-page marketing site for **Mare** (pronounced *MAH-ray*), a *fictional* company pitched as "the resource exchange for the Moon": **Know what's there. Know what it costs. Trade it.**

The concept: Mare doesn't mine. It's the neutral information and market layer a lunar economy would need before it could be financed. It works like a geological survey, a commodities price index, and an exchange in one, through four products: **Survey** (resource atlas), **Ledger** (cost and price index), **Exchange** (forward contracts on standard grades), and **Steward** (allocation and extraction tracking).

This is a design/portfolio piece. The company, sites, prices, grades, and milestones are invented. No real company, agency, or person is referenced, and nothing here describes a real or regulated financial product. All data is illustrative.

## Run it

No build step and no dependencies. Open `index.html` in a browser.

You can also serve the folder, which makes the page read `data/resources.json` live:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

IBM Plex Sans and Plex Mono load from Google Fonts. Offline, the page falls back to system sans and mono fonts.

## Structure

```
mare/
├── index.html           Semantic single-page markup (11 sections)
├── styles.css           Tokens, components, breakpoints, reduced-motion rules
├── script.js            Nav, scroll-spy, reveal, ticker, atlas map, chart, tabs, form
│                        (+ an embedded copy of the data, see below)
├── data/
│   └── resources.json   All illustrative data: map sites, price index, grades
├── README.md
└── assets/
    ├── logo.svg, favicon.svg
    ├── hero.svg           South-pole disc with survey rings and a price card
    ├── atlas-map.svg      Map of the fictional "Austral Reach" region
    └── icon-survey.svg, icon-ledger.svg, icon-exchange.svg, icon-steward.svg
```

## Sections

1. **Hero**: tagline, pitch, "Explore the atlas" / "Join the exchange waitlist"
2. **Problem**: you can't finance, insure, or trade what you can't measure or price
3. **Atlas demo**: clickable map sites showing resource, quantity, confidence, cost per ton and a cost breakdown, with resource filters
4. **Price index dashboard**: tabs for an SVG price chart (select a series to highlight it), an index table, and the quality-grade sheet
5. **How the exchange works**: List → Verify (Survey) → Price (Ledger) → Match (Exchange) → Settle and track (Steward)
6. **Products**: the four products
7. **Audiences**: producers, buyers, financiers and insurers
8. **Principles**: transparency, neutrality, sustainable use, interoperability
9. **Roadmap**: Atlas beta → First price index published → First forward contract matched → Steward pilot
10. **Waitlist form**: front-end only, with validation and a success message (nothing is sent)
11. **Footer**: "Mare is a fictional company created as a design concept. All data shown is illustrative."

A scrolling price ticker sits under the header. It is labeled *Illustrative*, has a Pause button, pauses on hover and focus, and stays still under `prefers-reduced-motion`.

## Editing the data

Everything data-driven (the ticker, map markers and panel, chart, index table, and grades table) comes from **`data/resources.json`**:

| Key | What it controls |
| --- | --- |
| `sites[]` | Map markers and the detail panel. `x` and `y` are percentages across and down `atlas-map.svg`. `type` is `water`, `oxygen`, `metals`, or `helium3`, which sets the marker shape and filter. `confidence` is 0–100 (≥70 High, ≥45 Medium, else Low). `costPerTon` is in USD thousands, or `null` for "Not yet priced". `breakdown` holds percentages for extract/refine/store/deliver, or `null`. |
| `index.periods` / `index.series[]` | Chart x-axis labels and one line per grade. The ticker and the change figure use the last two values. |
| `grades[]` | Rows in the Quality grades tab. A grade whose `code` matches a series shows its latest index value. |
| `meta.priceUnit` | Unit line under the chart and in the table caption. |

**Opening from file:// vs. serving over HTTP.** Browsers block `fetch()` for pages opened directly from disk, so `script.js` carries an embedded copy of the JSON between `/* DATA:BEGIN */` and `/* DATA:END */` and uses it when the fetch fails. When the folder is served over HTTP, the JSON file is used directly.

After editing the JSON, re-sync the embedded copy so both ways of opening the site match:

```sh
python3 -c "import json,re;d=json.dumps(json.load(open('data/resources.json')));s=open('script.js').read();open('script.js','w').write(re.sub(r'/\* DATA:BEGIN \*/.*?/\* DATA:END \*/',lambda m:'/* DATA:BEGIN */'+d+'/* DATA:END */',s,flags=re.S))"
```

## Design and accessibility notes

- **Palette:** slate background, off-white text, lunar grays, and one accent (amber) for data highlights and CTAs. Colors are CSS custom properties at the top of `styles.css`.
- **Not color alone:** resource types on the map are told apart by marker *shape* (circle, square, diamond, triangle). Chart series differ by *dash pattern* and have direct end labels. The selected series turns amber.
- **Keyboard:** map sites and filters are real buttons. The dashboard follows the WAI-ARIA tabs pattern (Left/Right/Home/End). The mobile menu closes with Esc. Focus rings are always visible.
- **Screen readers:** each map button has a name and resource type, and the detail panel announces changes politely. The chart has a text summary, with the full values in the Index table tab. Form errors are linked with `aria-describedby`, and the success message takes focus.
- **Motion:** scroll fade-ins, the ticker, and the selected-marker pulse are all disabled under `prefers-reduced-motion: reduce`. Without JavaScript, all static content is still visible.
- **Responsive:** built mobile-first. The chart redraws at its real container width, so its text stays legible on phones.
