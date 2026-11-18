import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  download,
  readJson,
  sha256,
  writeAtomic,
  writeJson,
} from './lib/io.mjs';

const root = new URL('../', import.meta.url);
const file = (path) => fileURLToPath(new URL(path, root));
const config = await readJson(file('scripts/samples.json'));
const base = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${config.spriteRevision}`;
const manifestPath = file('src/assets/generated/sprites.json');
const verify = process.argv[2] === '--verify';
if (process.argv.length > (verify ? 3 : 2)) throw new Error('알 수 없는 옵션');

if (verify) {
  const manifest = await readJson(manifestPath);
  if (
    manifest.revision !== config.spriteRevision ||
    JSON.stringify(manifest.speciesIds) !== JSON.stringify(config.speciesIds)
  ) {
    throw new Error('샘플 설정과 에셋 manifest 불일치');
  }
  for (const entry of manifest.files) {
    if (sha256(await readFile(file(entry.path))) !== entry.sha256)
      throw new Error(`에셋 해시 불일치: ${entry.path}`);
  }
  console.log(`${manifest.files.length}개 에셋/출처 파일 SHA-256 검증 완료`);
} else {
  const files = [];
  const pending = [];
  const assets = [];
  async function collect(relative, local) {
    const url = `${base}/${relative}`;
    const bytes = await download(url);
    const path = `src/assets/vendor/${local ?? relative}`;
    files.push({ path, url, sha256: sha256(bytes) });
    pending.push({ path, bytes });
    return bytes;
  }
  const tracker = JSON.parse(
    (await download(`${base}/tracker.json`)).toString('utf8'),
  );
  const names = (await download(`${base}/credit_names.txt`))
    .toString('utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [name, id, contact] = line.split('\t');
      return { name, id, contact };
    });
  for (const doc of [
    'README.md',
    'LICENSE.md',
    'license_history/LICENSE.PMDCollab_1.md',
    'license_history/LICENSE.CC_BY-NC_4.md',
  ]) {
    await collect(doc, `policy/${doc}`);
  }
  for (const speciesId of config.speciesIds) {
    const dex = String(speciesId).padStart(4, '0');
    const xml = (await collect(`sprite/${dex}/AnimData.xml`)).toString('utf8');
    const credits = (await collect(`sprite/${dex}/credits.txt`))
      .toString('utf8')
      .trim();
    const creditRows = credits.split(/\r?\n/).map((line) => {
      const [date, creatorId, status, license, animations] = line.split('\t');
      const creator = names.find((entry) => entry.id === creatorId);
      if (!creator) throw new Error(`제작자 미확인: ${creatorId}`);
      return {
        date,
        creator,
        status,
        license,
        animations: animations.split(','),
      };
    });
    const credit = tracker[dex]?.sprite_credit;
    if (!credit?.primary) throw new Error(`tracker 크레딧 없음: ${dex}`);
    const animations = [];
    for (const name of config.animations) {
      const block = [...xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)]
        .map((match) => match[1])
        .find((part) => part.includes(`<Name>${name}</Name>`));
      if (!block || block.includes('<CopyOf>'))
        throw new Error(`직접 프레임 애니메이션만 지원: ${dex}/${name}`);
      const frameWidth = Number(
        block.match(/<FrameWidth>(\d+)<\/FrameWidth>/)?.[1],
      );
      const frameHeight = Number(
        block.match(/<FrameHeight>(\d+)<\/FrameHeight>/)?.[1],
      );
      const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map(
        (match) => Number(match[1]),
      );
      const png = await collect(`sprite/${dex}/${name}-Anim.png`);
      if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw new Error('PNG 형식 오류');
      const sheetWidth = png.readUInt32BE(16);
      const sheetHeight = png.readUInt32BE(20);
      if (
        !frameWidth ||
        !frameHeight ||
        durations.some((duration) => duration <= 0) ||
        sheetWidth !== frameWidth * durations.length ||
        sheetHeight !== frameHeight * 8
      ) {
        throw new Error(`지원하지 않는 시트 배치: ${dex}/${name}`);
      }
      animations.push({
        id: `pmd:${dex}:base:${name.toLowerCase()}`,
        name,
        path: `./vendor/sprite/${dex}/${name}-Anim.png`,
        frameWidth,
        frameHeight,
        sheetWidth,
        sheetHeight,
        durationsMs: durations.map((duration) => (duration * 1000) / 60),
        directionRows: ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'],
      });
    }
    assets.push({
      pokemonId: `pokemon:${dex}`,
      source: 'https://sprites.pmdcollab.org/',
      repository: `https://github.com/PMDCollab/SpriteCollab/tree/${config.spriteRevision}/sprite/${dex}`,
      trackerCredit: credit,
      credits: creditRows,
      licenseStatus: creditRows.some((entry) => entry.license === 'Unspecified')
        ? 'Unspecified — 개별 이용 허락 확인 필요; CC BY-NC 적용 단정 금지'
        : '개별 credits.txt 및 정책 원문 참조',
      modifications:
        '원본 PNG/XML 변경 없음. 브라우저에서 프레임 자르기·확대·재생만 수행.',
      animations,
    });
  }
  for (const { path, bytes } of pending) await writeAtomic(file(path), bytes);
  await writeJson(manifestPath, {
    schemaVersion: 1,
    revision: config.spriteRevision,
    speciesIds: config.speciesIds,
    reviewedAt: '2026-11-18',
    policy: `${base}/README.md`,
    notice:
      '일반 제출물 정책과 공식 Chunsoft 스프라이트 권리는 구분된다. 이 샘플 4종은 CHUNSOFT / Unspecified로 기록되어 있으며 CC 라이선스 허락을 보장하지 않는다.',
    files,
    assets,
  });
  console.log(
    `${assets.length}종 / ${files.length}개 파일 동기화 완료 (${config.spriteRevision})`,
  );
}
