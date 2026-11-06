/* Mare — the resource atlas as a 3D globe.
 *
 * A full Moon you can spin, with the fictional Austral Reach at the south pole.
 * At true scale the region would be a speck, so it's stretched over the bottom
 * CAP degrees of the sphere. Its relief matches the flat map (assets/atlas-map.svg):
 * deep bowls at Nightglass Crater and Coldwell Hollow, a raised Lantern Ridge,
 * lower dark plains and a higher shelf. A low sun casts real shadows.
 *
 * The rest of the surface comes from moon-surface.js. The site markers are still
 * the HTML buttons that script.js creates; this file moves them every frame to
 * follow the globe and hides the ones on the far side, so clicking, filters,
 * keyboard and screen-reader access keep working. If Three.js or WebGL is
 * unavailable, the flat map stays.
 *
 * Coordinates: the region is described in the flat map's 600 × 600 pixel space,
 * the same space as data/resources.json (site x and y are percentages of it).
 */
(function () {
  "use strict";

  const wrap = document.querySelector(".map-wrap");
  const flatMap = wrap && wrap.querySelector(".map-img");
  if (!wrap || !window.THREE || !window.MareSurface) return;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;

  const THREE = window.THREE;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Map space <-> sphere ---------- */
  const C = 300, R = 286;     // centre and radius of the region on the flat map, in px
  const CAP = 50;             // degrees from the south pole the region is stretched over
  const K = 0.75;             // height exaggeration on the globe
  const DEG = Math.PI / 180;

  // Sphere convention matches THREE.SphereGeometry: theta from +y (north), phi around.
  function unitFromAngles(theta, phi) {
    return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  }
  // Flat-map pixel -> (theta, phi) on the sphere.
  function mapToAngles(px, py) {
    const dx = px - C, dy = py - C;
    const latDeg = -90 + (Math.hypot(dx, dy) / R) * CAP;
    let phi = Math.atan2(dx, -dy);
    if (phi < 0) phi += Math.PI * 2;
    return { theta: (90 - latDeg) * DEG, phi };
  }
  // (theta, phi) -> flat-map pixel, or null outside the region.
  function anglesToMap(theta, phi) {
    const fromPole = 180 - theta / DEG;           // degrees from the south pole
    if (fromPole > CAP) return null;
    const r = (fromPole / CAP) * R;
    return [C + r * Math.sin(phi), C - r * Math.cos(phi)];
  }

  /* ---------- Region height field (flat-map pixel space) ---------- */
  let seed = 21;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const LAT = 48, grid = [];
  for (let i = 0; i < (LAT + 1) * (LAT + 1); i++) grid.push(rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  function valueNoise(x, y) {
    const xi = Math.max(0, Math.min(Math.floor(x), LAT - 1)), yi = Math.max(0, Math.min(Math.floor(y), LAT - 1));
    const xf = smooth(Math.min(1, Math.max(0, x - xi))), yf = smooth(Math.min(1, Math.max(0, y - yi)));
    const g = (a, b) => grid[b * (LAT + 1) + a];
    return (g(xi, yi) * (1 - xf) + g(xi + 1, yi) * xf) * (1 - yf) + (g(xi, yi + 1) * (1 - xf) + g(xi + 1, yi + 1) * xf) * yf;
  }

  // Craters in map pixels: [x, y, radius]. The first two have permanently shadowed floors.
  const BIG = [[250, 285, 62], [385, 205, 40]];
  const FIXED = [[470, 300, 18], [200, 470, 14], [330, 500, 22], [480, 140, 12], [90, 270, 16], [300, 90, 20]];
  const CRATERS = BIG.concat(FIXED);
  const RIDGE = [[266, 400], [306, 384], [344, 382], [384, 388], [416, 372]];

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function height(px, py) {
    let h = 0.012 * (valueNoise((px / 600) * LAT * 0.2 + 7, (py / 600) * LAT * 0.2 + 3) - 0.5);
    h -= 0.018 * Math.exp(-(((px - 155) / 70) ** 2 + ((py - 150) / 48) ** 2));   // Basalt Gate plain
    h -= 0.018 * Math.exp(-(((px - 140) / 80) ** 2 + ((py - 420) / 58) ** 2));   // Cinder Plain
    h += 0.03 * Math.exp(-(((px - 470) / 70) ** 2 + ((py - 445) / 52) ** 2));    // Pale Shelf
    let dRidge = Infinity;
    for (let i = 0; i < RIDGE.length - 1; i++) {
      dRidge = Math.min(dRidge, distToSegment(px, py, RIDGE[i][0], RIDGE[i][1], RIDGE[i + 1][0], RIDGE[i + 1][1]));
    }
    h += 0.05 * Math.exp(-((dRidge / 11) ** 2));                                    // Lantern Ridge
    for (const [cx, cy, r] of CRATERS) {
      const dx = px - cx, dy = py - cy;
      if (Math.abs(dx) > r * 1.6 || Math.abs(dy) > r * 1.6) continue;
      const d = Math.hypot(dx, dy) / r;
      const depth = 0.42 * (r / R);
      if (d < 1) h += depth * (d * d - 1);
      h += 0.32 * depth * Math.exp(-(((d - 1) / 0.22) ** 2));
    }
    const rr = Math.hypot(px - C, py - C) / R;                                       // blend into the globe
    if (rr > 0.9) h *= Math.max(0, 1 - (rr - 0.9) / 0.1);
    return h;
  }
  const radiusAt = (px, py) => 1 + height(px, py) * K;

  /* ---------- Textures ---------- */
  function buildTextures() {
    const { color, bump, W, H } = window.MareSurface.build({ surveyRings: false, seed: 11 });

    // Region overlay drawn in flat-map space, then wrapped onto the polar cap.
    const S = 1024, k = S / 600;
    const over = document.createElement("canvas");
    over.width = over.height = S;
    const o = over.getContext("2d");
    const soft = (x, y, rx, ry, col) => {
      o.save(); o.translate(x * k, y * k); o.scale(rx * k, ry * k);
      const g = o.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g; o.beginPath(); o.arc(0, 0, 1, 0, Math.PI * 2); o.fill(); o.restore();
    };
    // regolith grain near the pole, where the shared texture is smoothed
    const n = 160, tile = document.createElement("canvas");
    tile.width = tile.height = n;
    const tctx = tile.getContext("2d"), img = tctx.createImageData(n, n);
    for (let p = 0; p < img.data.length; p += 4) {
      const val = 110 + Math.floor(rand() * 70);
      img.data[p] = img.data[p + 1] = img.data[p + 2] = val; img.data[p + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    o.save();
    o.beginPath(); o.arc(C * k, C * k, R * 0.75 * k, 0, Math.PI * 2); o.clip();
    o.globalAlpha = 0.85; o.imageSmoothingEnabled = true; o.drawImage(tile, 0, 0, S, S);
    o.restore();
    o.globalCompositeOperation = "destination-in";
    const fade = o.createRadialGradient(C * k, C * k, R * 0.45 * k, C * k, C * k, R * 0.75 * k);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
    o.fillStyle = fade; o.fillRect(0, 0, S, S);
    o.globalCompositeOperation = "source-over";
    soft(155, 150, 80, 56, "rgba(40,39,36,.65)");
    soft(140, 420, 90, 66, "rgba(40,39,36,.65)");
    soft(470, 445, 74, 54, "rgba(235,232,226,.35)");
    // permanently shadowed crater floors: solid dark, soft edge
    BIG.forEach(([x, y, r]) => {
      const g = o.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * 0.9 * k);
      g.addColorStop(0, "rgba(10,10,12,.95)"); g.addColorStop(0.7, "rgba(10,10,12,.9)"); g.addColorStop(1, "rgba(10,10,12,0)");
      o.fillStyle = g; o.beginPath(); o.arc(x * k, y * k, r * 0.9 * k, 0, Math.PI * 2); o.fill();
    });

    // Bump detail for the region, also drawn in flat-map space so it doesn't pinch at
    // the pole: neutral grey (the relief comes from the geometry) plus small craters.
    const bOver = document.createElement("canvas");
    bOver.width = bOver.height = S;
    const bo = bOver.getContext("2d");
    bo.fillStyle = "rgb(128,128,128)";
    bo.beginPath(); bo.arc(C * k, C * k, R * k, 0, Math.PI * 2); bo.fill();
    let placed = 0;
    while (placed < 190) {
      const a = rand() * Math.PI * 2, dist = Math.sqrt(rand()) * R * 0.9;
      const x = C + Math.cos(a) * dist, y = C + Math.sin(a) * dist, r = 2 + 9 * Math.pow(rand(), 2.4);
      if (CRATERS.some(([cx, cy, cr]) => Math.hypot(x - cx, y - cy) < cr + r + 2)) continue;
      const g = bo.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * 1.35 * k);
      [[0, "rgba(55,55,55,.75)"], [0.55, "rgba(90,90,90,.55)"], [0.78, "rgba(185,185,185,.6)"], [0.92, "rgba(150,150,150,.25)"], [1, "rgba(128,128,128,0)"]]
        .forEach(([s, c]) => g.addColorStop(s, c));
      bo.fillStyle = g; bo.beginPath(); bo.arc(x * k, y * k, r * 1.35 * k, 0, Math.PI * 2); bo.fill();
      placed++;
    }
    // fade the overlay out toward the edge of the region so it blends into the globe
    bo.globalCompositeOperation = "destination-in";
    const bfade = bo.createRadialGradient(C * k, C * k, R * 0.8 * k, C * k, C * k, R * k);
    bfade.addColorStop(0, "rgba(0,0,0,1)"); bfade.addColorStop(1, "rgba(0,0,0,0)");
    bo.fillStyle = bfade; bo.fillRect(0, 0, S, S);

    // Wrap both overlays onto the polar cap of the equirectangular maps.
    const y0 = Math.floor(((180 - CAP) / 180) * H);
    function wrapOnto(target, overlay) {
      const od = overlay.getContext("2d").getImageData(0, 0, S, S).data;
      const ctx = target.getContext("2d");
      const region = ctx.getImageData(0, y0, W, H - y0);
      const d = region.data;
      for (let row = 0; row < H - y0; row++) {
        const theta = ((y0 + row + 0.5) / H) * Math.PI;
        for (let col = 0; col < W; col++) {
          const m = anglesToMap(theta, ((col + 0.5) / W) * Math.PI * 2);
          if (!m) continue;
          const sx = Math.min(S - 1, Math.max(0, Math.round(m[0] * k))), sy = Math.min(S - 1, Math.max(0, Math.round(m[1] * k)));
          const si = (sy * S + sx) * 4, a = od[si + 3] / 255;
          if (!a) continue;
          const di = (row * W + col) * 4;
          d[di] = d[di] * (1 - a) + od[si] * a;
          d[di + 1] = d[di + 1] * (1 - a) + od[si + 1] * a;
          d[di + 2] = d[di + 2] * (1 - a) + od[si + 2] * a;
        }
      }
      ctx.putImageData(region, 0, y0);
    }
    wrapOnto(color, over);
    wrapOnto(bump, bOver);

    const map = new THREE.CanvasTexture(color);
    const bumpMap = new THREE.CanvasTexture(bump);
    [map, bumpMap].forEach((t) => { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; });
    map.encoding = THREE.sRGBEncoding;
    return { map, bumpMap };
  }

  /* ---------- Globe geometry: displace the polar cap ---------- */
  const geo = new THREE.SphereGeometry(1, 384, 192);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const theta = (1 - uv.getY(i)) * Math.PI, phi = uv.getX(i) * Math.PI * 2;
    const m = anglesToMap(theta, phi);
    if (!m) continue;
    const r = radiusAt(m[0], m[1]);
    pos.setXYZ(i, pos.getX(i) * r, pos.getY(i) * r, pos.getZ(i) * r);
  }
  geo.computeVertexNormals();
  // Vertices along the seam and at the poles are duplicated; average their normals.
  (function weldNormals() {
    const nrm = geo.attributes.normal, groups = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const acc = new THREE.Vector3();
    groups.forEach((ids) => {
      if (ids.length < 2) return;
      acc.set(0, 0, 0);
      ids.forEach((i) => { acc.x += nrm.getX(i); acc.y += nrm.getY(i); acc.z += nrm.getZ(i); });
      acc.normalize();
      ids.forEach((i) => nrm.setXYZ(i, acc.x, acc.y, acc.z));
    });
    nrm.needsUpdate = true;
  })();

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
  el.setAttribute("aria-label", "3D Moon with the made-up Austral Reach at the south pole. Drag or use the arrow keys to spin it. Use the site buttons to see each site's details.");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 5.3);

  const { map, bumpMap } = buildTextures();
  const moon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.016, roughness: 1, metalness: 0 }));
  moon.castShadow = true;
  moon.receiveShadow = true;
  const tilt = new THREE.Group();
  tilt.add(moon);
  scene.add(tilt);

  // Latitude rings around the region, draped over the relief.
  [95, 190, 284].forEach((rpx) => {
    const pts = [];
    for (let a = 0; a <= 256; a++) {
      const t = (a / 256) * Math.PI * 2;
      const px = C + Math.sin(t) * rpx, py = C - Math.cos(t) * rpx;
      const { theta, phi } = mapToAngles(px, py);
      pts.push(unitFromAngles(theta, phi).multiplyScalar(radiusAt(px, py) + 0.004));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xeceae4, dashSize: 0.012, gapSize: 0.028, transparent: true, opacity: 0.5 }));
    line.computeLineDistances();
    moon.add(line);
  });

  // Low sun from the side: long shadows across the polar region. Faint blue earthshine.
  const sun = new THREE.DirectionalLight(0xfffaf0, 2.2);
  sun.position.set(-3.4, 0.55, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 10 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.012;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9db3dc, 0x15181d, 0.16));

  /* ---------- Site markers (the HTML buttons from script.js) ---------- */
  let markers = [];
  const stemMat = new THREE.LineBasicMaterial({ color: 0xf3f1ec, transparent: true, opacity: 0.8 });
  function attachSites(data) {
    if (markers.length || !data || !data.sites) return;
    const list = wrap.querySelector(".map-sites");
    markers = data.sites.map((s) => {
      const px = (s.x / 100) * 600, py = (s.y / 100) * 600;
      const { theta, phi } = mapToAngles(px, py);
      const normal = unitFromAngles(theta, phi);
      const base = normal.clone().multiplyScalar(radiusAt(px, py));
      const top = normal.clone().multiplyScalar(radiusAt(px, py) + 0.07);
      moon.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), stemMat));
      return { button: list.querySelector(`[data-site="${s.id}"]`), top, normal };
    }).filter((m) => m.button);
    requestFrame();
  }
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), toCam = new THREE.Vector3(), q = new THREE.Quaternion();
  function placeMarkers() {
    moon.updateMatrixWorld();
    moon.getWorldQuaternion(q);
    markers.forEach(({ button, top, normal }) => {
      v.copy(top).applyMatrix4(moon.matrixWorld);
      nv.copy(normal).applyQuaternion(q);
      toCam.copy(camera.position).sub(v).normalize();
      const facing = nv.dot(toCam) > 0.12;
      v.project(camera);
      button.style.setProperty("--x", ((v.x + 1) / 2) * 100 + "%");
      button.style.setProperty("--y", ((1 - v.y) / 2) * 100 + "%");
      button.style.visibility = facing ? "" : "hidden";
    });
  }

  /* ---------- Spin controls ---------- */
  let yaw = 2.2, pitch = -1.3;      // start tipped so the south pole faces you
  let vYaw = 0, vPitch = 0, dragging = false, lastX = 0, lastY = 0, lastInput = 0;
  const AUTO = reduceMotion ? 0 : 0.0012;
  const clampPitch = (p) => Math.max(-1.5, Math.min(1.5, p));

  el.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; vYaw = vPitch = 0;
    el.setPointerCapture(e.pointerId); el.classList.add("is-dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const k = 3.2 / Math.max(el.clientWidth, 200);
    vYaw = (e.clientX - lastX) * k; vPitch = (e.clientY - lastY) * k;
    lastX = e.clientX; lastY = e.clientY;
    yaw += vYaw; pitch = clampPitch(pitch + vPitch);
    lastInput = performance.now(); requestFrame();
  });
  const endDrag = () => { dragging = false; el.classList.remove("is-dragging"); lastInput = performance.now(); };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("keydown", (e) => {
    const step = 0.18;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!moves[e.key]) return;
    e.preventDefault();
    yaw += moves[e.key][0]; pitch = clampPitch(pitch + moves[e.key][1]);
    vYaw = vPitch = 0; lastInput = performance.now(); requestFrame();
  });

  /* ---------- Render loop (only while visible) ---------- */
  let visible = true, raf = 0;
  function frame(now) {
    raf = 0;
    if (!dragging) {
      vYaw *= 0.94; vPitch *= 0.9;
      yaw += vYaw; pitch = clampPitch(pitch + vPitch);
      if (now - lastInput > 3000) yaw += AUTO;
    }
    tilt.rotation.x = pitch;
    moon.rotation.y = yaw;
    renderer.render(scene, camera);
    placeMarkers();
    const moving = dragging || Math.abs(vYaw) > 1e-4 || Math.abs(vPitch) > 1e-4 || AUTO > 0;
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

  // Swap the flat map for the globe.
  wrap.insertBefore(el, wrap.querySelector(".map-sites"));
  if (flatMap) flatMap.hidden = true;
  wrap.classList.add("is-3d");
  const caption = document.querySelector(".plate-caption");
  if (caption) caption.textContent = "The Moon, with the Austral Reach at the south pole. The region's size and heights are stretched so they're easy to see. Drag to spin it. Example data.";
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
