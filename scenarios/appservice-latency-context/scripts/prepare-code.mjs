import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const capsule = fileURLToPath(new URL('../', import.meta.url));
try {
  if (process.argv.slice(2).join(' ') !== '--confirm faulty') {
    throw new Error('Usage: prepare-code --confirm faulty (on a dedicated learner branch)');
  }
  const git = (...args) => execFileSync('git', args, { cwd: capsule, encoding: 'utf8' }).trim();
  const branch = git('branch', '--show-current');
  if (!branch || ['main', 'master'].includes(branch)) {
    throw new Error('Create a dedicated incident branch first; main/master and detached HEAD are protected');
  }
  const file = path.join(capsule, 'src/timing.php');
  const root = git('rev-parse', '--show-toplevel');
  const relative = path.relative(root, file).split(path.sep).join('/');
  git('ls-files', '--error-unmatch', '--', 'src/timing.php');
  const current = await readFile(file, 'utf8');
  const faulty = await readFile(path.join(capsule, 'tests/fixtures/timing-faulty.php'), 'utf8');
  if (current === faulty) {
    console.log('Faulty tracked source already prepared; no files changed.');
  } else {
    const healthy = await readFile(path.join(capsule, 'tests/fixtures/timing-healthy.php'), 'utf8');
    if (current !== healthy || git('status', '--porcelain', '--', 'src/timing.php')) {
      throw new Error('Refusing to overwrite learner changes in tracked timing source');
    }
    await writeFile(file, faulty);
    console.log(`Prepared tracked faulty source on ${branch}: ${relative}`);
  }
  console.log('Review the diff, commit and push this dedicated branch; select it as the coding task base. No commit, push or runtime deployment was performed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
