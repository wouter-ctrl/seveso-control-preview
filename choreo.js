/* ============================================================
   Seveso Control™ scroll-film — choreography.
   Lenis (smooth scroll) + GSAP ScrollTrigger (all scroll choreo)
   + FrameScrubber (canvas frame sequence, see scrub.js).
   Act I: one pinned stage, one master trigger, chapters timed as
   fractions of its progress. Acts II–III: scrub-linked motion.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FRAMES = 250;
  var api = { scrubber: null, lenis: null };
  window.__seveso = api;

  /* Beat map (scroll progress → film progress). Boundaries snapped to
     the film's natural moves: A calm 0–0.85s · B swarm 0.85–4.6s ·
     C lightbulb 4.6–6.5s · D resolve 6.5–10s. */
  var SEG = [
    [0.00, 0.000],
    [0.18, 0.085],
    [0.50, 0.460],
    [0.72, 0.650],
    [1.00, 1.000]
  ];
  function mapProgress(p) {
    for (var i = 1; i < SEG.length; i++) {
      if (p <= SEG[i][0]) {
        var a = SEG[i - 1], b = SEG[i];
        return a[1] + (p - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
      }
    }
    return 1;
  }
  function frameUrl(i) { return 'frames/f_' + String(i).padStart(3, '0') + '.webp'; }

  /* ---------- Reduced motion: static page, real values, no scrub ---------- */
  if (REDUCED) {
    document.body.classList.add('is-reduced');
    document.querySelectorAll('.counter__num[data-count-to]').forEach(function (el) {
      el.childNodes[0].nodeValue = el.getAttribute('data-count-to');
    });
    document.querySelectorAll('.dash__lights .l--g').forEach(function (el) { el.style.opacity = 1; });
    document.querySelectorAll('.dash__status .s--g').forEach(function (el) { el.style.opacity = 1; });
    // story clips: no autoplay — hold each on its resolved "after" frame
    document.querySelectorAll('video[data-play-on-view]').forEach(function (v) {
      v.addEventListener('loadedmetadata', function () { v.currentTime = Math.max(0, v.duration - 0.05); }, { once: true });
      v.preload = 'metadata'; v.load();
    });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis ↔ ScrollTrigger sync ---------- */
  var lenis = new Lenis({ lerp: 0.11 });
  api.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  /* ---------- Anchor navigation through Lenis ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -64, duration: 1.2 });
    });
  });

  /* ---------- Act I · the film ---------- */
  var canvas = document.querySelector('.film__canvas');
  var poster = document.querySelector('.film__poster');
  var scrubber = new FrameScrubber(canvas, {
    count: FRAMES,
    src: frameUrl,
    smoothing: 0.12,
    onFirstFrame: function () { poster.style.visibility = 'hidden'; }
  });
  api.scrubber = scrubber;
  // On desktop the film sits smaller on its own white ground, subject right of
  // the copy column — not a giant full-bleed background. Kept well under the
  // frames' native size so they render sharp (no upscale = no pixelation).
  if (window.innerWidth >= 760) { scrubber.zoom = 0.44; scrubber.shiftX = 0.24; }
  gsap.ticker.add(function () { scrubber.tick(); });

  /* The film itself journeys through the stage as you scroll — each story
     beat carries the subject to a new position, so the scroll experience
     lives in the animation rather than only in text swaps. Desktop only:
     mobile stays full-bleed. */
  if (window.innerWidth >= 760) {
    var journey = { x: 0.24, y: 0.05, z: 0.50 };
    var applyJourney = function () {
      scrubber.shiftX = journey.x;
      scrubber.shiftY = journey.y;
      scrubber.zoom = journey.z;
      scrubber.drawn = -1; // force repaint at the new position
    };
    applyJourney();
    gsap.timeline({
      defaults: { ease: 'none', onUpdate: applyJourney },
      scrollTrigger: { trigger: '#film', start: 'top top', end: 'bottom bottom', scrub: true }
    })
      .to(journey, { x: 0.15, y: -0.03, z: 0.46, duration: 0.18 }, 0.02) // calm → swarm: drifts in toward the copy
      .to(journey, { x: 0.27, y: 0.06, z: 0.42, duration: 0.28 }, 0.24)  // swarm builds: slides away, tightens
      .to(journey, { x: 0.17, y: -0.02, z: 0.46, duration: 0.20 }, 0.56) // lightbulb: swings back toward center
      .to(journey, { x: 0.24, y: 0.02, z: 0.44, duration: 0.22 }, 0.78); // resolve: settles right, at rest
  }

  if (window.innerWidth < 760) {
    document.documentElement.style.setProperty('--film-vh', 420);
  }

  var skipLink = document.querySelector('.skip-film');
  var ch4 = document.getElementById('ch4');

  ScrollTrigger.create({
    trigger: '#film',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: function (self) {
      scrubber.setTarget(mapProgress(self.progress) * (FRAMES - 1));
      ch4.classList.toggle('chapter--active', self.progress > 0.74);
    },
    onToggle: function (self) {
      skipLink.classList.toggle('is-visible', self.isActive);
    }
  });
  skipLink.classList.add('is-visible'); // visible at load (film starts at scroll 0)

  /* Chapter choreography — one timeline, positions are fractions of the pin. */
  var tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#film', start: 'top top', end: 'bottom bottom', scrub: true }
  });
  gsap.set('#ch1', { autoAlpha: 1 });
  gsap.set(['#ch2a', '#ch2b', '#ch3', '#ch4', '#ch4 .chapter__ctas'], { autoAlpha: 0 });

  function chapterIn(sel, at, dur)  { tl.fromTo(sel, { autoAlpha: 0, y: 70 },  { autoAlpha: 1, y: 0, duration: dur }, at); }
  function chapterOut(sel, at, dur) { tl.to(sel, { autoAlpha: 0, y: -70, duration: dur }, at); }

  chapterOut('#ch1', 0.13, 0.05);
  chapterIn('#ch2a', 0.20, 0.05); chapterOut('#ch2a', 0.31, 0.04);
  chapterIn('#ch2b', 0.37, 0.05); chapterOut('#ch2b', 0.47, 0.04);
  chapterIn('#ch3', 0.54, 0.05);  chapterOut('#ch3', 0.67, 0.04);
  chapterIn('#ch4', 0.76, 0.06);
  tl.fromTo('#ch4 .chapter__ctas', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.05 }, 0.90);

  /* ---------- Chapter 5 · stoplicht dashboard (scrubs into view) ---------- */
  var dashTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#platform', start: 'top 75%', end: 'top 15%', scrub: true }
  });
  document.querySelectorAll('.dash__row').forEach(function (row, k) {
    var r = row.querySelector('.l--r'), o = row.querySelector('.l--o'), g = row.querySelector('.l--g');
    var sr = row.querySelector('.s--r'), so = row.querySelector('.s--o'), sg = row.querySelector('.s--g');
    gsap.set(r, { opacity: 1 }); gsap.set(sr, { opacity: 1 });
    var t0 = k * 0.11;
    dashTl.to([r, sr], { opacity: function (i, el) { return el.tagName === 'I' ? 0.16 : 0; }, duration: 0.12 }, t0)
          .to([o, so], { opacity: 1, duration: 0.12 }, t0)
          .to([o, so], { opacity: function (i, el) { return el.tagName === 'I' ? 0.16 : 0; }, duration: 0.12 }, t0 + 0.3)
          .to([g, sg], { opacity: 1, duration: 0.12 }, t0 + 0.3);
  });

  /* ---------- Generic reveals (scrub-linked, transform + opacity only) ---------- */
  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    gsap.fromTo(el, { autoAlpha: 0, y: 44 }, {
      autoAlpha: 1, y: 0, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 62%', scrub: true }
    });
  });
  gsap.utils.toArray('[data-reveal-group]').forEach(function (group) {
    var items = group.children;
    gsap.fromTo(items, { autoAlpha: 0, y: 48 }, {
      autoAlpha: 1, y: 0, ease: 'none', stagger: 0.12,
      scrollTrigger: { trigger: group, start: 'top 90%', end: 'top 40%', scrub: true }
    });
  });

  /* ---------- Chapter 8 · counters climb on scroll ---------- */
  gsap.utils.toArray('.counter__num[data-count-to]').forEach(function (el) {
    var to = parseInt(el.getAttribute('data-count-to'), 10);
    var proxy = { v: 0 };
    var node = el.childNodes[0];
    gsap.to(proxy, {
      v: to, ease: 'none',
      snap: { v: 1 },
      onUpdate: function () { node.nodeValue = String(proxy.v); },
      scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 45%', scrub: true }
    });
  });

  /* ---------- Chapter 6 · vinkjes frame-sequence scrubs with scroll ---------- */
  (function vinkjesScrub() {
    var c = document.querySelector('.vinkjes-canvas');
    if (!c) return;
    var N = 100, s = null;
    function ensure() {
      if (s) return;
      s = new FrameScrubber(c, {
        count: N,
        src: function (i) { return 'vframes/v_' + String(i).padStart(3, '0') + '.webp'; },
        smoothing: 0.14,
        onFirstFrame: function () {
          var p = document.querySelector('.vinkjes-poster');
          if (p) p.style.visibility = 'hidden';
        }
      });
      gsap.ticker.add(function () { s.tick(); });
    }
    ScrollTrigger.create({
      trigger: '.vinkjes-banner',
      start: 'top 130%', // start decoding just before it can appear
      end: 'top 22%',
      onUpdate: function (self) {
        ensure();
        var p = Math.max(0, (self.progress - 0.28) / 0.72); // playback begins once in view
        s.setTarget(p * (N - 1));
      }
    });
  })();

  /* ---------- Compliance drift · lines run apart on scroll ----------
     Scrub drives a progress proxy; both paths draw via dashoffset and the
     end labels travel WITH their line tips (getPointAtLength), so
     "wet & documenten" and "de werkvloer" walk along as the lines run. */
  (function driftViz() {
    var a = document.getElementById('drift-a'), b = document.getElementById('drift-b');
    if (!a || !b) return;
    var gap = document.getElementById('drift-gap');
    var startLabel = document.getElementById('drift-label-start');
    var la = document.getElementById('drift-label-a');
    var lb = document.getElementById('drift-label-b');
    var La = a.getTotalLength(), Lb = b.getTotalLength();
    a.style.strokeDasharray = La; a.style.strokeDashoffset = La;
    b.style.strokeDasharray = Lb; b.style.strokeDashoffset = Lb;
    var prog = { p: 0 };
    function place() {
      a.style.strokeDashoffset = La * (1 - prog.p);
      b.style.strokeDashoffset = Lb * (1 - prog.p);
      var pa = a.getPointAtLength(La * prog.p);
      var pb = b.getPointAtLength(Lb * prog.p);
      // labels trail the tip; clamp so the text never runs off the left edge
      la.setAttribute('x', Math.max(170, pa.x)); la.setAttribute('y', pa.y - 16);
      lb.setAttribute('x', Math.max(170, pb.x)); lb.setAttribute('y', pb.y + 30);
    }
    place();
    gsap.set([startLabel, la, lb, gap], { autoAlpha: 0 });
    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '.drift-viz', start: 'top 78%', end: 'center 42%', scrub: true }
    });
    tl.to(startLabel, { autoAlpha: 1, duration: 0.08 }, 0)
      .to(prog, { p: 1, duration: 0.80, onUpdate: place }, 0.06)
      .to([la, lb], { autoAlpha: 1, duration: 0.08 }, 0.26) // fade in once the lines are underway
      .to(gap, { autoAlpha: 1, duration: 0.14 }, 0.86);
  })();

  /* ---------- Story clips (Higgsfield) — play once when they enter the view,
     rest on the resolved "after" state, rewind when fully out of view so the
     story retells on the next pass. ---------- */
  document.querySelectorAll('video[data-play-on-view]').forEach(function (v) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.intersectionRatio >= 0.35) {
          if (!v.ended) v.play().catch(function () {});
        } else if (!e.isIntersecting) {
          v.pause();
          if (v.ended) v.currentTime = 0;
        }
      });
    }, { threshold: [0, 0.35] });
    io.observe(v);
  });

  /* ---------- Tweaks API ---------- */
  api.setWorld = function (w) { document.body.setAttribute('data-world', w); };
  api.setFilmLength = function (vh) {
    document.documentElement.style.setProperty('--film-vh', vh);
    ScrollTrigger.refresh();
  };
  api.setSmoothing = function (v) { scrubber.smoothing = v; };
  api.setFilmScale = function (pct) {
    if (window.innerWidth < 760) return; // mobile stays full-bleed (cover crop)
    scrubber.zoom = pct / 100;
    scrubber.drawn = -1;
  };

  /* ---------- Initial measurement ----------
     Explicit refresh: with Lenis installed and scripts at the end of body,
     ScrollTrigger's automatic initial refresh is not reliable. */
  ScrollTrigger.refresh();
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
