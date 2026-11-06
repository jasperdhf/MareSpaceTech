/* Mare — interactions (vanilla JS, no dependencies)
 *
 * Data: the site reads data/resources.json. Browsers block fetch() for pages
 * opened straight from the file system (file://), so an embedded copy of the
 * same JSON lives between the DATA markers below and is used as a fallback.
 * See README.md for the one-line command that re-syncs it after you edit the JSON.
 */
(function () {
  "use strict";

  // prettier-ignore
  const EMBEDDED_DATA = /* DATA:BEGIN */{"meta": {"note": "Every value in this file is fictional and illustrative. None of it is a real measurement or price.", "priceUnit": "USD thousands per metric ton, delivered to pad", "region": "Austral Reach (fictional)"}, "sites": [{"id": "nightglass", "name": "Nightglass Crater", "type": "water", "x": 41.7, "y": 47.5, "blurb": "Permanently shadowed floor in a deep crater. The richest ice signal in the region, with good access from the eastern ridge.", "quantity": "~120 kt water ice", "confidence": 62, "costPerTon": 380, "basis": "Orbital neutron and radar data, one surface probe", "breakdown": {"extract": 38, "refine": 27, "store": 15, "deliver": 20}}, {"id": "coldwell", "name": "Coldwell Hollow", "type": "water", "x": 64.2, "y": 34.2, "blurb": "Smaller, colder crater. Promising orbital signal, but no surface confirmation yet.", "quantity": "~45 kt water ice", "confidence": 34, "costPerTon": 520, "basis": "Orbital data only", "breakdown": {"extract": 44, "refine": 24, "store": 14, "deliver": 18}}, {"id": "lantern", "name": "Lantern Ridge", "type": "oxygen", "x": 58.3, "y": 63.6, "blurb": "Near-continuous sunlight along the crest makes it the cheapest place in the region to run power-hungry oxygen extraction.", "quantity": "~300 kt extractable oxygen", "confidence": 81, "costPerTon": 210, "basis": "Orbital spectra, two surface samples", "breakdown": {"extract": 30, "refine": 40, "store": 12, "deliver": 18}}, {"id": "basalt", "name": "Basalt Gate", "type": "oxygen", "x": 27.5, "y": 26.0, "blurb": "Dark basalt plain with oxide-rich regolith. Longer haul to the nearest pad.", "quantity": "~140 kt extractable oxygen", "confidence": 58, "costPerTon": 260, "basis": "Orbital spectra, one surface sample", "breakdown": {"extract": 28, "refine": 36, "store": 11, "deliver": 25}}, {"id": "cinder", "name": "Cinder Plain", "type": "metals", "x": 23.3, "y": 69.0, "blurb": "Ilmenite-bearing basalt. A candidate source of iron and titanium feedstock, with oxygen as a by-product.", "quantity": "~60 kt recoverable iron", "confidence": 55, "costPerTon": 640, "basis": "Orbital spectra, model-derived grade", "breakdown": {"extract": 34, "refine": 46, "store": 6, "deliver": 14}}, {"id": "pale", "name": "Pale Shelf", "type": "helium3", "x": 78.3, "y": 73.5, "blurb": "Highland shelf with a weak helium-3 signal. Concentrations are low and poorly constrained; too uncertain for a Ledger cost.", "quantity": "Trace; not yet bounded", "confidence": 18, "costPerTon": null, "basis": "Model estimate, no direct measurement", "breakdown": null}], "index": {"periods": ["Y1 Q1", "Y1 Q2", "Y1 Q3", "Y1 Q4", "Y2 Q1", "Y2 Q2", "Y2 Q3", "Y2 Q4"], "series": [{"code": "LOX-A", "name": "Liquid oxygen, Grade A", "values": [520, 505, 498, 470, 455, 448, 430, 439]}, {"code": "H2O-W2", "name": "Water feedstock, Grade W2", "values": [610, 600, 585, 590, 560, 548, 541, 529]}, {"code": "O2-L", "name": "Breathing oxygen, Grade L", "values": [720, 715, 700, 690, 688, 670, 662, 668]}, {"code": "FE-M1", "name": "Iron feedstock, Grade M1", "values": [980, 960, 955, 940, 925, 930, 910, 902]}]}, "grades": [{"code": "LOX-A", "product": "Liquid oxygen", "spec": "Flight-grade purity, low moisture", "buyer": "Lander operators"}, {"code": "LOX-B", "product": "Liquid oxygen", "spec": "Industrial purity, non-flight", "buyer": "Surface power, testing"}, {"code": "O2-L", "product": "Gaseous oxygen", "spec": "Breathing-grade, life-support certified", "buyer": "Habitat operators"}, {"code": "H2O-W1", "product": "Water", "spec": "Filtered, potable after treatment", "buyer": "Habitats, research stations"}, {"code": "H2O-W2", "product": "Water", "spec": "Raw feedstock for electrolysis", "buyer": "Refiners"}, {"code": "FE-M1", "product": "Iron feedstock", "spec": "Reduced metal, size-sorted", "buyer": "Fabrication and construction"}]}/* DATA:END */;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    });
    [].concat(children).forEach((c) => c && node.append(c));
    return node;
  };

  const TYPE_LABELS = { water: "Water ice", oxygen: "Oxygen", metals: "Metals", helium3: "Helium-3" };
  const fmtPrice = (v) => "$" + v.toLocaleString("en-US") + "k";
  const pctChange = (values) => {
    const a = values[values.length - 2], b = values[values.length - 1];
    return ((b - a) / a) * 100;
  };
  const fmtChange = (pct) => (pct >= 0 ? "▲ +" : "▼ −") + Math.abs(pct).toFixed(1) + "%";

  /* ======================================================================
     Page chrome (no data needed)
     ====================================================================== */

  // Mobile navigation
  const toggle = $(".nav-toggle");
  const nav = $("#site-nav");
  const setNav = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => setNav(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setNav(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setNav(false); toggle.focus(); }
  });

  // Scroll-spy
  const navLinks = $$('a[href^="#"]:not(.btn)', nav);
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => {
          if (a.getAttribute("href") === "#" + entry.target.id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach((a) => { const s = $(a.getAttribute("href")); if (s) spy.observe(s); });
  }

  // Reveal on scroll
  const revealables = $$(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach((n) => n.classList.add("is-visible"));
  } else {
    $$(".problem-grid, .product-grid, .audience-grid, .flow, .principles, .timeline").forEach((group) => {
      Array.from(group.children).forEach((child, i) => { child.style.transitionDelay = i * 70 + "ms"; });
    });
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    revealables.forEach((n) => io.observe(n));
  }

  // Waitlist form (front-end only)
  const form = $("#waitlist-form");
  const success = $("#form-success");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rules = {
    name: (v) => (v.trim() ? "" : "Please enter your name."),
    email: (v) => (!v.trim() ? "Please enter your email." : emailPattern.test(v.trim()) ? "" : "That email doesn't look right."),
  };
  const validateField = (input) => {
    const msg = rules[input.name](input.value);
    $("#" + input.name + "-err").textContent = msg;
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    return !msg;
  };
  Object.keys(rules).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener("blur", () => { if (input.value) validateField(input); });
    input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true") validateField(input); });
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const invalid = Object.keys(rules).map((n) => form.elements[n]).filter((i) => !validateField(i));
    if (invalid.length) { invalid[0].focus(); return; }
    success.hidden = false;
    success.focus();
    form.reset();
  });
  $("#form-reset").addEventListener("click", () => {
    success.hidden = true;
    form.elements.name.focus();
  });

  // Tabs (WAI-ARIA tabs pattern, automatic activation)
  const tabs = $$('[role="tab"]');
  const selectTab = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab, false));
    tab.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      selectTab(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
    });
  });

  /* ======================================================================
     Data-driven parts
     ====================================================================== */

  async function loadData() {
    try {
      const res = await fetch("data/resources.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (err) {
      if (EMBEDDED_DATA) {
        if (location.protocol === "file:") {
          console.info("[Mare] Opened from file://, using the data embedded in script.js.");
        }
        return EMBEDDED_DATA;
      }
      throw err;
    }
  }

  loadData()
    .then((data) => {
      renderTicker(data);
      renderAtlas(data);
      renderChart(data);
      renderIndexTable(data);
      renderGradesTable(data);
    })
    .catch((err) => console.error("[Mare] Could not load data", err));

  /* ---------- Ticker ---------- */
  function renderTicker(data) {
    const track = $("#ticker-track");
    const items = [];
    data.index.series.forEach((s) => {
      const pct = pctChange(s.values);
      items.push({ code: s.code, price: fmtPrice(s.values[s.values.length - 1]) + "/t", chg: fmtChange(pct), up: pct >= 0 });
    });
    data.sites.filter((s) => s.costPerTon != null).forEach((s) => {
      items.push({ code: s.name.split(" ")[0].toUpperCase() + " · " + TYPE_LABELS[s.type], price: "cost " + fmtPrice(s.costPerTon) + "/t", chg: "", up: true });
    });

    const build = (hidden) => items.map((it) => {
      const li = el("li", hidden ? { "aria-hidden": "true" } : {}, [
        el("span", { class: "tk-code", text: it.code }),
        el("span", { class: "tk-price", text: it.price }),
      ]);
      if (it.chg) li.append(el("span", { class: it.up ? "tk-up" : "tk-down", text: it.chg }));
      return li;
    });

    track.append(...build(false));
    const tickerEl = $(".ticker");
    const toggleBtn = $("#ticker-toggle");

    if (reduceMotion) return; // static, manually scrollable strip
    track.append(...build(true)); // duplicate for a seamless loop
    track.classList.add("is-animated");
    toggleBtn.addEventListener("click", () => {
      const paused = !tickerEl.classList.contains("is-paused");
      tickerEl.classList.toggle("is-paused", paused);
      toggleBtn.setAttribute("aria-pressed", String(paused));
      $(".ticker-toggle-text", toggleBtn).textContent = paused ? "Play" : "Pause";
    });
  }

  /* ---------- Atlas ---------- */
  function renderAtlas(data) {
    const list = $("#map-sites");
    const sites = data.sites;

    sites.forEach((s) => {
      const btn = el("button", {
        type: "button",
        class: "site",
        "data-site": s.id,
        "data-type": s.type,
        "aria-pressed": "false",
        "aria-label": `${s.name}, ${TYPE_LABELS[s.type]}`,
        style: `--x:${s.x}%; --y:${s.y}%`,
      }, [
        el("span", { class: "shape shape-" + s.type, "aria-hidden": "true" }),
        el("span", { class: "site-label", "aria-hidden": "true", text: s.name }),
      ]);
      btn.addEventListener("click", () => select(s.id));
      list.append(el("li", {}, btn));
    });

    function select(id) {
      const s = sites.find((x) => x.id === id);
      $$(".site", list).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.site === id)));

      const kicker = $("#panel-type");
      kicker.replaceChildren(el("span", { class: "shape shape-" + s.type, "aria-hidden": "true" }), TYPE_LABELS[s.type]);
      $("#panel-name").textContent = s.name;
      $("#panel-blurb").textContent = s.blurb;

      $("#panel-stats").hidden = false;
      $("#panel-qty").textContent = s.quantity;
      const level = s.confidence >= 70 ? "High" : s.confidence >= 45 ? "Medium" : "Low";
      $("#panel-conf").textContent = `${level} · ${s.confidence}%`;
      $("#panel-conf-fill").style.width = s.confidence + "%";
      $("#panel-cost").textContent = s.costPerTon == null ? "Not yet priced" : fmtPrice(s.costPerTon) + " / t";
      $("#panel-basis").textContent = s.basis;

      const bd = $("#panel-breakdown");
      if (s.breakdown) {
        bd.hidden = false;
        const bar = $("#breakdown-bar");
        const legend = $("#breakdown-legend");
        bar.replaceChildren();
        legend.replaceChildren();
        Object.entries(s.breakdown).forEach(([k, v]) => {
          const seg = el("span", { class: "seg-" + k });
          seg.style.width = v + "%";
          bar.append(seg);
          legend.append(el("li", {}, [el("i", { class: "seg-" + k, "aria-hidden": "true" }), `${k[0].toUpperCase() + k.slice(1)} ${v}%`]));
        });
      } else {
        bd.hidden = true;
      }
    }

    // Filters
    const chips = $$(".chip");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const f = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        $$(".site", list).forEach((b) => b.classList.toggle("is-muted", f !== "all" && b.dataset.type !== f));
      });
    });

    if (sites.length) select(sites[0].id);
  }

  /* ---------- Price chart (hand-built SVG) ---------- */
  function renderChart(data) {
    const { periods, series } = data.index;
    const NS = "http://www.w3.org/2000/svg";
    const PL = 46, PR = 66, PT = 12, PB = 30;
    const all = series.flatMap((s) => s.values);
    const step = 100;
    const yMin = Math.floor(Math.min(...all) / step) * step;
    const yMax = Math.ceil(Math.max(...all) / step) * step;
    const STYLES = [
      { color: "var(--gray-1)", dash: "" },
      { color: "var(--gray-2)", dash: "6 4" },
      { color: "var(--gray-2)", dash: "2 4" },
      { color: "var(--gray-3)", dash: "10 4 2 4" },
    ];
    const svgEl = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      return n;
    };

    // Drawn at the container's real pixel width so text stays legible on phones,
    // and redrawn when that width changes.
    const chartBox = $("#chart");
    const picker = $("#series-picker");
    let svg, lines, activeCode = series[0].code;

    function draw() {
      const W = Math.max(320, Math.round(chartBox.clientWidth || 720));
      const H = W < 560 ? 240 : 300;
      const labelEvery = W < 560 ? 2 : 1;
      const x = (i) => PL + (i * (W - PL - PR)) / (periods.length - 1);
      const y = (v) => PT + ((yMax - v) * (H - PT - PB)) / (yMax - yMin);

      svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-labelledby": "chart-title chart-desc" });
      const title = svgEl("title", { id: "chart-title" });
      title.textContent = "Illustrative Ledger price index by grade";
      const desc = svgEl("desc", { id: "chart-desc" });
      desc.textContent = series.map((s) => `${s.code} from ${fmtPrice(s.values[0])} to ${fmtPrice(s.values[s.values.length - 1])}`).join("; ") +
        `, over ${periods.length} fictional quarters. Full values are in the Index table tab.`;
      svg.append(title, desc);

      for (let v = yMin; v <= yMax; v += step) {
        svg.append(svgEl("line", { class: "grid", x1: PL, x2: W - PR, y1: y(v), y2: y(v) }));
        const t = svgEl("text", { class: "axis", x: PL - 8, y: y(v) + 4, "text-anchor": "end" });
        t.textContent = "$" + v + "k";
        svg.append(t);
      }
      periods.forEach((p, i) => {
        if ((periods.length - 1 - i) % labelEvery) return; // always keep the latest period
        const t = svgEl("text", { class: "axis", x: x(i), y: H - 8, "text-anchor": "middle" });
        t.textContent = p;
        svg.append(t);
      });

      lines = series.map((s, si) => {
        const st = STYLES[si % STYLES.length];
        const g = svgEl("g", {});
        const d = s.values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
        const path = svgEl("path", { class: "series", d, style: `stroke:${st.color}`, "stroke-dasharray": st.dash });
        const last = s.values.length - 1;
        const dot = svgEl("circle", { class: "end-dot", cx: x(last), cy: y(s.values[last]), r: 3.5, style: `fill:${st.color}` });
        const label = svgEl("text", { class: "end-label", x: x(last) + 9, y: y(s.values[last]) + 4, style: `fill:${st.color}` });
        label.textContent = s.code;
        g.append(path, dot, label);
        svg.append(g);
        return { code: s.code, path, dot, label, color: st.color, g };
      });

      chartBox.replaceChildren(svg);
      applyActive();
    }

    function applyActive() {
      lines.forEach((l) => {
        const on = l.code === activeCode;
        l.path.classList.toggle("is-active", on);
        l.dot.style.fill = on ? "var(--accent)" : l.color;
        l.label.style.fill = on ? "var(--accent)" : l.color;
        if (on) svg.append(l.g); // bring to front
      });
      $$(".series-btn", picker).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.code === activeCode)));
    }
    const setActive = (code) => { activeCode = code; applyActive(); };

    $("#chart-unit").textContent = "Unit: " + data.meta.priceUnit + ". Fictional quarters.";

    // Series picker
    series.forEach((s, si) => {
      const st = STYLES[si % STYLES.length];
      const swatch = document.createElementNS(NS, "svg");
      swatch.setAttribute("width", "22"); swatch.setAttribute("height", "8"); swatch.setAttribute("aria-hidden", "true");
      const ln = svgEl("line", { x1: 1, x2: 21, y1: 4, y2: 4, "stroke-width": 2, "stroke-dasharray": st.dash, style: `stroke:${st.color}` });
      swatch.append(ln);
      const btn = el("button", { type: "button", class: "series-btn", "data-code": s.code, "aria-pressed": "false",
        "aria-label": `${s.code}, ${s.name}, latest ${fmtPrice(s.values[s.values.length - 1])}, ${fmtChange(pctChange(s.values))} on prior quarter` }, [
        swatch,
        el("span", { text: s.code }),
        el("span", { class: "chg", text: fmtChange(pctChange(s.values)) }),
      ]);
      btn.addEventListener("click", () => setActive(s.code));
      picker.append(btn);
    });
    draw();

    // Redraw on width changes (resize, rotation). Skips while the tab is hidden (width 0).
    if ("ResizeObserver" in window) {
      let lastW = chartBox.clientWidth;
      new ResizeObserver(() => {
        const w = chartBox.clientWidth;
        if (w && Math.abs(w - lastW) > 4) { lastW = w; draw(); }
      }).observe(chartBox);
    }
  }

  /* ---------- Tables ---------- */
  function renderIndexTable(data) {
    const { periods, series } = data.index;
    const table = $("#index-table");
    const cap = el("caption", { class: "visually-hidden", text: "Illustrative Ledger index values in " + data.meta.priceUnit });
    const head = el("tr", {}, [el("th", { scope: "col", text: "Grade" })]
      .concat(periods.map((p) => el("th", { scope: "col", class: "num-cell", text: p })))
      .concat(el("th", { scope: "col", class: "num-cell", text: "Q/Q" })));
    const body = series.map((s) => el("tr", {}, [el("th", { scope: "row" }, el("span", { class: "grade-code", text: s.code }))]
      .concat(s.values.map((v, i) => el("td", { class: "num-cell" + (i === s.values.length - 1 ? " latest" : ""), text: fmtPrice(v) })))
      .concat(el("td", { class: "num-cell", text: fmtChange(pctChange(s.values)) }))));
    table.append(cap, el("thead", {}, head), el("tbody", {}, body));
  }

  function renderGradesTable(data) {
    const latest = Object.fromEntries(data.index.series.map((s) => [s.code, s.values[s.values.length - 1]]));
    const table = $("#grades-table");
    const cap = el("caption", { class: "visually-hidden", text: "Illustrative quality grades" });
    const head = el("tr", {}, ["Grade", "Product", "Specification", "Typical buyer"].map((h) => el("th", { scope: "col", text: h }))
      .concat(el("th", { scope: "col", class: "num-cell", text: "Index (latest)" })));
    const body = data.grades.map((g) => el("tr", {}, [
      el("th", { scope: "row" }, el("span", { class: "grade-code", text: g.code })),
      el("td", { text: g.product }),
      el("td", { text: g.spec }),
      el("td", { text: g.buyer }),
      el("td", { class: "num-cell", text: latest[g.code] ? fmtPrice(latest[g.code]) : "—" }),
    ]));
    table.append(cap, el("thead", {}, head), el("tbody", {}, body));
  }
})();
