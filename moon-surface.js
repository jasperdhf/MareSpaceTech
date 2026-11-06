/* Mare — shared lunar surface generator.
 *
 * Builds an equirectangular colour map and a matching bump map on 2D canvases:
 * regolith noise, darker basalt plains, craters, a few ray systems, smoothed
 * poles. Used by the hero Moon (moon3d.js) and the atlas globe (atlas3d.js).
 *
 *   MareSurface.build({ surveyRings: true })  ->  { color, bump, W, H }
 *
 * surveyRings: draw the shadowed south-polar craters circled in blue (hero only).
 */
(function () {
  "use strict";

  const W = 2048, H = 1024;

  function build(options) {
    const opts = Object.assign({ surveyRings: true, seed: 7 }, options);

    // Small seeded RNG so the Moon looks the same on every load.
    let seed = opts.seed;
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
      const south = opts.surveyRings ? [[300, 852, 30], [760, 862, 26], [1290, 850, 34], [1720, 858, 24]] : [];
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
    return { color, bump, W, H };
  }

  window.MareSurface = { build, W, H };
})();
