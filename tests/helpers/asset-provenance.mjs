import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

/** Attach exact source hashes to visual evidence and reject mid-capture hot reloads. */
export async function assetProvenance() {
  const files = (await fs.readdir('src', { recursive: true }))
    .filter((path) => /\.(ts|tsx|css|json)$/.test(path))
    .map((path) => 'src/' + path)
    .concat(['scripts/build-rover.py', 'scripts/build-enemies.py', 'scripts/build-environment.py'])
    .sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (path) => [
        path,
        createHash('sha256')
          .update(await fs.readFile(path))
          .digest('hex'),
      ]),
    ),
  );
}
