import { describe, expect, it } from 'vitest';
import { PatrolJump } from '../src/game/patrol';

describe('patrol clearance scoring', () => {
  it('banks each surviving obstacle once, only after landing', () => {
    const jump = new PatrolJump(),
      rock = {};
    jump.launch(55);
    jump.cross(rock, 'rock', 75, 1, 79, 5);
    jump.cross(rock, 'rock', 75, 1, 80, 5);
    expect(jump.land(86)).toBe(100);
    expect(jump.land(90)).toBe(0);
  });
  it('requires full horizontal and vertical clearance from a deliberate launch', () => {
    const jump = new PatrolJump();
    jump.cross({}, 'rock', 75, 1, 79, 5);
    expect(jump.land(86)).toBe(0);
    jump.launch(55);
    jump.cross({}, 'rock', 75, 1, 77, 5);
    jump.cross({}, 'mine', 75, 1, 79, 2);
    jump.cross({}, 'bomber', 75, 1, 79, 5);
    expect(jump.land(86)).toBe(0);
    jump.launch(75);
    jump.cross({}, 'rock', 75, 1, 79, 5);
    expect(jump.land(86)).toBe(0);
  });
  it('rewards complete chasms and combines them with ground threats', () => {
    const jump = new PatrolJump();
    jump.launch(95);
    jump.cross({}, 'mine', 100, 1, 104, 5);
    jump.cross({}, 'skimmer', 122, 1, 126, 5);
    expect(jump.land(135)).toBe(400);
    jump.launch(110);
    expect(jump.land(125)).toBe(0);
    jump.launch(95);
    expect(jump.land(118)).toBe(0);
  });
  it('discards pending points on damage, recovery, restart, or a new launch', () => {
    const jump = new PatrolJump();
    jump.launch(55);
    jump.cross({}, 'rock', 75, 1, 79, 5);
    jump.reset();
    expect(jump.land(135)).toBe(0);
    jump.launch(55);
    jump.cross({}, 'rock', 75, 1, 79, 5);
    jump.launch(140);
    expect(jump.land(170)).toBe(0);
  });
});
