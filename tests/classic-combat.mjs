import { gameUrl, launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Controlled integration scenarios. Full-run audits separately exercise ordinary physics/balance.
await fs.mkdir('test-results', { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const result = {};
try {
  await page.goto(gameUrl({ renderer: 'webgl', quality: 'cinematic' }));
  await page
    .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
    .click({ timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__voidRunner.state.backend), 'WEBGL 2');
  await page.evaluate(() => {
    const g = window.__voidRunner;
    window.__classicGame = g;
    window.__classicStep = g.step.bind(g);
    g.step = () => {};
    g.audio.enabled = false;
    window.__classicNone = {
      brake: false,
      boost: false,
      jump: false,
      fire: false,
      vent: false,
      pitch: 0,
    };
    window.__classicPark = (x = 20, speed = 20) => {
      g.body.setTranslation({ x, y: 2, z: 0 }, true);
      g.body.setLinvel({ x: speed, y: 0, z: 0 }, true);
      g.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      g.current.set(x, 2, 0);
      g.previous.copy(g.current);
      g.accumulator = 0;
      g.state.speed = speed;
      g.trauma = 0;
    };
    window.__classicStart = (loadout) => {
      g.start(loadout);
      g.spawnAt = Infinity;
      g.nextReport = 26;
      g.invulnerable = 999;
      window.__classicPark();
    };
  });
  result.camera = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    result.camera.push(
      await page.evaluate((width) => {
        const g = window.__voidRunner,
          none = window.__classicNone;
        window.__classicStart();
        for (let i = 0; i < 360; i++) g.render(1 / 60, none);
        const sample = () => {
          const rover = g.rover.group.position;
          const center = rover.clone().project(g.camera);
          const edge = rover.clone();
          edge.x += 2;
          const projectedEdge = edge.project(g.camera);
          return [
            g.camera.fov,
            g.camera.position.x - rover.x,
            g.camera.position.y,
            g.camera.position.z,
            ...g.camera.quaternion.toArray(),
            center.x,
            center.y,
            projectedEdge.distanceTo(center),
            g.graphics.fringe.value,
          ];
        };
        const base = sample();
        const captures = [];
        for (const [name, speed, boost, brake, capacitor] of [
          ['cruise', 20, false, false, 100],
          ['tap-on', 21, true, false, 98],
          ['tap-off', 21, false, false, 98],
          ['held', 36, true, false, 70],
          ['brake', 8, false, true, 70],
          ['empty', 20, true, false, 0],
        ]) {
          window.__classicPark(120 + captures.length * 35, speed);
          g.state.capacitor = capacitor;
          g.render(1 / 60, { ...none, boost, brake });
          g.graphics.render(0);
          const values = sample();
          captures.push({
            name,
            values,
            maxDifference: Math.max(...values.map((v, i) => Math.abs(v - base[i]))),
          });
        }
        return { width, captures };
      }, width),
    );
  }
  for (const view of result.camera)
    for (const capture of view.captures)
      assert(capture.maxDifference < 1e-6, `Camera reframed at ${view.width}/${capture.name}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  result.encounters = await page.evaluate(async () => {
    const g = window.__voidRunner,
      dt = 1 / 60;
    const runs = [];
    const shoot = g.shoot.bind(g);
    let releases = 0;
    g.shoot = (...args) => {
      const shot = shoot(...args);
      if (shot && args[0] === 'bomb' && args[6]) releases++;
      return shot;
    };
    for (const sky of ['flak', 'rail', 'seeker']) {
      releases = 0;
      window.__classicStart({
        ground: sky === 'rail' ? 'beam' : sky === 'seeker' ? 'seismic' : 'pulse',
        sky,
      });
      g.spawn('bomber', 78, 16);
      for (let i = 0; i < 3; i++) g.spawn('drone', 64 + i * 4, 12 + i);
      let cooling = false;
      let lastAlive = 0,
        firstKill,
        bombMax = 0;
      for (let i = 0; i < 1500 && g.enemies.length; i++) {
        const t = i * dt;
        // Fixed road segment isolates weapons/choreography; keep the actual energy/weapon rules.
        window.__classicPark(20, 20);
        if (g.state.heat > 78 || g.state.lockout > 0) cooling = true;
        if (g.state.heat < 20 && g.state.lockout === 0) cooling = false;
        const fire = !cooling && (sky !== 'rail' || g.state.railCharge < 0.95);
        window.__classicStep({ ...window.__classicNone, fire, vent: cooling });
        await g.terrain.queue;
        if (g.state.kills && firstKill === undefined) firstKill = t;
        if (g.enemies.length) lastAlive = t;
        const bombs = g.shots.filter((s) => s.active && s.enemy && s.type === 'bomb');
        bombMax = Math.max(bombMax, bombs.length);
      }
      runs.push({ sky, firstKill, lastAlive, kills: g.state.kills, releases, bombMax });
    }
    // No-fire encounters keep maneuvering at every driving speed, then leave finitely.
    for (const speed of [8, 20, 36]) {
      releases = 0;
      window.__classicStart();
      g.spawn('bomber', 78, 16);
      const e = g.enemies[0];
      let patrolTicks = 0,
        maxActors = 0;
      for (let i = 0; i < 1500 && g.enemies.length; i++) {
        window.__classicPark(20 + speed * i * dt, speed);
        g.elapsed += dt;
        g.bombCooldown = Math.max(0, g.bombCooldown - dt);
        g.updateEnemies(dt, speed === 36);
        maxActors = Math.max(maxActors, g.enemies.length);
        if (e.flight.phase === 'patrol') patrolTicks++;
        if (g.shots.some((s) => s.active)) {
          for (const s of g.shots) s.active = false;
        }
      }
      runs.push({
        speed,
        patrolSeconds: patrolTicks * dt,
        releases,
        maxActors,
        departed: !g.enemies.length,
      });
    }
    g.shoot = shoot;
    return runs;
  });
  for (const run of result.encounters) {
    if (run.sky) {
      assert(run.lastAlive >= 6, `${run.sky} encounter ended too quickly`);
      assert(run.kills >= 1);
    } else {
      assert(run.patrolSeconds > 20);
      assert(run.departed && run.releases >= 1);
    }
  }
  result.stationaryBoss = await page.evaluate(async () => {
    const g = window.__voidRunner,
      dt = 1 / 60;
    window.__classicStart();
    window.__classicPark(20, 0);
    g.spawn('boss', 33, 14);
    const shoot = g.shoot.bind(g),
      releases = [];
    g.shoot = (...args) => {
      const shot = shoot(...args);
      if (shot && args[0] === 'bomb' && args[6]) releases.push(g.elapsed);
      return shot;
    };
    let maxBombs = 0;
    try {
      for (let i = 0; i < 1200; i++) {
        g.elapsed += dt;
        g.bombCooldown = Math.max(0, g.bombCooldown - dt);
        g.updateEnemies(dt, false);
        g.updateShots(dt);
        maxBombs = Math.max(
          maxBombs,
          g.shots.filter((s) => s.active && s.enemy && s.type === 'bomb').length,
        );
        await g.terrain.queue;
      }
      return { releases, maxBombs };
    } finally {
      g.shoot = shoot;
    }
  });
  assert(result.stationaryBoss.releases.length >= 3, 'Stationary boss must keep attacking');
  assert(result.stationaryBoss.maxBombs <= 3);
  for (let i = 1; i < result.stationaryBoss.releases.length; i++)
    assert(result.stationaryBoss.releases[i] - result.stationaryBoss.releases[i - 1] >= 3.05);
  result.bomb = await page.evaluate(async () => {
    const g = window.__voidRunner,
      dt = 1 / 60;
    window.__classicStart();
    g.spawn('bomber', 78, 16);
    const e = g.enemies[0];
    e.flight.age = 2;
    e.timer = 3.6;
    // Real planner set to lock a seam target. No direct carve call in this fixture.
    g.state.speed = 0;
    window.__classicPark(50, 0);
    g.updateEnemies(0, false);
    const target = e.drop.x,
      before = g.terrain.heightAt(target);
    let warning = 0;
    while (e.drop && warning < 2) {
      g.updateEnemies(dt, false);
      warning += dt;
    }
    const bomb = g.shots.find((s) => s.active && s.enemy);
    const release = { x: bomb.x, y: bomb.y, target: bomb.impactX, warning };
    let fall = 0;
    while (bomb.active && fall < 4) {
      g.updateShots(dt);
      fall += dt;
      await g.terrain.queue;
    }
    g.world.step();
    const probes = [63.8, 64.2, target].map((x) => {
      const hit = g.world.castRay(
        { origin: { x, y: 30, z: 0 }, dir: { x: 0, y: -1, z: 0 } },
        60,
        true,
        undefined,
        undefined,
        undefined,
        g.body,
      );
      return { x, mesh: g.terrain.heightAt(x), collider: hit ? 30 - hit.timeOfImpact : null };
    });
    return {
      target,
      before,
      after: g.terrain.heightAt(target),
      release,
      impactX: bomb.x,
      fall,
      probes,
    };
  });
  assert.equal(result.bomb.target, 64);
  assert(result.bomb.release.warning >= 0.85);
  assert(result.bomb.after < result.bomb.before - 3);
  assert(Math.abs(result.bomb.impactX - result.bomb.target) < 1);
  for (const p of result.bomb.probes) assert(Math.abs(p.mesh - p.collider) < 0.05);
  result.craterEscape = await page.evaluate(async () => {
    const g = window.__voidRunner;
    for (const e of g.enemies) g.enemyModels.release(e.group);
    g.enemies.length = 0;
    window.__classicPark(54, 8);
    for (let i = 0; i < 400; i++) {
      window.__classicStep({ ...window.__classicNone, brake: true });
      await g.terrain.queue;
    }
    const before = {
      x: g.current.x,
      y: g.current.y,
      speed: g.body.linvel().x,
      contacts: Array.from({ length: 6 }, (_, i) => g.vehicle.wheelIsInContact(i)).filter(Boolean)
        .length,
    };
    for (let i = 0; i < 120; i++) {
      window.__classicStep({ ...window.__classicNone, brake: true, jump: i >= 2 });
      await g.terrain.queue;
    }
    return { before, after: { x: g.current.x, y: g.current.y } };
  });
  assert(result.craterEscape.before.speed < 0.5 && result.craterEscape.before.contacts > 0);
  assert(
    result.craterEscape.after.x > result.craterEscape.before.x + 8,
    'Ordinary jump/hover must escape a bomb crater',
  );
  result.interceptions = await page.evaluate(async () => {
    const g = window.__voidRunner,
      runs = [];
    for (const type of ['pulse', 'flak', 'seeker', 'beam', 'rail']) {
      window.__classicStart({ ground: 'pulse', sky: 'flak' });
      const before = g.terrain.heightAt(30),
        score = g.state.score;
      const bomb = g.shoot(
        'bomb',
        type === 'rail' ? 19.4 : 30,
        type === 'rail' ? 11 : 2.6,
        0,
        0,
        1,
        true,
      );
      if (type === 'beam') g.sustainBeam(1 / 60);
      else if (type === 'rail') g.dischargeRail(1);
      else {
        const shot = g.shoot(type, 27, 2.6, 90, 0, 2, false);
        for (let i = 0; i < 5 && bomb.active; i++) g.updateShots(1 / 60);
        if (shot.active) shot.active = false;
      }
      const intercepted = !bomb.active;
      // Advance again to catch duplicate scores or deferred craters.
      for (let i = 0; i < 180; i++) g.updateShots(1 / 60);
      await g.terrain.queue;
      runs.push({
        type,
        intercepted,
        score: g.state.score - score,
        depth: before - g.terrain.heightAt(30),
      });
    }
    return runs;
  });
  for (const r of result.interceptions) {
    assert(r.intercepted, r.type);
    assert.equal(r.score, 50);
    assert.equal(r.depth, 0);
  }
  result.occlusion = await page.evaluate(() => {
    const g = window.__voidRunner,
      outcomes = [];
    const height = g.terrain.heightAt.bind(g.terrain);
    try {
      for (const weapon of ['beam', 'rail']) {
        window.__classicStart();
        g.terrain.heightAt = (x) => (x >= 27 && x <= 32 ? 20 : height(x));
        const bomb = g.shoot('bomb', 36, weapon === 'rail' ? 15 : 2.6, 0, 0, 1, true);
        if (weapon === 'beam') g.sustainBeam(1 / 60);
        else g.dischargeRail(1);
        outcomes.push({ weapon, protected: bomb.active });
      }
    } finally {
      g.terrain.heightAt = height;
    }
    return outcomes;
  });
  assert(
    result.occlusion.every((o) => o.protected),
    'Terrain must occlude bomb interception',
  );
  result.hunter = await page.evaluate(() => {
    const g = window.__voidRunner,
      outcomes = [];
    for (const condition of ['enter', 'patrol', 'boost', 'dead']) {
      window.__classicStart();
      g.spawn('hunter', 60, 11);
      const e = g.enemies[0],
        dt = 1 / 60;
      e.flight.age = condition === 'enter' ? 0.5 : 2;
      e.flight.entryOffset = 0;
      e.seed = (Math.asin(-8 / 18) - (e.flight.age + dt) * 0.72) / 0.41;
      if (condition === 'dead') e.hp = 0;
      g.updateEnemies(dt, condition === 'boost');
      outcomes.push({
        condition,
        lift: g.body.linvel().y,
        opacity: e.group.userData.tractorBeam.material.opacity,
      });
    }
    return outcomes;
  });
  for (const r of result.hunter)
    assert(r.condition === 'patrol' ? r.lift > 0 : r.lift === 0, r.condition);
  result.impactBalance = await page.evaluate(async () => {
    const g = window.__voidRunner,
      contacts = [];
    for (const kind of ['drone', 'rock', 'skimmer']) {
      window.__classicStart();
      g.invulnerable = 0;
      if (kind === 'drone') {
        g.current.y = 12;
        g.body.setTranslation({ x: 20, y: 12, z: 0 }, true);
      }
      g.spawn(kind, 20, kind === 'drone' ? 12 : 1.5);
      g.updateEnemies(0, false);
      contacts.push({ kind, damage: 100 - g.state.hull });
    }
    window.__classicStart();
    g.invulnerable = 0;
    const before = g.terrain.heightAt(20);
    g.strike(20);
    g.updateStrikes(1.5);
    await g.terrain.queue;
    return {
      contacts,
      strike: { damage: 100 - g.state.hull, depth: before - g.terrain.heightAt(20) },
    };
  });
  assert.deepEqual(
    result.impactBalance.contacts.map((c) => c.damage),
    [10, 18, 22],
  );
  assert.equal(result.impactBalance.strike.damage, 25);
  assert(Math.abs(result.impactBalance.strike.depth - 4) < 0.01);
  result.pool = await page.evaluate(() => {
    const g = window.__voidRunner;
    window.__classicStart();
    const count = g.enemyModels.warmupGroups.length;
    let max = 0,
      overflow = 0;
    const caps = { drone: 8, bomber: 3, hunter: 3, interceptor: 2 },
      kindMax = {};
    for (let round = 0; round < 6; round++) {
      const kinds = ['bomber', 'hunter', 'interceptor', 'drone'];
      kinds.push(...kinds.splice(0, round % 4));
      for (const kind of kinds) for (let i = 0; i < 20; i++) g.spawn(kind, 78 + i, 15);
      max = Math.max(max, g.enemies.length);
      for (const [kind, cap] of Object.entries(caps)) {
        const count = g.enemies.filter((e) => e.kind === kind).length;
        if (count > cap) throw new Error('Per-kind actor cap exceeded');
        kindMax[kind] = Math.max(kindMax[kind] ?? 0, count);
      }
      overflow += g.enemies.filter((e) => !g.enemyModels.owned.has(e.group)).length;
      g.clearEntities();
    }
    return { before: count, after: g.enemyModels.warmupGroups.length, max, kindMax, overflow };
  });
  assert(result.pool.max <= 8);
  assert.equal(result.pool.before, result.pool.after);
  assert.equal(result.pool.overflow, 0);
  // Build a real windup scene, then verify both simulation gates freeze its clocks.
  await page.evaluate(() => {
    const g = window.__voidRunner;
    window.__classicStart();
    window.__classicPark(85, 0);
    g.spawn('bomber', 125, 16);
    g.spawn('drone', 118, 12);
    const e = g.enemies[0];
    e.flight.age = 5;
    e.seed = (Math.asin((8 - 14) / 14) - 5 * 0.55) / 0.41;
    const scout = g.enemies[1];
    scout.flight.age = 6;
    scout.seed = (Math.asin((1 - 12) / 18) - 6 * 0.72) / 0.41;
    e.timer = 3.6;
    g.updateEnemies(0, false);
    g.state.notice = 'CLASSIC PATROL · SHOOT THE BOMB OR CLEAR THE CRATER';
    g.state.warning = '';
    g.emit();
    window.__classicClock = () => [g.elapsed, e.flight.age, e.drop.remaining, g.bombCooldown];
  });
  result.freeze = [];
  for (const phase of ['paused', 'report']) {
    const before = await page.evaluate((phase) => {
      const g = window.__voidRunner;
      g.step = window.__classicStep;
      if (phase === 'paused') g.pause();
      else g.state.phase = phase;
      g.emit();
      return window.__classicClock();
    }, phase);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__classicClock());
    assert.deepEqual(after, before);
    result.freeze.push({ phase, before, after });
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.step = () => {};
      g.state.phase = 'playing';
      g.emit();
    });
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.waitForTimeout(500);
    const aircraft = await page.evaluate(() => {
      const g = window.__voidRunner,
        canvas = g.renderer.domElement.getBoundingClientRect();
      if (g !== window.__classicGame) throw new Error('Source reload reset the controlled fixture');
      return g.enemies
        .filter((e) => e.kind === 'bomber' || e.kind === 'drone')
        .map((e) => {
          e.group.updateMatrixWorld(true);
          const points = [];
          e.group.traverse((o) => {
            if (!o.geometry) return;
            o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
            for (const x of [b.min.x, b.max.x])
              for (const y of [b.min.y, b.max.y])
                for (const z of [b.min.z, b.max.z]) {
                  const p = b.min.clone().set(x, y, z).project(g.camera);
                  points.push({
                    x: canvas.x + ((p.x + 1) * canvas.width) / 2,
                    y: canvas.y + ((1 - p.y) * canvas.height) / 2,
                  });
                }
          });
          return {
            kind: e.kind,
            x: Math.min(...points.map((p) => p.x)),
            right: Math.max(...points.map((p) => p.x)),
            y: Math.min(...points.map((p) => p.y)),
            bottom: Math.max(...points.map((p) => p.y)),
          };
        });
    });
    assert.equal(aircraft.length, 2, 'Controlled aircraft scene must remain populated');
    const panels = await page
      .locator('.telemetry, .scoreboard, .weapon-status')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, right: r.right, y: r.y, bottom: r.bottom };
        }),
      );
    result.visual ??= [];
    result.visual.push({ width, aircraft, panels });
    await page.screenshot({ path: `test-results/classic-combat-${width}.png` });
    for (const a of aircraft) {
      assert(
        a.x >= 0 && a.right <= width && a.y >= (width > 500 ? 72 : 62),
        'Patrol aircraft clipped by viewport',
      );
      for (const p of panels)
        assert(
          a.right <= p.x || p.right <= a.x || a.bottom <= p.y || p.bottom <= a.y,
          `Patrol aircraft hidden by telemetry ${JSON.stringify({ width, a, p })}`,
        );
    }
    const boxes = await page.locator('.threat-marker').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { label: node.textContent, x: r.x, right: r.right, y: r.y, bottom: r.bottom };
      }),
    );
    assert(boxes.length <= (width < 500 ? 2 : 3));
    for (const b of boxes) assert(b.x >= 0 && b.right <= width, JSON.stringify(b));
    const warning = (await page.locator('.warning-banner').count())
      ? await page.locator('.warning-banner').boundingBox()
      : null;
    for (const [i, a] of boxes.entries()) {
      if (warning)
        assert(
          a.bottom <= warning.y || a.y >= warning.y + warning.height,
          'Threat overlaps warning banner',
        );
      for (const b of boxes.slice(i + 1))
        assert(
          a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
          'Threat labels overlap',
        );
    }
    await page.screenshot({ path: `test-results/classic-combat-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  result.fallingScene = await page.evaluate(async () => {
    const g = window.__voidRunner;
    g.updateEnemies(0.85, false);
    for (let i = 0; i < 40; i++) {
      g.elapsed += 1 / 60;
      g.updateShots(1 / 60);
      await g.terrain.queue;
    }
    g.emit();
    return { bombs: g.shots.filter((s) => s.active && s.enemy && s.type === 'bomb').length };
  });
  assert.equal(result.fallingScene.bombs, 1);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/classic-combat-falling.png' });
  result.retry = await page.evaluate(() => {
    const g = window.__voidRunner;
    g.state.phase = 'report';
    g.state.sector = 5;
    g.continue();
    g.state.phase = 'dead';
    g.retryCheckpoint();
    return {
      actors: g.enemies.length,
      bombs: g.shots.filter((s) => s.active && s.enemy).length,
      targets: g.bombTargets.count,
      cooldown: g.bombCooldown,
    };
  });
  assert.deepEqual(result.retry, { actors: 0, bombs: 0, targets: 0, cooldown: 0 });
  assert.deepEqual(errors, []);
  console.log(
    'CLASSIC COMBAT PASS',
    JSON.stringify({
      cameraCases: result.camera.reduce((n, v) => n + v.captures.length, 0),
      encounters: result.encounters,
      bomb: result.bomb,
      craterEscape: result.craterEscape,
      pool: result.pool,
      stationaryBoss: result.stationaryBoss,
      visualWidths: result.visual.map((v) => v.width),
    }),
  );
} finally {
  await fs.writeFile(
    'test-results/classic-combat.json',
    JSON.stringify({ ...result, errors }, null, 2),
  );
  await browser.close();
}
