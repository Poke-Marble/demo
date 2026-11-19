import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';

const root = new URL('./', import.meta.url);
const config = JSON.parse(
  await readFile(
    new URL('../../../../scripts/samples.json', import.meta.url),
    'utf8',
  ),
);
const revision = config.spriteRevision;
const base = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${revision}`;
const desired = [
  'Normal',
  'Happy',
  'Joyous',
  'Worried',
  'Pain',
  'Sad',
  'Determined',
  'Angry',
  'Surprised',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const local = (path) => new URL(path, root);
async function get(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
function size(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('Expected PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(local('manifest.json'), 'utf8'));
  if (manifest.revision !== revision) throw new Error('Revision mismatch');
  for (const entry of manifest.files) {
    const bytes = await readFile(local(entry.path));
    if (hash(bytes) !== entry.sha256)
      throw new Error(`Hash mismatch: ${entry.path}`);
  }
  for (const portrait of manifest.portraits) {
    const dex = portrait.pokemonId.slice('pokemon:'.length);
    const tracker = JSON.parse(
      await readFile(local(`evidence/${dex}/tracker.json`), 'utf8'),
    );
    const listing = JSON.parse(
      await readFile(local(`evidence/${dex}/directory.json`), 'utf8'),
    );
    if (
      !listing.some(
        (entry) =>
          entry.name === `${portrait.emotion}.png` && entry.type === 'file',
      ) ||
      tracker.portrait_files[portrait.emotion] !== true
    )
      throw new Error(`Unconfirmed emotion: ${portrait.path}`);
    if (hash(await readFile(local(portrait.path))) !== portrait.sha256)
      throw new Error(`Portrait hash mismatch: ${portrait.path}`);
    const dimensions = size(await readFile(local(portrait.path)));
    if (
      dimensions.width !== 40 ||
      dimensions.height !== 40 ||
      !portrait.credits.length
    )
      throw new Error(`Invalid portrait: ${portrait.path}`);
  }
  for (const speciesId of config.speciesIds) {
    if (
      !manifest.portraits.some(
        (entry) =>
          entry.pokemonId === `pokemon:${String(speciesId).padStart(4, '0')}` &&
          entry.emotion === 'Normal',
      )
    )
      throw new Error(`Normal missing: ${speciesId}`);
  }
  console.log(
    `Verified ${manifest.portraits.length} portraits and ${manifest.files.length} asset/evidence hashes`,
  );
} else {
  const files = [];
  async function save(path, bytes, url) {
    await mkdir(new URL('./', local(path)), { recursive: true });
    await writeFile(local(path), bytes);
    files.push({ path, url, sha256: hash(bytes) });
  }
  const trackerBytes = await get(`${base}/tracker.json`);
  const tracker = JSON.parse(trackerBytes);
  const namesBytes = await get(`${base}/credit_names.txt`);
  const names = namesBytes
    .toString('utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [name, id, contact] = line.split('\t');
      return { name, id, contact };
    });
  await save(
    'evidence/credit_names.txt',
    namesBytes,
    `${base}/credit_names.txt`,
  );
  for (const path of [
    'README.md',
    'LICENSE.md',
    'license_history/LICENSE.CC_BY-NC_4.md',
    'license_history/LICENSE.PMDCollab_1.md',
  ]) {
    await save(
      `evidence/${path}`,
      await get(`${base}/${path}`),
      `${base}/${path}`,
    );
  }
  const portraits = [];
  const species = [];
  for (const speciesId of config.speciesIds) {
    const dex = String(speciesId).padStart(4, '0');
    // A per-directory API listing avoids GitHub's truncated recursive tree.
    const listingURL = `https://api.github.com/repos/PMDCollab/SpriteCollab/contents/portrait/${dex}?ref=${revision}`;
    const listingBytes = await get(listingURL);
    const listing = JSON.parse(listingBytes);
    await save(`evidence/${dex}/directory.json`, listingBytes, listingURL);
    const creditBytes = await get(`${base}/portrait/${dex}/credits.txt`);
    await save(
      `evidence/${dex}/credits.txt`,
      creditBytes,
      `${base}/portrait/${dex}/credits.txt`,
    );
    const rows = creditBytes
      .toString('utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [date, id, status, license, emotions] = line.split('\t');
        const creator = names.find((entry) => entry.id === id);
        if (!creator) throw new Error(`Unknown creator ${id}`);
        return {
          date,
          creator,
          status,
          license,
          emotions: emotions.split(','),
        };
      });
    const node = tracker[dex];
    const excerpt = {
      sourceUrl: `${base}/tracker.json`,
      sourceSha256: hash(trackerBytes),
      name: node.name,
      portrait_credit: node.portrait_credit,
      portrait_files: node.portrait_files,
    };
    await save(
      `evidence/${dex}/tracker.json`,
      Buffer.from(JSON.stringify(excerpt, null, 2) + '\n'),
      `${base}/tracker.json`,
    );
    const missing = [];
    for (const emotion of desired) {
      const filename = `${emotion}.png`;
      if (
        !listing.some(
          (entry) => entry.type === 'file' && entry.name === filename,
        ) ||
        node.portrait_files[emotion] !== true
      ) {
        missing.push(emotion);
        continue;
      }
      const credits = rows.filter(
        (entry) => entry.status === 'CUR' && entry.emotions.includes(emotion),
      );
      if (!credits.length)
        throw new Error(`No current credit for ${dex}/${emotion}`);
      const url = `${base}/portrait/${dex}/${filename}`;
      const bytes = await get(url);
      const dimensions = size(bytes);
      if (dimensions.width !== 40 || dimensions.height !== 40)
        throw new Error(`Unexpected format ${url}`);
      const path = `assets/${dex}/${filename}`;
      await save(path, bytes, url);
      portraits.push({
        pokemonId: `pokemon:${dex}`,
        emotion,
        path,
        url,
        sha256: hash(bytes),
        ...dimensions,
        credits,
        provenance: credits.every((credit) => credit.creator.id === 'CHUNSOFT')
          ? 'original-game-extraction'
          : 'fan-contribution-or-mixed',
        licenseStatus: credits.some(
          (credit) => credit.license === 'Unspecified',
        )
          ? 'Unspecified · 원작 이미지 개별 이용 허락 미확인. CC 일괄 적용 금지.'
          : '각 credits.txt와 정책 원문 참조',
        modifications: '원본 PNG 무변경; 브라우저에서 정수 배율 표시.',
      });
    }
    if (
      !portraits.some(
        (portrait) =>
          portrait.pokemonId === `pokemon:${dex}` &&
          portrait.emotion === 'Normal',
      )
    )
      throw new Error(`Normal missing: ${dex}`);
    species.push({
      pokemonId: `pokemon:${dex}`,
      name: node.name,
      trackerCredit: node.portrait_credit,
      missing,
    });
  }
  await writeFile(
    local('manifest.json'),
    JSON.stringify(
      {
        revision,
        source: 'https://sprites.pmdcollab.org/',
        species,
        portraits,
        files,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Collected ${portraits.length} portraits at ${revision} into ${fileURLToPath(root)}`,
  );
}
