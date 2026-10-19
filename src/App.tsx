import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import {
  ArrowRight,
  AudioLines,
  ChevronRight,
  Crosshair,
  Expand,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { Game, Loadout } from './game/engine';
import { BIOMES, initialTelemetry, SECTOR_LENGTH, type Weapon, type SkyWeapon } from './game/rules';
import { GRAPHICS_PRESETS, type GraphicsQuality } from './game/quality';
const groundWeapons = [
  { id: 'pulse', name: 'Pulse Vulcan', detail: 'Rapid plasma · balanced heat' },
  { id: 'beam', name: 'Resonance Beam', detail: 'Hold to melt obstacles · rising heat' },
  { id: 'seismic', name: 'Seismic Spreader', detail: 'Surface shockwave · heavy impact' },
] as const;
const skyWeapons = [
  { id: 'flak', name: 'Flak Cannon', detail: 'Airburst shells · swarm control' },
  { id: 'rail', name: 'Tachyon Railgun', detail: 'Hold to charge · release to pierce' },
  { id: 'seeker', name: 'Seeker Missiles', detail: 'Twin guided rockets · target tracking' },
] as const;
const controls = [
  ['A / ←', 'Brake to 40% cruise'],
  ['D / → / SHIFT', 'Overdrive · consumes capacitor'],
  ['SPACE', 'Jump · hold to hover'],
  ['A / D in air', 'Pitch for a clean landing'],
  ['J / Z', 'Fire both axes · hold/release for rail'],
  ['K / X', 'Vent the core'],
  ['R', 'Rear EMP · 20 capacitor'],
  ['ESC / P', 'Pause expedition'],
  ['M', 'Toggle audio'],
];
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const time = (n: number) =>
  Math.floor(n / 60)
    .toString()
    .padStart(2, '0') +
  ':' +
  Math.floor(n % 60)
    .toString()
    .padStart(2, '0');
export default function App() {
  const menuRef = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null);
  const [s, setState] = useState(initialTelemetry()),
    [error, setError] = useState(''),
    [help, setHelp] = useState(false),
    [hangar, setHangar] = useState(false),
    [graphics, setGraphics] = useState(false),
    [muted, setMuted] = useState(false);
  const [ground, setGround] = useState<Weapon>('pulse'),
    [sky, setSky] = useState<SkyWeapon>('flak');
  const ready = s.backend !== 'INITIALIZING',
    menu = s.phase === 'menu',
    biome = BIOMES[s.biome],
    playing = s.phase === 'playing';
  useEffect(() => {
    let active = true;
    let engine: Game | undefined;
    // Show the title/loading controls before downloading and parsing the authored
    // model library and renderer. Cancellation also handles React's dev remount.
    void import('./game/engine')
      .then(({ Game }) => {
        if (!active || !host.current) return;
        engine = new Game(
          host.current,
          (state) => {
            if (!active) return;
            setState(state);
            setMuted(!engine!.audio.enabled);
          },
          (message) => {
            if (active) setError(message);
          },
        );
        game.current = engine;
        if (import.meta.env.DEV || import.meta.env.MODE === 'benchmark')
          (window as unknown as { __voidRunner: Game }).__voidRunner = engine;
        return engine.init();
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Unable to load game assets.');
      });
    return () => {
      active = false;
      engine?.dispose();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && (help || hangar || graphics)) {
        e.stopImmediatePropagation();
        setHelp(false);
        setHangar(false);
        setGraphics(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [help, hangar, graphics]);
  useEffect(() => {
    if (game.current) game.current.overlayOpen = help || hangar || graphics;
  }, [help, hangar, graphics, ready]);
  const start = () => {
    game.current?.start({ ground, sky } as Loadout);
    (document.activeElement as HTMLElement)?.blur();
  };
  const toggleAudio = () => {
    game.current?.toggleAudio();
    setMuted(!game.current?.audio.enabled);
  };
  const openHelp = () => {
    if (playing) game.current?.pause();
    setGraphics(false);
    setHangar(false);
    setHelp(true);
  };
  const openGraphics = () => {
    if (playing) game.current?.pause();
    setHelp(false);
    setHangar(false);
    setGraphics(true);
  };
  useEffect(() => {
    if (!menu || help || hangar || graphics) return;
    const navigate = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.code)) {
        const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []).filter(
          (button) => !button.disabled,
        );
        if (!buttons.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? buttons.length - 1
              : event.code === 'ArrowUp'
                ? current <= 0
                  ? buttons.length - 1
                  : current - 1
                : (current + 1) % buttons.length;
        buttons[next].focus();
      } else if (
        event.code === 'Enter' &&
        ready &&
        !(event.target as HTMLElement).closest('button')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        game.current?.start({ ground, sky } as Loadout);
      }
    };
    window.addEventListener('keydown', navigate, true);
    return () => window.removeEventListener('keydown', navigate, true);
  }, [menu, help, hangar, graphics, ground, sky, ready]);
  useEffect(() => {
    const engine = game.current;
    const surface = host.current?.parentElement;
    if (!engine || !surface) return;
    if (!playing) {
      engine.radarObstacles = [];
      return;
    }
    const instruments = Array.from(
      surface.querySelectorAll<HTMLElement>(
        '.telemetry, .weapon-status, .scoreboard, .route, .game-tools, .speed, .notice, .warning-banner, .boss-bar, .touch-controls',
      ),
    );
    const measure = () => {
      const origin = surface.getBoundingClientRect();
      engine.radarObstacles = instruments
        .filter((node) => node.isConnected && getComputedStyle(node).display !== 'none')
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            left: box.left - origin.left - 8,
            right: box.right - origin.left + 8,
            top: box.top - origin.top - 8,
            bottom: box.bottom - origin.top + 8,
          };
        });
    };
    const observer = new ResizeObserver(measure);
    [surface, ...instruments].forEach((node) => observer.observe(node));
    measure();
    // Re-measure after banner entrance motion, without reading layout every game frame.
    const settled = window.setTimeout(measure, 400);
    return () => {
      observer.disconnect();
      window.clearTimeout(settled);
    };
  }, [playing, ground, sky, s.warning, s.notice, s.sector]);
  const cancelTouch = (key: string) => {
    if (key === 'KeyJ' && game.current?.touch.has(key)) game.current.cancelWeaponInput();
    game.current?.touch.delete(key);
  };
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError('Fullscreen is unavailable in this browser. You can still play in the window.');
    }
  };
  return (
    <main
      className={'app phase-' + s.phase}
      style={{ '--accent': biome.color } as React.CSSProperties}
    >
      <div className="scene" ref={host} />
      <div className="scene-shade" />
      <div className="grain" />
      {!help && !hangar && !graphics && (menu || playing) && (
        <div className="game-tools" aria-label="Game controls">
          {!menu && (
            <button
              className="icon-button pause-button"
              onClick={() => game.current?.pause()}
              aria-label="Pause game"
              title="Pause (Esc)"
            >
              <Pause size={18} />
            </button>
          )}
          {!menu && (
            <button
              className="icon-button"
              onClick={openGraphics}
              aria-label="Graphics settings"
              title="Graphics settings"
            >
              <SlidersHorizontal size={18} />
            </button>
          )}
          <button
            className="icon-button"
            onClick={toggleAudio}
            title={muted ? 'Enable audio' : 'Mute audio'}
            aria-label={muted ? 'Enable audio' : 'Mute audio'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={full}
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            <Expand size={17} />
          </button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {menu ? (
          <motion.section
            key="menu"
            className="mission-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0.35 }}
          >
            <div className="title-content">
              <div className="title-kicker">
                <Orbit size={18} /> MOON PATROL PROJECT
              </div>
              <h1 className="game-title" aria-label="Void Runner">
                <span>VOID</span>
                <span>RUNNER</span>
              </h1>
              <p className="title-tagline">SIX WHEELS. TWO GUNS. ONE WAY FORWARD.</p>
              <nav className="title-menu" aria-label="Main menu" ref={menuRef}>
                <button className="menu-primary" onClick={start} disabled={!ready}>
                  <ChevronRight aria-hidden="true" size={22} />
                  <span>{ready ? 'BEGIN EXPEDITION' : 'INITIALIZING SYSTEMS'}</span>
                  {!ready && <i className="spinner" />}
                </button>
                <button onClick={() => setHangar(true)}>
                  <ChevronRight aria-hidden="true" size={22} />
                  <span>CONFIGURE ROVER</span>
                </button>
                <button onClick={openGraphics} aria-label="Graphics settings" disabled={!ready}>
                  <ChevronRight aria-hidden="true" size={22} />
                  <span>GRAPHICS</span>
                </button>
                <button onClick={openHelp} aria-label="Flight manual">
                  <ChevronRight aria-hidden="true" size={22} />
                  <span>FLIGHT MANUAL</span>
                </button>
              </nav>
              <div className="menu-input-hint">
                <kbd>↑</kbd>
                <kbd>↓</kbd> SELECT <kbd>ENTER</kbd> CONFIRM
              </div>
            </div>
            <div className="title-record">
              <small>HIGH SCORE</small>
              <b>{fmt(s.best).padStart(6, '0')}</b>
            </div>
            <div className="title-world">
              <span className="status-dot" /> MARE TRANQUILLITATIS <span>SECTOR A / 26</span>
            </div>
            <button
              className="loadout-dock"
              onClick={() => setHangar(true)}
              aria-label="Review equipped weapons"
            >
              <span className="loadout-heading">
                RV–06 / NOMAD{' '}
                <span>
                  LOADOUT <ChevronRight size={12} />
                </span>
              </span>
              <span>
                <small>GROUND</small>
                <b>{groundWeapons.find((w) => w.id === ground)!.name}</b>
              </span>
              <span>
                <small>SKY</small>
                <b>{skyWeapons.find((w) => w.id === sky)!.name}</b>
              </span>
            </button>
          </motion.section>
        ) : (
          <motion.section
            key="hud"
            className="hud"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="telemetry">
              <div className="gauges">
                <Meter
                  label="ENERGY"
                  value={s.capacitor}
                  icon={<Zap size={12} />}
                  color="var(--accent)"
                />
                <Meter
                  label={s.lockout > 0 ? 'LOCK ' + s.lockout.toFixed(1) + 's' : 'HEAT'}
                  value={s.heat}
                  icon={<AudioLines size={12} />}
                  color={s.heat > 75 ? '#ff6562' : '#eaa267'}
                />
              </div>
              <div className="hull">
                <small>
                  <Shield size={12} /> HULL
                </small>
                <b className={s.hull < 30 ? 'danger' : ''}>
                  {Math.ceil(s.hull)}
                  <span>%</span>
                </b>
                <div className="hull-bars">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} className={s.hull > i * 10 ? 'on' : ''} />
                  ))}
                </div>
              </div>
            </div>
            <div className="speed" aria-label="Ground speed">
              <div>
                {Math.round(s.speed * 3.6)
                  .toString()
                  .padStart(3, '0')}
                <span>KM/H</span>
              </div>
              <b>
                {s.lowGravity
                  ? 'LOW GRAVITY'
                  : s.speed > 26
                    ? 'OVERDRIVE'
                    : s.speed < 12
                      ? 'BRAKING'
                      : 'CRUISE'}
              </b>
            </div>
            {(ground === 'beam' || sky === 'rail') && (
              <div className="weapon-status" aria-label="Weapon status">
                {ground === 'beam' && (
                  <span>{s.beamActive ? 'RESONANCE · FIRING' : 'RESONANCE · HOLD FIRE'}</span>
                )}
                {sky === 'rail' && (
                  <div className={'rail-charge' + (s.railCharge >= 1 ? ' ready' : '')}>
                    <span>
                      {s.railCharge >= 1
                        ? 'TACHYON READY · RELEASE FIRE'
                        : s.railCharge > 0
                          ? 'TACHYON CHARGING'
                          : 'TACHYON · HOLD / RELEASE'}{' '}
                      <b>{Math.round(s.railCharge * 100)}%</b>
                    </span>
                    <div
                      role="progressbar"
                      aria-label="Tachyon charge"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(s.railCharge * 100)}
                    >
                      <i style={{ transform: `scaleX(${s.railCharge})` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {playing && (
              <div className="threat-radar" aria-label="Terrain scanner">
                {s.radar.map((t) => (
                  <div
                    key={t.id}
                    className={'threat-marker ' + (t.urgent ? 'urgent' : '')}
                    style={{ left: t.x + '%', top: t.y + '%' }}
                  >
                    <span className="threat-glyph">
                      {t.offscreen ? <ChevronRight size={18} /> : <Crosshair size={18} />}
                    </span>
                    <span>
                      <b>{t.label}</b>
                      <small>
                        {t.distance} M {t.urgent ? '· CAUTION' : ''}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="scoreboard">
              <small>
                SCORE <em>BEST {fmt(s.best).padStart(6, '0')}</em>
              </small>
              <b>{fmt(s.score).padStart(6, '0')}</b>
              <span>
                {time(s.time)} <i /> {fmt(s.distance)} M
              </span>
            </div>
            <AnimatePresence>
              {s.warning && playing && (
                <motion.div
                  key={s.warning}
                  className="warning-banner"
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  △ &nbsp; {s.warning} &nbsp; △
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {s.notice && playing && (
                <motion.div
                  key={s.notice}
                  className="notice"
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="notice-full">{s.notice}</span>
                  <span className="notice-compact">{s.notice.split(' · ')[0]}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {s.sector === 25 && s.boss > 0 && (
              <div className="boss-bar">
                <small>ORBITAL MOTHERSHIP</small>
                <div>
                  <i style={{ width: s.boss + '%' }} />
                </div>
              </div>
            )}
            <div className="route" aria-label="Expedition progress">
              <div className="route-label">
                <div className="sector-caption">
                  <small>
                    SECTOR <b>{String.fromCharCode(65 + s.sector)}</b>
                  </small>
                  <h3>{biome.name}</h3>
                </div>
                <b>{((s.distance / (26 * SECTOR_LENGTH)) * 100).toFixed(1)}%</b>
              </div>
              <div className="route-stations">
                {Array.from({ length: 26 }, (_, i) => (
                  <div
                    className={
                      'station ' +
                      (i === s.sector ? 'current' : i < s.sector ? 'passed' : '') +
                      (i === 4 || i === 9 || i === 14 || i === 19 || i === 25 ? ' milestone' : '')
                    }
                    key={i}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    <i />
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      {playing && (
        <div className="touch-controls">
          {[
            ['ArrowLeft', 'BRAKE'],
            ['Space', 'JUMP'],
            ['KeyJ', 'FIRE'],
            ['ShiftLeft', 'BOOST'],
            ['KeyK', 'VENT'],
          ].map(([key, label]) => (
            <button
              key={key}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                game.current?.touch.add(key);
              }}
              onPointerUp={() => game.current?.touch.delete(key)}
              onPointerCancel={() => cancelTouch(key)}
              onLostPointerCapture={() => cancelTouch(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {s.hull < 30 && playing && <div className="damage-vignette" />}
      <AnimatePresence>
        {s.phase === 'paused' && !help && !graphics && (
          <Modal title="Paused" eyebrow="EXPEDITION PAUSED" key="paused">
            <p className="modal-intro">PAUSED · Your rover is holding position.</p>
            <button className="launch-button" onClick={() => game.current?.pause()}>
              <span>RESUME EXPEDITION</span>
              <Play size={18} />
            </button>
            <div className="modal-links">
              <button onClick={openHelp} aria-label="Flight manual">
                FLIGHT MANUAL
              </button>
              <button onClick={openGraphics}>GRAPHICS</button>
              <button onClick={() => game.current?.menu()}>RETURN TO BASE</button>
            </div>
          </Modal>
        )}
        {s.phase === 'report' && !help && !graphics && (
          <Modal
            title="Checkpoint secured"
            eyebrow={'SECTOR ' + String.fromCharCode(64 + s.sector) + ' / EXPEDITION REPORT'}
            key="report"
          >
            <p className="modal-intro">
              A little further from home. A little closer to the answer.
            </p>
            <div className="report-grid">
              <Stat label="SECTOR TIME" value={time(s.reportTime)} />
              <Stat label="PAR TIME" value="01:05" />
              <Stat label="THREATS CLEARED" value={String(s.reportKills)} />
              <Stat label="CLEAN LANDINGS" value={String(s.reportClean)} />
              <Stat label="DAMAGE TAKEN" value={String(s.reportDamage)} />
              <Stat label="CHECKPOINT BONUS" value={'+' + fmt(s.reportBonus)} />
            </div>
            <p className="service-note">
              FIELD SERVICE: +25 HULL · CAPACITOR REFILLED · CORE COOLED
            </p>
            <button className="launch-button" onClick={() => game.current?.continue()}>
              <span>CONTINUE EXPEDITION</span>
              <ArrowRight size={18} />
            </button>
            <button className="return-button" onClick={openGraphics} aria-label="Graphics settings">
              GRAPHICS
            </button>
          </Modal>
        )}
        {(s.phase === 'dead' || s.phase === 'complete') && !help && !graphics && (
          <Modal
            title={s.phase === 'dead' ? 'Rover destroyed' : 'Expedition complete'}
            eyebrow={s.phase === 'dead' ? 'ROVER TELEMETRY OFFLINE' : 'EXPEDITION COMPLETE / A—Z'}
            key="end"
          >
            <p className="modal-intro">
              {s.phase === 'dead'
                ? 'The moon keeps its secrets. Take what you learned into the next run.'
                : 'The orbital core is silent. Your transmission made it home.'}
            </p>
            <div className="end-score">
              <small>FINAL SCORE</small>
              <strong>{fmt(s.score)}</strong>
            </div>
            <div className="report-grid">
              <Stat label="DISTANCE" value={fmt(s.distance) + ' M'} />
              <Stat label="EXPEDITION TIME" value={time(s.time)} />
              <Stat label="TARGETS DESTROYED" value={String(s.kills)} />
              <Stat label="PERSONAL BEST" value={fmt(s.best)} />
            </div>
            {s.phase === 'dead' && s.checkpoint > 0 && (
              <>
                <button className="launch-button" onClick={() => game.current?.retryCheckpoint()}>
                  <span>RECOVER AT CHECKPOINT {String.fromCharCode(64 + s.checkpoint)}</span>
                  <RotateCcw size={18} />
                </button>
                <p className="service-note">
                  RESTART THIS LEG WITH FULL HULL AND ENERGY. SCORE AND PROGRESS RETURN TO YOUR
                  CHECKPOINT.
                </p>
              </>
            )}
            <button
              className={s.phase === 'dead' && s.checkpoint > 0 ? 'return-button' : 'launch-button'}
              onClick={start}
            >
              <span>RUN IT AGAIN</span>
              <RotateCcw size={18} />
            </button>
            <button className="return-button" onClick={() => game.current?.menu()}>
              RETURN TO BASE
            </button>
            <button className="return-button" onClick={openGraphics} aria-label="Graphics settings">
              GRAPHICS
            </button>
          </Modal>
        )}
        {graphics && (
          <Modal
            title="Graphics"
            eyebrow="DISPLAY / GRAPHICS"
            close={() => setGraphics(false)}
            key="graphics"
          >
            <p className="modal-intro">
              Choose the detail level that keeps your expedition flowing. Balanced is the starting
              point.
            </p>
            <div className="graphics-picker" role="group" aria-label="Graphics quality">
              {(Object.keys(GRAPHICS_PRESETS) as GraphicsQuality[]).map((quality) => (
                <button
                  key={quality}
                  className={s.quality === quality ? 'selected' : ''}
                  aria-pressed={s.quality === quality}
                  onClick={() => game.current?.setQuality(quality)}
                >
                  <b>{GRAPHICS_PRESETS[quality].label}</b>
                  <span>
                    {s.backend === 'WEBGL 2' && quality !== 'performance'
                      ? quality === 'cinematic'
                        ? 'Sharper surfaces · higher resolution'
                        : 'Detailed surfaces · standard resolution'
                      : GRAPHICS_PRESETS[quality].detail}
                  </span>
                  {s.quality === quality && <small>ACTIVE</small>}
                </button>
              ))}
            </div>
            <p className="service-note">
              {s.backend === 'WEBGL 2'
                ? 'Dynamic shadows and cinematic glow require WebGPU. Surface detail and headlights remain available.'
                : 'Cinematic adds bloom and a subtle lens effect during impacts.'}
            </p>
            <div className="renderer-info">
              <span className="engine-label">{s.backend}</span>
              <span>
                {s.fps > 0 ? s.fps + ' FPS' : 'WARMING UP'} ·{' '}
                {GRAPHICS_PRESETS[s.quality].label.toUpperCase()}
              </span>
            </div>
            <button className="launch-button" onClick={() => setGraphics(false)}>
              <span>DONE</span>
              <ArrowRight size={18} />
            </button>
          </Modal>
        )}
        {help && (
          <Modal
            title="Flight manual"
            eyebrow="RV–06 / FLIGHT MANUAL"
            close={() => setHelp(false)}
            key="help"
          >
            <p className="modal-intro">
              Forward motion is automatic. Read the terrain, manage your energy, and keep both skies
              and ground clear.
            </p>
            <div className="control-list">
              {controls.map(([key, action]) => (
                <div key={key}>
                  <kbd>{key}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </div>
            <p className="service-note">
              GAMEPAD: LEFT STICK SPEED/PITCH · A JUMP · X FIRE · B VENT · BUMPERS BRAKE/BOOST ·
              START PAUSE
            </p>
            <div className="manual-tip">
              <Zap size={17} />
              <p>
                Release jump between launches. Hover and boost share the capacitor. Weapons lock for
                3 seconds at full heat. Checkpoints repair 25 hull.
              </p>
            </div>
            <p className="service-note">
              RESONANCE: HOLD FIRE TO MELT ROCKS. TACHYON: HOLD FIRE TO CHARGE, RELEASE TO SHOOT.
              BUILD AT LEAST A QUARTER CHARGE. VENTING OR PAUSING CANCELS THE CHARGE.
            </p>
            <p className="service-note">
              PATROL CLEARANCE: JUMP ROCKS +100 · MINES +150 · SKIMMERS +200 · CHASMS +50. LAND
              WITHOUT DAMAGE TO BANK YOUR BONUS. CLEAN LANDINGS ADD +250.
            </p>
            <p className="service-note">
              BOMB RUNS: ORANGE RINGS MARK THE LANDING ZONE. SHOOT BOMBS FOR +50, CHANGE SPEED TO
              EVADE, OR JUMP THE CRATER. FLIGHT FRAMING STAYS STEADY AT EVERY SPEED.
            </p>
            <button className="launch-button" onClick={() => setHelp(false)}>
              <span>UNDERSTOOD</span>
              <ArrowRight size={18} />
            </button>
          </Modal>
        )}
        {hangar && (
          <Modal
            title="Rover loadout"
            eyebrow="RV–06 / WEAPON LOADOUT"
            close={() => setHangar(false)}
            key="hangar"
          >
            <p className="modal-intro">
              One Fire control powers both batteries. Choose how you clear the way.
            </p>
            <div className="loadout-picker">
              <h4>01 / FORWARD BATTERY</h4>
              {groundWeapons.map((w) => (
                <button
                  key={w.id}
                  className={ground === w.id ? 'selected' : ''}
                  aria-pressed={ground === w.id}
                  onClick={() => setGround(w.id)}
                >
                  <span>
                    <b>{w.name}</b>
                    <small>{w.detail}</small>
                  </span>
                  <i>{ground === w.id ? '●' : '○'}</i>
                </button>
              ))}
              <h4>02 / ANTI-AIR TURRET</h4>
              {skyWeapons.map((w) => (
                <button
                  key={w.id}
                  className={sky === w.id ? 'selected' : ''}
                  aria-pressed={sky === w.id}
                  onClick={() => setSky(w.id)}
                >
                  <span>
                    <b>{w.name}</b>
                    <small>{w.detail}</small>
                  </span>
                  <i>{sky === w.id ? '●' : '○'}</i>
                </button>
              ))}
            </div>
            <button className="launch-button" onClick={() => setHangar(false)}>
              <span>CONFIRM LOADOUT</span>
              <ArrowRight size={18} />
            </button>
          </Modal>
        )}
      </AnimatePresence>
      {error && (
        <div role="alert" className="error-box">
          <strong>System message</strong>
          <p>{error}</p>
          <button
            onClick={() => {
              if (!ready) location.reload();
              else setError('');
            }}
          >
            {ready ? 'DISMISS' : 'RETRY INITIALIZATION'}
          </button>
        </div>
      )}
    </main>
  );
}
function Meter({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="meter">
      <div>
        <small>
          {icon}
          {label}
        </small>
        <span>
          {Math.round(value)}
          <em>%</em>
        </span>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <motion.i
          animate={{ scaleX: value / 100 }}
          transition={{ duration: 0.1 }}
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function Modal({
  children,
  title,
  eyebrow,
  close,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow: string;
  close?: () => void;
}) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.focus();
    return () => {
      // An exiting panel must not steal focus from a replacement command panel.
      const replacement = Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (node) => node !== dialog,
      );
      if (replacement || document.querySelector('.phase-playing')) return;
      if (
        prev?.isConnected &&
        (dialog?.contains(document.activeElement) || document.activeElement === document.body)
      )
        prev.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      aria-hidden={!present}
      style={{ pointerEvents: present ? 'auto' : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            const items = ref.current?.querySelectorAll<HTMLButtonElement>('button');
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {close && (
          <button className="modal-close icon-button" onClick={close} aria-label="Close dialog">
            <X size={20} />
          </button>
        )}
        <div className="eyebrow">
          <span className="orange-line" />
          {eyebrow}
        </div>
        <h2>{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}
