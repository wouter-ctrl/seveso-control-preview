/* ============================================================
   FrameScrubber — canvas frame-sequence scrubber.
   250 WebP frames extracted from capptions.mp4 (audio stripped).
   - Progressive loading: frame 1 first, then every 8th frame,
     then backfill; a ±15 decode-ahead window follows the playhead.
   - Scroll never drives the frame directly: the playhead lerps
     toward the target each rAF tick so the film glides.
   ============================================================ */
(function () {
  'use strict';

  function FrameScrubber(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.count = opts.count;
    this.src = opts.src; // (i 1-based) -> url
    this.smoothing = opts.smoothing || 0.12;
    this.imgs = new Array(this.count).fill(null);
    this.state = new Array(this.count).fill(0); // 0 idle · 1 loading · 2 ready · 3 failed
    this.tries = new Array(this.count).fill(0);
    this._last = null;
    this.queue = [];
    this.inflight = 0;
    this.maxInflight = 6;
    this.cur = 0;       // float frame position (0-based)
    this.target = 0;
    this.drawn = -1;
    this.onFirstFrame = opts.onFirstFrame || null;
    this.zoom = 1;      // 1 = full-bleed cover; <1 shrinks the film on its own white ground
    this.shiftX = 0;    // horizontal shift (fraction of canvas width, + = right)
    this.shiftY = 0;    // vertical shift (fraction of canvas height, + = down)
    this.bg = null;     // sampled frame background color
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    this.resize();
    this._buildQueue();
    this._pump();
  }

  FrameScrubber.prototype._buildQueue = function () {
    var q = [0];
    var i;
    for (i = 0; i < this.count; i += 8) { if (i !== 0) q.push(i); }
    q.push(this.count - 1); // final frame early (CTA bg / handoff)
    for (i = 0; i < this.count; i++) { if (i % 8 !== 0 && i !== this.count - 1) q.push(i); }
    this.queue = q;
  };

  FrameScrubber.prototype._pump = function () {
    while (this.inflight < this.maxInflight && this.queue.length) {
      var i = this.queue.shift();
      if (this.state[i] !== 0) continue;
      this._load(i);
    }
  };

  FrameScrubber.prototype._load = function (i) {
    var self = this;
    this.state[i] = 1;
    this.inflight++;
    var img = new Image();
    img.decoding = 'async';
    img.src = this.src(i + 1);
    var done = function (ok) {
      self.inflight--;
      if (ok) {
        self.imgs[i] = img;
        self.state[i] = 2;
        // pre-decode off the critical path so the first drawImage of this
        // frame doesn't pay a synchronous decode mid-scroll
        if (img.decode) img.decode().catch(function () {});
        if (i === 0 && self.onFirstFrame) { self.onFirstFrame(); self.onFirstFrame = null; }
        // repaint if the playhead is waiting on (or near) this frame
        if (Math.abs(i - Math.round(self.cur)) <= 8) self.drawn = -1;
      } else if (++self.tries[i] < 3) {
        self.state[i] = 0; // retry with backoff, never a hot loop
        setTimeout(function () { self.queue.push(i); self._pump(); }, 800 * self.tries[i]);
      } else {
        self.state[i] = 3; // gave up — nearestReady skips it
      }
      self._pump();
    };
    // onload/onerror as the primary completion signal — img.decode() can
    // hang indefinitely in some embedded contexts.
    var settled = false;
    var settle = function (ok) { if (!settled) { settled = true; done(ok); } };
    img.onload = function () { settle(true); };
    img.onerror = function () { settle(false); };
    if (img.complete && img.naturalWidth > 0) settle(true);
  };

  // Pull a ±window of frames around the playhead to the front of the queue.
  FrameScrubber.prototype.prioritize = function (center) {
    var lo = Math.max(0, center - 15), hi = Math.min(this.count - 1, center + 15);
    var front = [];
    for (var i = lo; i <= hi; i++) { if (this.state[i] === 0) front.push(i); }
    if (front.length) {
      var frontSet = {};
      front.forEach(function (i) { frontSet[i] = true; });
      this.queue = front.concat(this.queue.filter(function (i) { return !frontSet[i]; }));
      this._pump();
    }
  };

  // target: float frame position, 0-based
  FrameScrubber.prototype.setTarget = function (f) {
    this.target = Math.max(0, Math.min(this.count - 1, f));
    this.prioritize(Math.round(this.target));
  };

  FrameScrubber.prototype.nearestReady = function (i) {
    if (this.state[i] === 2) return i;
    for (var d = 1; d < this.count; d++) {
      if (i - d >= 0 && this.state[i - d] === 2) return i - d;
      if (i + d < this.count && this.state[i + d] === 2) return i + d;
    }
    return -1;
  };

  // Call every rAF tick. Returns current eased progress (0..1 across frames).
  FrameScrubber.prototype.tick = function () {
    if (this.canvas.width === 0 || this.canvas.height === 0) this.resize();
    // time-corrected lerp: same glide speed on 60Hz and 120/144Hz displays
    var now = (window.performance || Date).now();
    var dt = this._last === null ? 1 / 60 : Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this.cur += (this.target - this.cur) * (1 - Math.pow(1 - this.smoothing, dt * 60));
    if (Math.abs(this.target - this.cur) < 0.05) this.cur = this.target;
    var want = Math.round(this.cur);
    var have = this.nearestReady(want);
    if (have !== -1 && have !== this.drawn) this.draw(have);
    return this.cur / (this.count - 1);
  };

  FrameScrubber.prototype.draw = function (i) {
    var img = this.imgs[i];
    if (!img) return;
    var cw = this.canvas.width, ch = this.canvas.height;
    if (!this.bg) {
      try {
        var t = document.createElement('canvas'); t.width = t.height = 1;
        var tc = t.getContext('2d');
        tc.drawImage(img, 8, 8, 1, 1, 0, 0, 1, 1);
        var d = tc.getImageData(0, 0, 1, 1).data;
        this.bg = 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
      } catch (e) { this.bg = '#fbfcfd'; }
    }
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * this.zoom;
    var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0, 0, cw, ch);
    this.ctx.drawImage(img, (cw - dw) / 2 + this.shiftX * cw, (ch - dh) / 2 + this.shiftY * ch, dw, dh);
    this.drawn = i;
  };

  FrameScrubber.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.drawn = -1; // force repaint
  };

  FrameScrubber.prototype.destroy = function () {
    window.removeEventListener('resize', this._resize);
  };

  window.FrameScrubber = FrameScrubber;
})();
