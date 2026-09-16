import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Expand,
  Gauge,
  Orbit,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { Game, type Loadout } from './game/engine';
import { BIOMES, initialTelemetry, SECTOR_LENGTH, type Weapon, type SkyWeapon } from './game/rules';
const groundWeapons = [
  { id: 'pulse', name: 'Pulse Vulcan', detail: 'Rapid plasma · balanced heat' },
  { id: 'beam', name: 'Resonance Beam', detail: 'Sustained energy · high heat' },
  { id: 'seismic', name: 'Seismic Spreader', detail: 'Surface shockwave · heavy impact' },
] as const;
const skyWeapons = [
  { id: 'flak', name: 'Flak Cannon', detail: 'Airburst shells · swarm control' },
  { id: 'rail', name: 'Tachyon Railgun', detail: 'Penetrating bolts · slow cadence' },
  { id: 'seeker', name: 'Seeker Missiles', detail: 'Four guided rockets · target tracking' },
] as const;
const controls = [
  ['A / ←', 'Brake to 40% cruise'],
  ['D / → / SHIFT', 'Overdrive · consumes capacitor'],
  ['SPACE', 'Jump · hold to hover'],
  ['A / D in air', 'Pitch for a clean landing'],
  ['J / Z', 'Fire both weapon axes'],
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
  const host = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null);
  const [s, setState] = useState(initialTelemetry()),
    [error, setError] = useState(''),
    [help, setHelp] = useState(false),
    [hangar, setHangar] = useState(false),
    [muted, setMuted] = useState(false);
  const [ground, setGround] = useState<Weapon>('pulse'),
    [sky, setSky] = useState<SkyWeapon>('flak');
  const ready = s.backend !== 'INITIALIZING',
    menu = s.phase === 'menu',
    biome = BIOMES[s.biome],
    playing = s.phase === 'playing';
  useEffect(() => {
    const engine = new Game(
      host.current!,
      (state) => {
        setState(state);
        setMuted(!engine.audio.enabled);
      },
      setError,
    );
    game.current = engine;
    if (import.meta.env.DEV) (window as unknown as { __voidRunner: Game }).__voidRunner = engine;
    void engine.init();
    return () => {
      engine.dispose();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && (help || hangar)) {
        e.stopImmediatePropagation();
        setHelp(false);
        setHangar(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [help, hangar]);
  useEffect(() => {
    if (game.current) game.current.overlayOpen = help || hangar;
  }, [help, hangar]);
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
    setHelp(true);
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
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (playing) game.current?.pause();
          }}
          aria-label="Void Runner"
        >
          <span className="brand-symbol">
            <Orbit size={23} />
          </span>
          <span>
            VOID<span className="brand-thin">RUNNER</span>
            <small>MOON PATROL PROJECT</small>
          </span>
        </a>
        <div className="header-center">
          <span className="tiny-square" /> EXPEDITION PROGRAM <span className="divider">/</span>{' '}
          <b>001</b>
        </div>
        <div className="header-actions">
          <span className="engine-label">
            <span className={'status-dot ' + (ready ? '' : 'loading')} />
            {ready ? s.backend : 'BOOTING'}
          </span>
          <button
            className="icon-button"
            onClick={toggleAudio}
            title={muted ? 'Enable audio' : 'Mute audio'}
            aria-label={muted ? 'Enable audio' : 'Mute audio'}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            className="icon-button"
            onClick={openHelp}
            aria-label="Flight manual"
            title="Flight manual"
          >
            <CircleHelp size={17} />
          </button>
          <button
            className="icon-button"
            onClick={full}
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            <Expand size={16} />
          </button>
        </div>
      </header>
      <AnimatePresence mode="wait">
        {menu ? (
          <motion.section
            key="menu"
            className="mission-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="orange-line" /> LUNAR EXPEDITION / A—Z
              </div>
              <h1>
                THE QUIET
                <br />
                WON’T LAST<span>.</span>
              </h1>
              <p>
                Six wheels. Two guns. One way forward.
                <br />
                Carve a path through the edge of the unknown.
              </p>
              <button className="launch-button" onClick={start} disabled={!ready}>
                <span>{ready ? 'BEGIN EXPEDITION' : 'INITIALIZING SYSTEMS'}</span>
                {ready ? <ArrowRight size={21} /> : <span className="spinner" />}
              </button>
              <div className="launch-note">
                <span className="status-dot" />{' '}
                {ready ? 'ROVER SYSTEMS NOMINAL' : 'CONNECTING ROVER SYSTEMS'}
                <span>01 / 05 BIOMES</span>
              </div>
            </div>
            <aside className="mission-card">
              <div className="card-head">
                <span>DEPLOYMENT ZONE</span>
                <ArrowUpRight size={16} />
              </div>
              <div className="planet-mark">
                <Orbit size={45} strokeWidth={0.7} />
                <span>01</span>
              </div>
              <h2>
                Mare
                <br />
                Tranquillitatis
              </h2>
              <p>THE SEA OF TRANQUILITY</p>
              <div className="coordinates">00° 40′ 26.7″ N &nbsp; 23° 28′ 22.7″ E</div>
              <div className="environment-row">
                <span>SECTORS</span>
                <b>A — E</b>
              </div>
              <div className="environment-row">
                <span>GRAVITY</span>
                <b>LOW</b>
              </div>
              <div className="environment-row">
                <span>HOSTILITY</span>
                <b className="amber">UNCONFIRMED</b>
              </div>
              <div className="transmission">
                <Radio size={13} />
                <span>Last transmission: 04:32 UTC</span>
              </div>
            </aside>
            <div className="rover-label">
              <span className="label-line" />
              <div>
                <b>RV–06 “NOMAD”</b>
                <span>ALL-TERRAIN RECONNAISSANCE VEHICLE</span>
              </div>
            </div>
            <div className="loadout-dock">
              <div className="dock-caption">
                <span className="eyebrow">PRE-FLIGHT CHECK</span>
                <h3>
                  Built for the
                  <br />
                  unforgiving.
                </h3>
                <button className="text-button" onClick={() => setHangar(true)}>
                  CONFIGURE ROVER <ArrowUpRight size={14} />
                </button>
              </div>
              <button className="weapon-card" onClick={() => setHangar(true)}>
                <span className="weapon-icon">
                  <Crosshair size={29} strokeWidth={1} />
                </span>
                <span>
                  <small>01 / FORWARD BATTERY</small>
                  <b>{groundWeapons.find((w) => w.id === ground)!.name}</b>
                  <em>{groundWeapons.find((w) => w.id === ground)!.detail}</em>
                </span>
                <ChevronRight size={16} />
              </button>
              <button className="weapon-card" onClick={() => setHangar(true)}>
                <span className="weapon-icon">
                  <ArrowUpRight size={32} strokeWidth={1} />
                </span>
                <span>
                  <small>02 / ANTI-AIR TURRET</small>
                  <b>{skyWeapons.find((w) => w.id === sky)!.name}</b>
                  <em>{skyWeapons.find((w) => w.id === sky)!.detail}</em>
                </span>
                <ChevronRight size={16} />
              </button>
              <div className="record">
                <small>PERSONAL BEST</small>
                <b>{fmt(s.best).padStart(6, '0')}</b>
                <span>MAKE YOUR MARK</span>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="hud"
            className="hud"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="telemetry">
              <div className="speed">
                <small>
                  <Gauge size={13} /> GROUND SPEED
                </small>
                <div>
                  {Math.round(s.speed * 3.6)
                    .toString()
                    .padStart(3, '0')}
                  <span>KM/H</span>
                </div>
                <b>{s.speed > 26 ? 'OVERDRIVE' : s.speed < 12 ? 'BRAKING' : 'CRUISE'}</b>
              </div>
              <div className="gauges">
                <Meter
                  label="OVERDRIVE CAPACITOR"
                  value={s.capacitor}
                  icon={<Zap size={12} />}
                  color="var(--accent)"
                />
                <Meter
                  label={
                    s.lockout > 0
                      ? 'CORE LOCKOUT ' + s.lockout.toFixed(1) + 's'
                      : 'AUXILIARY CORE HEAT'
                  }
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
            <div className="scoreboard">
              <small>EXPEDITION SCORE</small>
              <b>{fmt(s.score).padStart(6, '0')}</b>
              <span>
                {time(s.time)} <i /> {fmt(s.distance)} M
              </span>
              <button
                className="pause-button"
                onClick={() => game.current?.pause()}
                aria-label="Pause game"
              >
                <Pause size={13} /> PAUSE <kbd>ESC</kbd>
              </button>
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
                  {s.notice}
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
            <div className="sector-caption">
              <small>SECTOR {String.fromCharCode(65 + s.sector)}</small>
              <h3>{biome.name}</h3>
              <span>{biome.sub}</span>
            </div>
            <div className="route">
              <div className="route-label">
                <span>EXPEDITION PROGRESS</span>
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
              <div className="route-biomes">
                {BIOMES.map((b, i) => (
                  <span key={b.name} className={s.biome === i ? 'active' : ''}>
                    {b.name}
                  </span>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <footer className="bottom-bar">
        <div className="keyboard-hints">
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> SPEED
          </span>
          <span>
            <kbd>SPACE</kbd> JUMP / HOVER
          </span>
          <span>
            <kbd>J</kbd> DUAL FIRE
          </span>
          <span>
            <kbd>K</kbd> VENT
          </span>
        </div>
        <button onClick={openHelp} className="text-button">
          FLIGHT MANUAL <ArrowUpRight size={12} />
        </button>
        <span className="build-label">
          {s.fps > 0 ? s.fps + ' FPS' : '— FPS'} <i /> BUILD 0.1 / EXPLORER
        </span>
      </footer>
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
              onPointerCancel={() => game.current?.touch.delete(key)}
              onLostPointerCapture={() => game.current?.touch.delete(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {s.hull < 30 && playing && <div className="damage-vignette" />}
      <AnimatePresence>
        {s.phase === 'paused' && !help && (
          <Modal title="A moment of silence." eyebrow="EXPEDITION PAUSED" key="paused">
            <p className="modal-intro">Your rover is holding position. The void can wait.</p>
            <button className="launch-button" onClick={() => game.current?.pause()}>
              <span>RESUME EXPEDITION</span>
              <Play size={18} />
            </button>
            <div className="modal-links">
              <button onClick={openHelp}>FLIGHT MANUAL</button>
              <button onClick={() => game.current?.menu()}>RETURN TO BASE</button>
            </div>
          </Modal>
        )}
        {s.phase === 'report' && (
          <Modal
            title="Checkpoint secured."
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
          </Modal>
        )}
        {(s.phase === 'dead' || s.phase === 'complete') && (
          <Modal
            title={s.phase === 'dead' ? 'Signal lost.' : 'Beyond the void.'}
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
            <button className="launch-button" onClick={start}>
              <span>RUN IT AGAIN</span>
              <RotateCcw size={18} />
            </button>
            <button className="return-button" onClick={() => game.current?.menu()}>
              RETURN TO BASE
            </button>
          </Modal>
        )}
        {help && (
          <Modal
            title="Know your rover."
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
            <button className="launch-button" onClick={() => setHelp(false)}>
              <span>UNDERSTOOD</span>
              <ArrowRight size={18} />
            </button>
          </Modal>
        )}
        {hangar && (
          <Modal
            title="Make it yours."
            eyebrow="RV–06 / WEAPON LOADOUT"
            close={() => setHangar(false)}
            key="hangar"
          >
            <p className="modal-intro">
              Both batteries fire together. Choose how you clear the way.
            </p>
            <div className="loadout-picker">
              <h4>01 / FORWARD BATTERY</h4>
              {groundWeapons.map((w) => (
                <button
                  key={w.id}
                  className={ground === w.id ? 'selected' : ''}
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
      <div className="meter-track">
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus();
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
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
