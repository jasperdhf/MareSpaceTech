# Mare — concept site

A single-page marketing site for **Mare** (pronounced *MAH-ray*), a *fictional* company that offers maps, prices, and contracts for lunar resources.

Mare provides information and a marketplace; it doesn't extract or refine anything itself. It has four products: **Survey** (a resource atlas), **Ledger** (a cost and price index), **Exchange** (forward contracts on standard grades), and **Steward** (allocation and extraction tracking).

This is a design/portfolio piece. The company, sites, prices, grades, and milestones are invented. No real company, agency, or person is referenced, and nothing here describes a real or regulated financial product. All data is illustrative.

## Run it

No build step. Open `index.html` in a browser.

You can also serve the folder, which makes the page read `data/resources.json` live:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Two things load from the internet:
- **Fonts:** Spectral and Archivo, from Google Fonts. Offline, system fonts are used instead.
- **Three.js r128,** from cdnjs, which renders the 3D Moon and the 3D atlas. Offline, or without WebGL, the page shows the flat Moon illustration and the flat map instead.

## Structure

```
mare/
├── index.html           Single-page markup (10 sections)
├── styles.css           Palette tokens, components, breakpoints, reduced-motion rules
├── script.js            Nav, scroll-spy, ticker, atlas map, chart, tabs
│                        (+ an embedded copy of the data, see below)
├── moon3d.js            The 3D Moon in the hero (Three.js)
├── atlas3d.js           The 3D relief model in the resource atlas (Three.js)
├── data/
│   └── resources.json   All illustrative data: map sites, price index, grades
├── README.md
└── assets/
    ├── hero-moon.svg      Static Moon, used if 3D isn't available
    ├── atlas-map.svg      Polar map plate of the fictional "Austral Reach"
    ├── earth.svg          Earth, rising in the footer
    ├── logo.svg, favicon.svg
    └── icon-survey.svg, icon-ledger.svg, icon-exchange.svg, icon-steward.svg
```

## Sections

1. **Hero:** a 3D Moon you can spin, with the pitch and links to the atlas and the price index. Clicking the Moon jumps to the atlas.
2. **Problem:** why lunar resources can't be financed until they're measured and priced
3. **Resource atlas:** a 3D model of the made-up Austral Reach. Click a site to see what's there, how sure the estimate is, the cost per ton and a cost breakdown. Filter sites by resource.
4. **Price index:** tabs for a price chart (select a grade to highlight it), an index table, and the quality grades
5. **How a trade works:** List reserves → Verify with Survey → Price with Ledger → Match on Exchange → Settle and track with Steward
6. **Products:** the four products
7. **Who it's for:** producers, buyers, financiers and insurers
8. **Principles:** transparency, neutrality, sustainable use, interoperability
9. **Roadmap:** Atlas beta → First price index published → First forward contract matched → Steward pilot
10. **Footer:** "Mare is a fictional company created as a design concept. All data shown is illustrative."

A price ticker runs under the header. It's labeled *Example prices*, has a Pause button, pauses on hover and focus, and stays still under `prefers-reduced-motion`.

## The 3D Moon

`moon3d.js` generates the Moon's surface in the browser. It builds a colour map (regolith, darker basalt plains, craters, ray systems, and blue survey circles around shadowed south-polar craters) and a matching bump map. Because the bump map carries the crater relief, the crater shading moves correctly as the Moon turns. Lighting is a low sun from the left plus a faint blue fill for earthshine on the night side.

- **Turning it:** drag it with a mouse or finger, or select it with Tab and use the arrow keys. On touch screens, a vertical swipe still scrolls the page.
- **Clicking it:** a click (not a drag), or Enter while it's selected, scrolls to the resource atlas.
- **Motion:** when idle, it turns slowly. That stops for people who prefer reduced motion.
- **Performance:** it only renders while it's on screen.
- **Look:** to change it, edit `buildTextures()`, the `sun` light, or the starting `yaw`/`pitch` in `moon3d.js`.

