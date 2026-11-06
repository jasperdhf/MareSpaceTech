/* Mare — the resource atlas as a 3D relief model.
 *
 * Builds a height field of the fictional Austral Reach that matches the flat map
 * (assets/atlas-map.svg): deep bowls at Nightglass Crater and Coldwell Hollow, a
 * raised Lantern Ridge, lower basalt plains, a higher highland shelf. A low polar
 * sun casts real shadows, so the crater floors stay dark.
 *
 * The site markers are still the HTML buttons that script.js creates; this file
 * only moves them each frame to follow the terrain, so clicking, filters, keyboard
 * and screen-reader access keep working. If Three.js or WebGL is unavailable, the
 * flat map stays.
 *
 * Coordinates: everything is described in the flat map's 600 × 600 pixel space,
 * the same space as data/resources.json (x and y as percentages of it).
 */
(function () {
  "use strict";

  const wrap = document.querySelector(".map-wrap");
  const flatMap = wrap && wrap.querySelector(".map-img");
  if (!wrap || !window.THREE) return;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;

  const THREE = window.THREE;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Map pixel space → model units. The disc of the map (radius 286px) becomes radius 1.
  const C = 300, R = 286;
  const toUnit = (px) => (px - C) / R;

  /* ---------- Terrain height field ---------- */
  let seed = 21;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Smooth value noise for gentle undulation.
  const LAT = 64, grid = [];
  for (let i = 0; i < (LAT + 1) * (LAT + 1); i++) grid.push(rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  function valueNoise(x, y) { // x, y in 0..LAT
    const xi = Math.min(Math.floor(x), LAT - 1), yi = Math.min(Math.floor(y), LAT - 1);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const g = (a, b) => grid[b * (LAT + 1) + a];
    const top = g(xi, yi) * (1 - xf) + g(xi + 1, yi) * xf;
    const bot = g(xi, yi + 1) * (1 - xf) + g(xi + 1, yi + 1) * xf;
    return top * (1 - yf) + bot * yf;
  }

  // Craters in map pixels: [x, y, radius]. The first two have permanently shadowed floors.
  const BIG = [[250, 285, 62], [385, 205, 40]];
  const FIXED = [[470, 300, 18], [200, 470, 14], [330, 500, 22], [480, 140, 12], [90, 270, 16], [300, 90, 20]];
  const SMALL = [];
  while (SMALL.length < 170) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 270;
    const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, r = 2.5 + 10 * Math.pow(rand(), 2.2);
    if (BIG.concat(FIXED).some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br + r + 3)) continue;
    SMALL.push([x, y, r]);
  }
  const CRATERS = BIG.concat(FIXED, SMALL);
  const RIDGE = [[266, 400], [306, 384], [344, 382], [384, 388], [416, 372]];

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // Height in model units at map pixel (px, py). Vertical scale is exaggerated.
  function height(px, py) {
    let h = 0.0045 * (valueNoise((px / 600) * LAT, (py / 600) * LAT) - 0.5)
          + 0.012 * (valueNoise((px / 600) * LAT * 0.18 + 7, (py / 600) * LAT * 0.18 + 3) - 0.5);
    // basalt plains sit lower, the highland shelf higher
    h -= 0.018 * Math.exp(-(((px - 155) / 70) ** 2 + ((py - 150) / 48) ** 2));
    h -= 0.018 * Math.exp(-(((px - 140) / 80) ** 2 + ((py - 420) / 58) ** 2));
    h += 0.03 * Math.exp(-(((px - 470) / 70) ** 2 + ((py - 445) / 52) ** 2));
    // Lantern Ridge
    let dRidge = Infinity;
    for (let i = 0; i < RIDGE.length - 1; i++) {
      dRidge = Math.min(dRidge, distToSegment(px, py, RIDGE[i][0], RIDGE[i][1], RIDGE[i + 1][0], RIDGE[i + 1][1]));
    }
    h += 0.05 * Math.exp(-((dRidge / 11) ** 2));
    // craters: a bowl below the surface and a raised rim around it
    for (const [cx, cy, r] of CRATERS) {
      const dx = px - cx, dy = py - cy;
      if (Math.abs(dx) > r * 1.6 || Math.abs(dy) > r * 1.6) continue;
      const d = Math.hypot(dx, dy) / r;
      const depth = 0.42 * (r / R);
      if (d < 1) h += depth * (d * d - 1);
      h += 0.32 * depth * Math.exp(-(((d - 1) / 0.22) ** 2));
    }
    // ease to flat at the rim of the disc
    const rr = Math.hypot(px - C, py - C) / R;
    if (rr > 0.94) h *= Math.max(0, 1 - (rr - 0.94) / 0.06);
    return h;
  }

  /* ---------- Surface colour ---------- */
  function buildTexture() {
    const S = 1024, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d");
    const toCanvas = (px) => ((px - C) / R + 1) * (S / 2);
    const k = S / 2 / R; // canvas px per map px

    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#8f8c86"; ctx.fillRect(0, 0, S, S);
    [[24, 0.26], [96, 0.16], [384, 0.12]].forEach(([n, a]) => {
      const small = document.createElement("canvas");
      small.width = small.height = n;
      const sctx = small.getContext("2d"), img = sctx.createImageData(n, n);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = Math.floor(rand() * 255);
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, S, S);
    });
    ctx.globalAlpha = 1;
    const soft = (x, y, rx, ry, color) => {
      ctx.save(); ctx.translate(toCanvas(x), toCanvas(y)); ctx.scale(rx * k, ry * k);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    soft(155, 150, 80, 56, "rgba(40,39,36,.6)");
    soft(140, 420, 90, 66, "rgba(40,39,36,.6)");
    soft(470, 445, 74, 54, "rgba(235,232,226,.32)");
    BIG.forEach(([x, y, r]) => soft(x, y, r * 0.85, r * 0.85, "rgba(16,16,16,.8)"));
    ctx.restore();

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  /* ---------- Scene ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const el = renderer.domElement;
  el.className = "atlas-canvas";
  el.tabIndex = 0;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "3D model of the made-up Austral Reach. Drag or use the arrow keys to spin it. Use the site buttons to see each site's details.");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  const N = 220;
  const geo = new THREE.PlaneGeometry(2, 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.hypot(x, z) <= 1.02 ? height(x * R + C, z * R + C) : 0);
  }
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: buildTexture(), roughness: 1, metalness: 0, alphaTest: 0.5, transparent: false,
  }));
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A dark plinth under the disc, so the cut edge reads as a model on a table.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.04, 0.06, 128, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 1, side: THREE.DoubleSide }));
  plinth.position.y = -0.03;
  scene.add(plinth);

  // Latitude rings at 88°, 86° and 84°S, draped over the terrain.
  [95, 190, 284].forEach((rpx) => {
    const pts = [];
    for (let a = 0; a <= 256; a++) {
      const t = (a / 256) * Math.PI * 2;
      const px = C + Math.cos(t) * rpx, py = C + Math.sin(t) * rpx;
      pts.push(new THREE.Vector3(toUnit(px), height(px, py) + 0.006, toUnit(py)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xeceae4, dashSize: 0.012, gapSize: 0.028, transparent: true, opacity: 0.45 }));
    line.computeLineDistances();
    scene.add(line);
  });

  // Low polar sun: long shadows, crater floors that never see light. Faint blue fill.
  const sun = new THREE.DirectionalLight(0xfffaf0, 2.1);
  sun.position.set(-2.9, 0.62, 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.1, far: 8 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9db3dc, 0x15181d, 0.32));

  /* ---------- Site markers (the HTML buttons from script.js) ---------- */
  let markers = [];
  const stemMat = new THREE.LineBasicMaterial({ color: 0xf3f1ec, transparent: true, opacity: 0.75 });
  function attachSites(data) {
    if (markers.length || !data || !data.sites) return;
    const list = wrap.querySelector(".map-sites");
    markers = data.sites.map((s) => {
      const px = (s.x / 100) * 600, py = (s.y / 100) * 600;
      const base = new THREE.Vector3(toUnit(px), height(px, py), toUnit(py));
      const top = base.clone().add(new THREE.Vector3(0, 0.085, 0));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), stemMat));
      return { button: list.querySelector(`[data-site="${s.id}"]`), top };
    }).filter((m) => m.button);
    requestFrame();
  }
  const v = new THREE.Vector3();
  function placeMarkers() {
    markers.forEach(({ button, top }) => {
      v.copy(top).project(camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      button.style.setProperty("--x", ((v.x + 1) / 2) * 100 + "%");
      button.style.setProperty("--y", ((1 - v.y) / 2) * 100 + "%");
      button.style.visibility = off ? "hidden" : "";
    });
  }

  /* ---------- Orbit controls ---------- */
  let azimuth = 0.35, elevation = 0.95; // radians
  let vAz = 0, vEl = 0, dragging = false, lastX = 0, lastY = 0, lastInput = 0;
  const AUTO = reduceMotion ? 0 : 0.0012;
  const clampEl = (e) => Math.max(0.32, Math.min(1.45, e));
  function placeCamera() {
    const d = 4.3;
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * d, Math.sin(elevation) * d, Math.cos(azimuth) * Math.cos(elevation) * d);
    camera.lookAt(0, -0.02, 0);
  }

  el.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; vAz = vEl = 0;
    el.setPointerCapture(e.pointerId); el.classList.add("is-dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const k = 3.4 / Math.max(el.clientWidth, 200);
    vAz = -(e.clientX - lastX) * k; vEl = (e.clientY - lastY) * k;
    lastX = e.clientX; lastY = e.clientY;
    azimuth += vAz; elevation = clampEl(elevation + vEl);
    lastInput = performance.now(); requestFrame();
  });
  const endDrag = () => { dragging = false; el.classList.remove("is-dragging"); lastInput = performance.now(); };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: [0.16, 0], ArrowRight: [-0.16, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
    if (!moves[e.key]) return;
    e.preventDefault();
    azimuth += moves[e.key][0]; elevation = clampEl(elevation + moves[e.key][1]);
    vAz = vEl = 0; lastInput = performance.now(); requestFrame();
  });

  /* ---------- Render loop (only while visible) ---------- */
  let visible = true, raf = 0;
  function frame(now) {
    raf = 0;
    if (!dragging) {
      vAz *= 0.93; vEl *= 0.88;
      azimuth += vAz; elevation = clampEl(elevation + vEl);
      if (now - lastInput > 3000) azimuth += AUTO;
    }
    placeCamera();
    renderer.render(scene, camera);
    placeMarkers();
    const moving = dragging || Math.abs(vAz) > 1e-4 || Math.abs(vEl) > 1e-4 || AUTO > 0;
    if (visible && moving) requestFrame();
  }
  function requestFrame() { if (!raf && visible) raf = requestAnimationFrame(frame); }
  function resize() {
    const w = Math.round(wrap.clientWidth), h = Math.round(wrap.clientHeight);
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestFrame();
  }

  // Swap the flat map for the model.
  wrap.insertBefore(el, wrap.querySelector(".map-sites"));
  if (flatMap) flatMap.hidden = true;
  wrap.classList.add("is-3d");
  const caption = document.querySelector(".plate-caption");
  if (caption) caption.textContent = "3D model of the Austral Reach. Heights are stretched so they're easy to see. Drag to spin it. Example data.";
  resize();

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(wrap);
  else window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && !document.hidden; requestFrame(); }).observe(wrap);
  }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; requestFrame(); });

  if (window.MARE_DATA) attachSites(window.MARE_DATA);
  document.addEventListener("mare:data", (e) => attachSites(e.detail));
  requestFrame();
})();
