/* Tweaks — design review controls (visual world, film length, scrub feel).
   Strip together with React/Babel tags for the production drop. */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "world": "Licht",
  "filmScale": 60,
  "filmLength": 520,
  "smoothing": 0.12
}/*EDITMODE-END*/;

const WORLD_MAP = { "Licht": "licht", "Scrim": "scrim", "Grade": "grade" };

function SevesoTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.body.setAttribute('data-world', WORLD_MAP[t.world] || 'licht');
  }, [t.world]);

  React.useEffect(() => {
    if (window.__seveso && window.__seveso.setFilmScale) window.__seveso.setFilmScale(t.filmScale);
  }, [t.filmScale]);

  React.useEffect(() => {
    if (window.__seveso && window.__seveso.setFilmLength) window.__seveso.setFilmLength(t.filmLength);
  }, [t.filmLength]);

  React.useEffect(() => {
    if (window.__seveso && window.__seveso.setSmoothing) window.__seveso.setSmoothing(t.smoothing);
  }, [t.smoothing]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Filmwereld (Act I)" />
      <TweakRadio label="Wereld" value={t.world} options={["Licht", "Scrim", "Grade"]}
                  onChange={(v) => setTweak('world', v)} />
      <TweakSlider label="Filmgrootte" value={t.filmScale} min={55} max={100} step={1} unit="%"
                   onChange={(v) => setTweak('filmScale', v)} />
      <TweakSection label="Scrub" />
      <TweakSlider label="Filmlengte" value={t.filmLength} min={350} max={720} step={10} unit="vh"
                   onChange={(v) => setTweak('filmLength', v)} />
      <TweakSlider label="Smoothing" value={t.smoothing} min={0.06} max={0.24} step={0.01}
                   onChange={(v) => setTweak('smoothing', v)} />
    </TweaksPanel>
  );
}

(function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  ReactDOM.createRoot(el).render(<SevesoTweaks />);
})();
