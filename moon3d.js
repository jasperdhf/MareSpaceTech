/* Mare — the hero Moon as a 3D globe you can turn.
 *
 * Uses Three.js (r128, loaded from cdnjs in index.html). The surface is generated
 * here: a colour map (regolith, basalt plains, craters, survey rings near the south
 * pole) and a matching bump map, so crater shading moves correctly with the light.
 *
 * Drag to turn it, or focus it and use the arrow keys. It turns slowly on its own
 * when idle, except for people who prefer reduced motion. If WebGL or Three.js is
 * unavailable, the static image in the HTML stays in place.
 */
(function () {
  "use strict";

  const host = document.querySelector(".hero-moon");
  const fallback = host && host.querySelector("img");
  if (!host || !window.THREE) return;

  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;

  const THREE = window.THREE;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Surface textures ---------- */
  const W = 2048, H = 1024;

  // Small seeded RNG so the Moon looks the same on every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // Fractal-ish noise: random grey pixels at several sizes, smoothly upscaled.
  function noiseLayer(ctx, sizes, strength) {
    sizes.forEach(([w, h], i) => {
      const small = canvas(w, h);
      const sctx = small.getContext("2d");
      const img = sctx.createImageData(w, h);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = Math.floor(rand() * 255);
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = strength / (i + 1.4);
      ctx.drawImage(small, 0, 0, W, H);
      // repeat across the seam so the texture wraps without a visible line
      ctx.drawImage(small, -W, 0, W, H);
    });
    ctx.globalAlpha = 1;
  }

  // Soft radial blob, stretched horizontally by latitude (equirectangular map).
  function blob(ctx, x, y, r, stops) {
    const lat = (0.5 - y / H) * Math.PI;
    const sx = 1 / Math.max(Math.cos(lat), 0.25);
    [x, x - W, x + W].forEach((cx) => {
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(sx, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function buildTextures() {
    const color = canvas(W, H), bump = canvas(W, H);
    const c = color.getContext("2d"), b = bump.getContext("2d");

    // Base regolith
    c.fillStyle = "#8c8983"; c.fillRect(0, 0, W, H);
    noiseLayer(c, [[32, 16], [96, 48], [256, 128], [1024, 512]], 0.32);
    b.fillStyle = "#808080"; b.fillRect(0, 0, W, H);
    noiseLayer(b, [[128, 64], [512, 256], [2048, 1024]], 0.35);

    // Basalt plains (maria): darker and smoother
    const maria = [[520, 330, 210], [700, 420, 160], [380, 470, 140], [860, 300, 120], [1500, 380, 180], [1650, 520, 110], [1200, 600, 90]];
    maria.forEach(([x, y, r]) => {
      blob(c, x, y, r, [[0, "rgba(46,45,42,.62)"], [0.65, "rgba(46,45,42,.38)"], [1, "rgba(46,45,42,0)"]]);
      blob(b, x, y, r * 0.9, [[0, "rgba(128,128,128,.5)"], [1, "rgba(128,128,128,0)"]]);
    });

    // Craters: many small, few large. Bump: depressed floor, raised rim.
    function crater(x, y, r, shadowed) {
      blob(c, x, y, r * 1.2, [[0, shadowed ? "rgba(18,18,18,.85)" : "rgba(70,68,64,.12)"], [0.7, "rgba(70,68,64,.05)"], [0.84, "rgba(220,217,210,.07)"], [1, "rgba(220,217,210,0)"]]);
      // gentle bowl and a soft raised rim, so craters read as dents, not bubbles
      blob(b, x, y, r * 1.35, [[0, "rgba(55,55,55,.75)"], [0.55, "rgba(90,90,90,.55)"], [0.78, "rgba(185,185,185,.6)"], [0.92, "rgba(150,150,150,.25)"], [1, "rgba(128,128,128,0)"]]);
    }
    for (let i = 0; i < 1600; i++) {
      const r = 1.2 + 24 * Math.pow(rand(), 6);
      const y = H * (0.06 + 0.88 * Math.acos(1 - 2 * rand()) / Math.PI); // uniform over the sphere
      crater(rand() * W, y, r, false);
    }
    // A few young craters with bright ray systems
    [[1080, 700, 26], [420, 260, 20], [1760, 300, 18]].forEach(([x, y, r]) => {
      for (let k = 0; k < 14; k++) {
        const a = rand() * Math.PI * 2, len = r * (4 + rand() * 6);
        c.strokeStyle = "rgba(230,227,220,.10)"; c.lineWidth = 2 + rand() * 3;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len * 1.4, y + Math.sin(a) * len); c.stroke();
      }
      blob(c, x, y, r * 2.2, [[0, "rgba(235,232,226,.35)"], [1, "rgba(235,232,226,0)"]]);
      crater(x, y, r, false);
    });

    // Equirectangular maps pinch at the poles: every column meets at one point, so any
    // detail that varies along x turns into spokes. Near each pole, blend toward a copy
    // of the band averaged along x (detail varying only along y becomes soft rings).
    function smearPole(srcCanvas, ctx, from, to) {
      const y0 = Math.min(from, to) * H, h = Math.abs(to - from) * H;
      const thin = canvas(1, Math.ceil(h));
      thin.getContext("2d").drawImage(srcCanvas, 0, y0, W, h, 0, 0, 1, h);
      const band = canvas(W, Math.ceil(h));
      const bctx = band.getContext("2d");
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(thin, 0, 0, W, h);
      // mask: transparent at `from` (keep original), opaque toward the pole
      bctx.globalCompositeOperation = "destination-in";
      const g = bctx.createLinearGradient(0, from < to ? 0 : h, 0, from < to ? h : 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.75, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, W, h);
      ctx.drawImage(band, 0, y0);
    }
    smearPole(color, c, 0.12, 0);   // north
    smearPole(color, c, 0.86, 1);   // south
    // The bump map would turn the smeared bands into ridged rings, so flatten it instead.
    [[0.12, 0.03], [0.86, 0.95]].forEach(([from, to]) => {
      const g = b.createLinearGradient(0, from * H, 0, to * H);
      g.addColorStop(0, "rgba(128,128,128,0)");
      g.addColorStop(1, "rgba(128,128,128,1)");
      b.fillStyle = g;
      b.fillRect(0, Math.min(from, to) * H, W, Math.abs(to - from) * H);
      b.fillStyle = "rgb(128,128,128)";
      b.fillRect(0, to < from ? 0 : to * H, W, to < from ? to * H : H - to * H);
    });

    // South polar region: deep craters with permanently shadowed floors, circled by
    // Mare's survey marks. Drawn after the pole smoothing so they stay crisp.
    const south = [[300, 852, 30], [760, 862, 26], [1290, 850, 34], [1720, 858, 24]];
    south.forEach(([x, y, r]) => crater(x, y, r, true));
    south.slice(0, 3).forEach(([x, y, r]) => {
      const lat = (0.5 - y / H) * Math.PI;
      const sx = 1 / Math.max(Math.cos(lat), 0.25);
      c.save();
      c.translate(x, y); c.scale(Math.min(sx, 3), 1);
      c.strokeStyle = "rgba(60,120,230,.95)"; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, r * 1.7, 0, Math.PI * 2); c.stroke();
      c.restore();
    });

    const map = new THREE.CanvasTexture(color);
    const bumpMap = new THREE.CanvasTexture(bump);
    [map, bumpMap].forEach((t) => { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; });
    map.encoding = THREE.sRGBEncoding;
    return { map, bumpMap };
  }

  /* ---------- Scene ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const el = renderer.domElement;
  el.className = "moon-canvas";
  el.tabIndex = 0;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", (fallback ? fallback.alt + " " : "") + "Drag or use the arrow keys to spin the Moon. Click it or press Enter to jump to the map.");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.set(0, 0, 4.9);

  const { map, bumpMap } = buildTextures();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 120),
    new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.018, roughness: 1, metalness: 0 })
  );
  const tilt = new THREE.Group();
  tilt.add(moon);
  scene.add(tilt);

  // Sun low from the left; a faint blue fill for earthshine on the night side.
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-5, 1.2, 0.9);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6f8fc8, 0.07));

  /* ---------- Interaction ---------- */
  let yaw = 1.2, pitch = -0.5;     // start tipped so the south pole faces you
  let vYaw = 0, vPitch = 0;
  let dragging = false, lastX = 0, lastY = 0, lastInput = 0;
  const AUTO = reduceMotion ? 0 : 0.0016;
  const clampPitch = (p) => Math.max(-1.25, Math.min(1.25, p));

  // A click (not a drag) on the Moon opens the resource atlas.
  function openAtlas() {
    const atlas = document.getElementById("atlas");
    if (!atlas) return;
    atlas.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    const heading = atlas.querySelector("h2");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  let downX = 0, downY = 0, downAt = 0;

  el.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = downX = e.clientX; lastY = downY = e.clientY; downAt = performance.now(); vYaw = vPitch = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");
  });
  el.addEventListener("pointerup", (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved < 6 && performance.now() - downAt < 600) openAtlas();
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const k = 3.2 / Math.max(el.clientWidth, 200);
    vYaw = dx * k; vPitch = dy * k;
    yaw += vYaw; pitch = clampPitch(pitch + vPitch);
    lastInput = performance.now();
    requestFrame();
  });
  const endDrag = () => { dragging = false; el.classList.remove("is-dragging"); lastInput = performance.now(); };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAtlas(); return; }
    const step = 0.18;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!moves[e.key]) return;
    e.preventDefault();
    yaw += moves[e.key][0]; pitch = clampPitch(pitch + moves[e.key][1]);
    vYaw = vPitch = 0; lastInput = performance.now();
    requestFrame();
  });

  /* ---------- Render loop (only while visible) ---------- */
  let visible = true, raf = 0;
  function frame(now) {
    raf = 0;
    if (!dragging) {
      // inertia after a flick, then the slow idle turn
      vYaw *= 0.94; vPitch *= 0.9;
      yaw += vYaw; pitch = clampPitch(pitch + vPitch);
      if (now - lastInput > 2500) yaw += AUTO;
    }
    tilt.rotation.x = pitch;
    moon.rotation.y = yaw;
    renderer.render(scene, camera);
    const moving = dragging || Math.abs(vYaw) > 1e-4 || Math.abs(vPitch) > 1e-4 || AUTO > 0;
    if (visible && moving) requestFrame();
  }
  function requestFrame() { if (!raf && visible) raf = requestAnimationFrame(frame); }

  function resize() {
    const size = Math.round(host.clientWidth);
    if (!size) return;
    renderer.setSize(size, size, false);
    requestFrame();
  }

  // Swap the static image for the globe.
  host.appendChild(el);
  if (fallback) fallback.hidden = true;
  host.classList.add("is-3d");
  const hint = document.querySelector(".moon-hint");
  if (hint) hint.hidden = false;
  resize();

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(host);
  else window.addEventListener("resize", resize);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      requestFrame();
    }).observe(host);
  }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; requestFrame(); });
  requestFrame();
})();
