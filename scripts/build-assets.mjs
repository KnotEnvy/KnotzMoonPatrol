import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windowsBlender = '/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const executable =
  process.env.BLENDER_PATH || (existsSync(windowsBlender) ? windowsBlender : 'blender');
for (const [script, marker] of [
  ['build-rover.py', 'ROVER_EXPORT'],
  ['build-enemies.py', 'ENEMY_EXPORT'],
  ['build-environment.py', 'ENVIRONMENT_EXPORT'],
]) {
  let path = resolve(root, 'scripts', script);
  if (process.platform === 'linux' && executable.endsWith('.exe'))
    path = execFileSync('wslpath', ['-w', path], { encoding: 'utf8' }).trim();
  const result = spawnSync(executable, ['--background', '--factory-startup', '--python', path], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = result.stdout || '';
  if (result.error || result.status !== 0 || !output.includes(marker)) {
    process.stderr.write(result.stderr || '');
    process.stderr.write(output);
    throw new Error(
      `Asset generation failed for ${script}: ${result.error?.message ?? result.status}`,
    );
  }
  process.stdout.write(
    output
      .split(/\r?\n/)
      .filter((line) => line.includes(marker))
      .join('\n') + '\n',
  );
}