## The 3D atlas

`atlas3d.js` turns the flat map into a 3D model of the Austral Reach. Its height map matches the flat map: deep bowls at Nightglass Crater and Coldwell Hollow, a raised Lantern Ridge, lower dark plains, and a higher shelf. Heights are stretched so they're easy to see. A low sun casts real shadows, so the crater floors stay dark.

- **Markers:** the site markers are still the HTML buttons from `script.js`. `atlas3d.js` just moves them every frame to follow the terrain, so clicking, filtering, keyboard and screen-reader access all work as before.
- **Turning it:** drag it, or select it and use the arrow keys.
- **Performance:** like the hero Moon, it only renders while it's on screen and turns slowly when idle (not under reduced motion).
- **Moving a site:** if you move a site in `data/resources.json`, its marker moves on both the flat map and the 3D model. The terrain features themselves are set in `atlas3d.js` (`BIG`, `FIXED`, `RIDGE`).

## Editing the data

Everything data-driven (the ticker, map markers and panel, chart, index table, and grades table) comes from **`data/resources.json`**:

| Key | What it controls |
| --- | --- |
| `sites[]` | Map markers and the detail panel. `x` and `y` are percentages across and down `atlas-map.svg`. `type` is `water`, `oxygen`, `metals`, or `helium3`, which sets the marker shape and filter. `confidence` is 0–100 (≥70 High, ≥45 Medium, else Low). `costPerTon` is in USD thousands, or `null` for "Not yet priced". `breakdown` holds percentages for extract/refine/store/deliver, or `null`. |
| `index.periods` / `index.series[]` | Chart x-axis labels and one line per product. `name` is shown on the chart, ticker, and tables; `code` is an internal id. The ticker and the change figure use the last two values. |
| `grades[]` | Rows in the Quality grades tab. `name` is what visitors see; `code` is an internal id (a grade whose `code` matches a series shows its latest price). |
| `meta.priceUnit` | Unit line under the chart and in the table caption. |

**Opening from disk vs. serving over HTTP.** Browsers block `fetch()` for pages opened directly from disk (`file://`). So `script.js` carries an embedded copy of the JSON between `/* DATA:BEGIN */` and `/* DATA:END */`, and uses it when the fetch fails. When the site is served over HTTP, including on GitHub Pages, the JSON file is used directly.

After editing the JSON, re-sync the embedded copy so both match:

```sh
python3 -c "import json,re;d=json.dumps(json.load(open('data/resources.json')));s=open('script.js').read();open('script.js','w').write(re.sub(r'/\* DATA:BEGIN \*/.*?/\* DATA:END \*/',lambda m:'/* DATA:BEGIN */'+d+'/* DATA:END */',s,flags=re.S))"
```

## Design notes

- **Concept:** the page is the Moon. A navy night sky holds the hero Moon. Light regolith gray is the reading surface, and the data instruments (atlas and price index) and the principles sit on blue-slate basalt plains with soft, irregular edges. The footer is an earthrise over the horizon.
- **Colour:** Earth blue is the only accent, used for data and actions, because from the Moon, Earth is the only colour in the sky. The palette is defined as custom properties at the top of `styles.css`.
- **Type:** Spectral, a serif, for headings and text. Archivo, in condensed widths, for interface text and numbers.
- **Not colour alone:** resource types on the map are told apart by marker shape (circle, square, diamond, triangle). Chart lines differ by dash pattern and carry direct labels. The roadmap shows progress as Moon phases, with the status also written out.
- **Keyboard:** map sites, filters and the Moon are all keyboard-operable. The dashboard follows the WAI-ARIA tabs pattern (Left/Right/Home/End). The mobile menu closes with Esc. Focus rings are always visible.
- **Screen readers:** the Moon and every map site have text labels, and the site panel announces changes politely. The chart has a text summary, with the full values in the Index table tab.
- **Motion:** the Moon rises once on load and turns slowly when idle; the ticker scrolls. All of it is off under `prefers-reduced-motion: reduce`.
