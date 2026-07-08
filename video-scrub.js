/* ============================================================
   VideoScrubber — scroll-driven frame scrubbing via a real <video>
   instead of a canvas + per-frame image decode.

   Why: profiling showed WebP decode (Image.decode()) was ~95% of the
   main-thread cost of scrolling through the film - CPU-bound software
   decode, no hardware path on any device. An all-keyframe H.264 video
   (every source frame encoded as its own keyframe, so currentTime seeks
   land instantly/exactly) moves that decode onto the device's hardware
   video decoder instead. Measured ~6-7x less main-thread task time
   under 4x CPU throttle on the same scroll sequence.

   Same external shape as the old FrameScrubber (setTarget/tick, plus
   fit/shiftX/shiftY/zoom) so the choreography code barely changes.
   Positioning/zoom use native object-fit + a CSS transform instead of
   manual canvas math - object-fit does the cover/contain scaling,
   translate (fixed % of the element's own box, resolved independent of
   any scale in the same transform) reproduces the old shiftX*cw /
   shiftY*ch pixel-offset math, scale() reproduces zoom.
   ============================================================ */
(function () {
  'use strict';

  function VideoScrubber(video, opts) {
    this.video = video;
    this.count = opts.count;
    this.fps = opts.fps || 30;
    this.smoothing = opts.smoothing || 0.12;
    this.onFirstFrame = opts.onFirstFrame || null;
    this._firstFrameFired = false;

    this.cur = 0;
    this.target = 0;
    this.zoom = 1;
    this.shiftX = 0;
    this.shiftY = 0;
    this.fit = opts.fit || 'cover';
    this.drawn = -1; // unused; kept so any leftover `.drawn = -1` calls are harmless

    this._last = null;
    this._seeking = false;
    this._pending = false;

    var self = this;
    video.addEventListener('loadeddata', function () { self._fireFirstFrame(); });
    video.addEventListener('seeked', function () {
      self._seeking = false;
      self._fireFirstFrame();
      if (self._pending) { self._pending = false; self._doSeek(); }
    });

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    this._applyTransform();
  }

  VideoScrubber.prototype._fireFirstFrame = function () {
    if (this._firstFrameFired) return;
    this._firstFrameFired = true;
    if (this.onFirstFrame) this.onFirstFrame();
  };

  VideoScrubber.prototype.setTarget = function (f) {
    this.target = Math.max(0, Math.min(this.count - 1, f));
  };

  VideoScrubber.prototype._doSeek = function () {
    if (this._seeking) { this._pending = true; return; }
    var duration = this.video.duration || (this.count / this.fps);
    var t = Math.max(0, Math.min(duration - 0.001, this.cur / this.fps));
    this._seeking = true;
    try { this.video.currentTime = t; } catch (e) { this._seeking = false; }
  };

  VideoScrubber.prototype._applyTransform = function () {
    this.video.style.objectFit = this.fit;
    this.video.style.transform =
      'translate(' + (this.shiftX * 100).toFixed(3) + '%, ' + (this.shiftY * 100).toFixed(3) + '%) scale(' + this.zoom + ')';
  };

  // Call every rAF tick. Same time-corrected lerp + max-frame-step cap as
  // the old FrameScrubber, so fast scroll bursts still play through the
  // sequence instead of jump-cutting.
  VideoScrubber.prototype.tick = function () {
    var now = (window.performance || Date).now();
    var dt = this._last === null ? 1 / 60 : Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    var step = (this.target - this.cur) * (1 - Math.pow(1 - this.smoothing, dt * 60));
    var maxStep = 3 * dt * 60;
    if (step > maxStep) step = maxStep; else if (step < -maxStep) step = -maxStep;
    this.cur += step;
    if (Math.abs(this.target - this.cur) < 0.05) this.cur = this.target;
    this._applyTransform();
    this._doSeek();
    return this.cur / (this.count - 1);
  };

  VideoScrubber.prototype.resize = function () { /* pure CSS sizing now - nothing to do */ };
  VideoScrubber.prototype.destroy = function () {};

  window.VideoScrubber = VideoScrubber;
})();
