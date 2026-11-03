import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Stored ZIP entries avoid shell-specific archive tools and dependency installs.
export async function packageApp(capsule, state, source = path.join(capsule, 'src')) {
  const entries = [];
  for (const name of ['index.php', 'timing.php', 'telemetry.php']) {
    const file = name === 'timing.php' && ['healthy', 'faulty'].includes(state)
      ? path.join(capsule, `tests/fixtures/timing-${state}.php`) : path.join(source, name);
    if (!(await lstat(file)).isFile()) throw new Error(`Not a regular deployment file: ${file}`);
    entries.push([name, await readFile(file)]);
  }
  entries.push(['nginx.conf', await readFile(path.join(capsule, 'infra/nginx.conf'))]);
  entries.push(['deployment.json', Buffer.from(JSON.stringify({
    revision: state === 'faulty' ? 'candidate-v2' : state === 'reviewed' ? 'reviewed-source' : 'baseline-v1',
    prepared_at: new Date().toISOString(),
  }))]);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [filename, body] of entries) {
    const name = Buffer.from(filename);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(body), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    header.copy(record, 6, 4, 30);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    chunks.push(header, name, body);
    offset += header.length + name.length + body.length;
  }
  const index = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, index, end]);
}
