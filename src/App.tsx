import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useIsPresent } from 'framer-motion';
import {
  AudioLines,
  ChevronRight,
  Crosshair,
  Expand,
  Pause,
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
// Attract-mode ticker on the title screen: the route, then a few field tips.
const attract = [
  ...BIOMES.map((b) => `SECTORS ${b.range.replace(/ — /, '–')} · ${b.name.toUpperCase()}`),
  'TIP · HOLD JUMP TO HOVER OVER WIDE CHASMS',
  'TIP · VENT THE CORE BEFORE THE GUNS LOCK',
  'TIP · CLEAN LANDINGS BANK +250',
];
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const pad = (n: number) => Math.floor(n).toString().padStart(6, '0');
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
  // Title cursor follows keyboard focus and pointer hover; with nothing focused,
  // it rests on the first item because Enter from the title starts a run.
  const [selected, setSelected] = useState(0),
    [tick, setTick] = useState(0);
  const runBest = useRef(s.best);
  const ready = s.backend !== 'INITIALIZING',
    menu = s.phase === 'menu',
    biome = BIOMES[s.biome],
    playing = s.phase === 'playing',
    ended = s.phase === 'dead' || s.phase === 'complete',
    groundName = groundWeapons.find((w) => w.id === ground)!.name,
    skyName = skyWeapons.find((w) => w.id === sky)!.name,
    newRecord = ended && s.score >= 1 && Math.floor(s.score) > runBest.current;
  useEffect(() => {
    // A fresh run starts at zero time; checkpoint recovery keeps its time.
    if (s.phase === 'playing' && s.time < 1) runBest.current = s.best;
  }, [s.phase]);
  useEffect(() => {
    if (!menu) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 3200);
    return () => window.clearInterval(id);
  }, [menu]);
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
      if (['ArrowDown', 'ArrowUp', 'KeyW', 'KeyS', 'Home', 'End'].includes(event.code)) {
        const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []).filter(
          (button) => !button.disabled,
        );
        if (!buttons.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const up = event.code === 'ArrowUp' || event.code === 'KeyW';
        // The first press wakes the resting cursor on the first item.
        const next =
          event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? buttons.length - 1
              : current < 0
                ? 0
                : up
                  ? current === 0
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
  const menuItems: {
    key: string;
    text: string;
    label?: string;
    described?: string;
    hint: string;
    action: () => void;
    disabled?: boolean;
  }[] = [
    {
      key: 'start',
      text: ready ? 'BEGIN EXPEDITION' : 'INITIALIZING',
      hint: ready ? `SECTOR A/26 · ${BIOMES[0].name.toUpperCase()}` : 'WARMING UP THE RENDERER',
      action: start,
      disabled: !ready,
    },
    {
      key: 'hangar',
      text: 'CONFIGURE ROVER',
      described: 'title-loadout',
      hint: `EQUIPPED · ${groundName} + ${skyName}`.toUpperCase(),
      action: () => setHangar(true),
    },
    {
      key: 'graphics',
      text: 'GRAPHICS',
      label: 'Graphics settings',
      hint: `DETAIL · ${GRAPHICS_PRESETS[s.quality].label} · ${s.backend}`.toUpperCase(),
      action: openGraphics,
      disabled: !ready,
    },
    {
      key: 'help',
      text: 'FLIGHT MANUAL',
      label: 'Flight manual',
      hint: 'CONTROLS · SCORING · FIELD NOTES',
      action: openHelp,
    },
  ];
  return (
    <MotionConfig reducedMotion="user">
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
              className="mission-screen title-screen crt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.35 }}
            >
              <div className="title-record">
                <small>HI-SCORE</small>
                <b>{pad(s.best)}</b>
              </div>
              <div className="title-content">
                <div className="title-lockup">
                  <div className="title-kicker">MOON PATROL</div>
                  <h1 className="game-title" aria-label="Void Runner">
                    <span className="logo-word logo-void" data-text="VOID">
                      VOID
                    </span>
                    <span className="logo-word logo-runner" data-text="RUNNER">
                      RUNNER
                    </span>
                  </h1>
                  <div className="title-tagline">AN ARCADE LUNAR EXPEDITION</div>
                </div>
                <div className="title-console">
                  <div
                    className={'press-start' + (ready ? '' : ' loading')}
                    aria-hidden="true"
                    onClick={ready ? start : undefined}
                  >
                    {ready ? (
                      <>
                        <span className="prompt-key">PRESS ENTER</span>
                        <span className="prompt-touch">TAP TO START</span>
                      </>
                    ) : (
                      'LOADING'
                    )}
                  </div>
                  <nav
                    className="title-menu arcade-menu"
                    aria-label="Main menu"
                    ref={menuRef}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSelected(0);
                    }}
                  >
                    {menuItems.map((item, i) => (
                      <button
                        key={item.key}
                        className={
                          (i === 0 ? 'menu-primary' : '') + (i === selected ? ' is-selected' : '')
                        }
                        onClick={item.action}
                        disabled={item.disabled}
                        aria-label={item.label}
                        aria-describedby={item.described}
                        onFocus={() => setSelected(i)}
                        onPointerEnter={(e) => {
                          if (e.pointerType === 'mouse' && !item.disabled)
                            e.currentTarget.focus({ preventScroll: true });
                        }}
                      >
                        <span>{item.text}</span>
                      </button>
                    ))}
                  </nav>
                  <p className="title-hint">{menuItems[selected]?.hint}</p>
                  <span id="title-loadout" className="sr-only">
                    Equipped: {groundName} and {skyName}
                  </span>
                  <div className="menu-input-hint" aria-hidden="true">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> SELECT <kbd>ENTER</kbd> CONFIRM <kbd>ESC</kbd> BACK
                  </div>
                </div>
              </div>
              <footer className="title-footer">
                <p className="title-attract" key={tick % attract.length}>
                  {attract[tick % attract.length]}
                </p>
                <p className="title-credits">© 2026 KNOTENVY · PUBLIC BETA</p>
              </footer>
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
                  SCORE <em>HI {pad(s.best)}</em>
                </small>
                <b>{pad(s.score)}</b>
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
            <Modal
              title="Paused"
              eyebrow="EXPEDITION PAUSED"
              onEscape={() => game.current?.pause()}
              key="paused"
            >
              <p className="modal-intro">Your rover is holding position.</p>
              <div className="panel-actions arcade-menu">
                <button className="menu-primary" onClick={() => game.current?.pause()}>
                  <span>RESUME EXPEDITION</span>
                </button>
                <button onClick={openHelp} aria-label="Flight manual">
                  <span>FLIGHT MANUAL</span>
                </button>
                <button onClick={openGraphics}>
                  <span>GRAPHICS</span>
                </button>
                <button onClick={() => game.current?.menu()}>
                  <span>RETURN TO BASE</span>
                </button>
              </div>
            </Modal>
          )}
          {s.phase === 'report' && !help && !graphics && (
            <Modal
              title="Checkpoint secured"
              eyebrow={
                'SECTOR ' + String.fromCharCode(64 + s.sector) + ' CLEAR · EXPEDITION REPORT'
              }
              tone="success"
              key="report"
            >
              <p className="modal-intro">
                A little further from home. A little closer to the answer.
              </p>
              <div className="tally">
                <Stat label="SECTOR TIME" value={time(s.reportTime)} />
                <Stat label="PAR TIME" value="01:05" />
                <Stat label="THREATS CLEARED" value={String(s.reportKills)} />
                <Stat label="CLEAN LANDINGS" value={String(s.reportClean)} />
                <Stat label="DAMAGE TAKEN" value={String(s.reportDamage)} />
                <Stat label="CHECKPOINT BONUS" value={'+' + fmt(s.reportBonus)} accent />
              </div>
              <p className="service-note">
                FIELD SERVICE: +25 HULL · CAPACITOR REFILLED · CORE COOLED
              </p>
              <div className="panel-actions arcade-menu">
                <button className="menu-primary" onClick={() => game.current?.continue()}>
                  <span>CONTINUE EXPEDITION</span>
                </button>
                <button onClick={openGraphics} aria-label="Graphics settings">
                  <span>GRAPHICS</span>
                </button>
              </div>
            </Modal>
          )}
          {ended && !help && !graphics && (
            <Modal
              title={s.phase === 'dead' ? 'Rover destroyed' : 'Expedition complete'}
              eyebrow={
                s.phase === 'dead' ? 'GAME OVER · TELEMETRY OFFLINE' : 'ALL SECTORS CLEAR · A–Z'
              }
              tone={s.phase === 'dead' ? 'danger' : 'success'}
              key="end"
            >
              <p className="modal-intro">
                {s.phase === 'dead'
                  ? 'The moon keeps its secrets. Take what you learned into the next run.'
                  : 'The orbital core is silent. Your transmission made it home.'}
              </p>
              <div className="end-score">
                <small>FINAL SCORE</small>
                <strong>{pad(s.score)}</strong>
                {newRecord && <em className="new-record">NEW HIGH SCORE</em>}
              </div>
              <div className="tally">
                <Stat label="DISTANCE" value={fmt(s.distance) + ' M'} />
                <Stat label="EXPEDITION TIME" value={time(s.time)} />
                <Stat label="TARGETS DESTROYED" value={String(s.kills)} />
                <Stat label="HI-SCORE" value={pad(s.best)} accent />
              </div>
              {s.phase === 'dead' && s.checkpoint > 0 && (
                <p className="service-note">
                  RECOVER RESTARTS THIS LEG WITH FULL HULL AND ENERGY. SCORE AND PROGRESS RETURN TO
                  YOUR CHECKPOINT.
                </p>
              )}
              <div className="panel-actions arcade-menu">
                {s.phase === 'dead' && s.checkpoint > 0 && (
                  <button className="menu-primary" onClick={() => game.current?.retryCheckpoint()}>
                    <span>RECOVER AT CHECKPOINT {String.fromCharCode(64 + s.checkpoint)}</span>
                  </button>
                )}
                <button
                  className={s.phase === 'dead' && s.checkpoint > 0 ? '' : 'menu-primary'}
                  onClick={start}
                >
                  <span>RUN IT AGAIN</span>
                </button>
                <button onClick={() => game.current?.menu()}>
                  <span>RETURN TO BASE</span>
                </button>
                <button onClick={openGraphics} aria-label="Graphics settings">
                  <span>GRAPHICS</span>
                </button>
              </div>
            </Modal>
          )}
          {graphics && (
            <Modal
              title="Graphics"
              eyebrow="OPTIONS · DISPLAY"
              close={() => setGraphics(false)}
              key="graphics"
            >
              <p className="modal-intro">
                Choose the detail level that keeps your expedition flowing. Balanced is the starting
                point.
              </p>
              <div className="option-list" role="group" aria-label="Graphics quality">
                {(Object.keys(GRAPHICS_PRESETS) as GraphicsQuality[]).map((quality) => (
                  <button
                    key={quality}
                    className={s.quality === quality ? 'selected' : ''}
                    aria-pressed={s.quality === quality}
                    onClick={() => game.current?.setQuality(quality)}
                  >
                    <span>
                      <b>{GRAPHICS_PRESETS[quality].label}</b>
                      <small>
                        {s.backend === 'WEBGL 2' && quality !== 'performance'
                          ? quality === 'cinematic'
                            ? 'Sharper surfaces · higher resolution'
                            : 'Detailed surfaces · standard resolution'
                          : GRAPHICS_PRESETS[quality].detail}
                      </small>
                    </span>
                    {s.quality === quality && <i>ACTIVE</i>}
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
              <div className="panel-actions arcade-menu">
                <button className="menu-primary" onClick={() => setGraphics(false)}>
                  <span>DONE</span>
                </button>
              </div>
            </Modal>
          )}
          {help && (
            <Modal
              title="Flight manual"
              eyebrow="RV–06 · FLIGHT MANUAL"
              close={() => setHelp(false)}
              key="help"
            >
              <p className="modal-intro">
                Forward motion is automatic. Read the terrain, manage your energy, and keep both
                skies and ground clear.
              </p>
              <h3 className="panel-section">CONTROLS</h3>
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
              <h3 className="panel-section">FIELD NOTES</h3>
              <div className="manual-tip">
                <Zap size={16} aria-hidden="true" />
                <p>
                  Release jump between launches. Hover and boost share the capacitor. Weapons lock
                  for 3 seconds at full heat. Checkpoints repair 25 hull.
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
              <div className="panel-actions arcade-menu">
                <button className="menu-primary" onClick={() => setHelp(false)}>
                  <span>UNDERSTOOD</span>
                </button>
              </div>
            </Modal>
          )}
          {hangar && (
            <Modal
              title="Rover loadout"
              eyebrow="RV–06 NOMAD · HANGAR"
              close={() => setHangar(false)}
              key="hangar"
            >
              <p className="modal-intro">
                One Fire control powers both batteries. Choose how you clear the way.
              </p>
              <div className="option-list">
                <h3 className="panel-section">01 · FORWARD BATTERY</h3>
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
                    {ground === w.id && <i>EQUIPPED</i>}
                  </button>
                ))}
                <h3 className="panel-section">02 · ANTI-AIR TURRET</h3>
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
                    {sky === w.id && <i>EQUIPPED</i>}
                  </button>
                ))}
              </div>
              <div className="panel-actions arcade-menu">
                <button className="menu-primary" onClick={() => setHangar(false)}>
                  <span>CONFIRM LOADOUT</span>
                </button>
              </div>
            </Modal>
          )}
        </AnimatePresence>
        {error && (
          <div role="alert" className="error-box panel tone-danger">
            <strong>SYSTEM MESSAGE</strong>
            <p>{error}</p>
            <div className="panel-actions arcade-menu">
              <button
                className="menu-primary"
                onClick={() => {
                  if (!ready) location.reload();
                  else setError('');
                }}
              >
                <span>{ready ? 'DISMISS' : 'RETRY INITIALIZATION'}</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </MotionConfig>
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
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={'stat' + (accent ? ' accent' : '')}>
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
  tone,
  onEscape,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow: string;
  close?: () => void;
  tone?: 'danger' | 'success';
  onEscape?: () => void;
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
        className={'modal panel' + (tone ? ' tone-' + tone : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        onPointerOver={(e) => {
          // Mouse hover moves the selector, as in the title menu.
          const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
            '.panel-actions button',
          );
          if (e.pointerType === 'mouse' && button && document.activeElement !== button)
            button.focus({ preventScroll: true });
        }}
        onKeyDown={(e) => {
          // The engine ignores keys aimed at buttons, so a selected panel button
          // would otherwise swallow the Escape that resumes from Pause.
          if (e.key === 'Escape' && onEscape && (e.target as HTMLElement).closest('button')) {
            e.preventDefault();
            e.stopPropagation();
            onEscape();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // Panels navigate like the title menu: up/down moves the selector.
            const items = Array.from(
              ref.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(.modal-close):not(:disabled)',
              ) ?? [],
            );
            if (!items.length) return;
            e.preventDefault();
            const i = items.indexOf(document.activeElement as HTMLButtonElement),
              down = e.key === 'ArrowDown';
            const next =
              i < 0
                ? down
                  ? 0
                  : items.length - 1
                : (i + (down ? 1 : items.length - 1)) % items.length;
            items[next].focus();
          } else if (e.key === 'Tab') {
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
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}
