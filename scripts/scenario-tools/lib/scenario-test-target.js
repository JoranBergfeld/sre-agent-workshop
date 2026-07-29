import { isAbsolute, relative, resolve } from 'node:path';

function pathError() {
  return 'tests must stay inside the scenario directory';
}

export function resolveDeclaredTestTarget(
  { dir, manifest },
  { fileExists, realpath = (path) => path }
) {
  const rawPath = manifest.tests;
  if (!rawPath) return null;

  if (isAbsolute(rawPath)) {
    throw new Error(pathError());
  }

  const resolved = resolve(dir, rawPath);
  if (!fileExists(resolved)) {
    throw new Error(`tests references missing file ${rawPath}`);
  }

  let canonicalDir;
  let canonicalTarget;
  try {
    canonicalDir = realpath(dir);
    canonicalTarget = realpath(resolved);
  } catch {
    throw new Error(`tests references missing file ${rawPath}`);
  }

  const rel = relative(canonicalDir, canonicalTarget);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(pathError());
  }

  return canonicalTarget;
}
