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
const mode = process.argv[2];
if (!['--offline', '--refresh'].includes(mode) || process.argv.length !== 3) {
  throw new Error(
    '사용법: node scripts/collect-pokemon.mjs --offline | --refresh',
  );
}
const refresh = mode === '--refresh';
const records = [];
const pending = [];

// 명시된 소량 ID만 순차 수집한다. 기본 실행/빌드는 API를 호출하지 않는다.
for (const id of config.speciesIds) {
  const sources = {};
  const payloads = {};
  for (const endpoint of ['pokemon', 'pokemon-species']) {
    const url = `https://pokeapi.co/api/v2/${endpoint}/${id}/`;
    const path = file(`src/data/sources/pokeapi/${endpoint}-${id}.json`);
    const bytes = refresh ? await download(url) : await readFile(path);
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload.id !== id || typeof payload.name !== 'string') {
      throw new Error(`잘못된 PokeAPI 응답: ${url}`);
    }
    const digest = sha256(bytes);
    const metadata = refresh
      ? { url, retrievedAt: new Date().toISOString(), sha256: digest }
      : await readJson(`${path}.source.json`);
    if (metadata.url !== url || metadata.sha256 !== digest) {
      throw new Error(`로컬 스냅샷 출처/해시 불일치: ${path}`);
    }
    if (refresh) pending.push({ path, bytes, metadata });
    payloads[endpoint] = payload;
    sources[endpoint] = metadata;
  }
  const pokemon = payloads.pokemon;
  const species = payloads['pokemon-species'];
  const nameKo = species.names?.find(
    (name) => name.language.name === 'ko',
  )?.name;
  const genusKo = species.genera?.find(
    (genus) => genus.language.name === 'ko',
  )?.genus;
  if (
    !nameKo ||
    !genusKo ||
    !Array.isArray(pokemon.types) ||
    !pokemon.types.length
  ) {
    throw new Error(`필수 한국어/타입 데이터 누락: ${id}`);
  }
  if (Number(pokemon.species?.url?.match(/\/(\d+)\/$/)?.[1]) !== id) {
    throw new Error(`종/포켓몬 ID 불일치: ${id}`);
  }
  records.push({
    id: `pokemon:${String(id).padStart(4, '0')}`,
    speciesId: id,
    slug: pokemon.name,
    nameKo,
    genusKo,
    types: [...pokemon.types]
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name),
    sources,
  });
}
// 모든 응답을 검증한 뒤 저장하므로 네트워크 오류로 생성 JSON을 덮어쓰지 않는다.
for (const { path, bytes, metadata } of pending) {
  await writeAtomic(path, bytes);
  await writeJson(`${path}.source.json`, metadata);
}
await writeJson(file('src/data/generated/pokemon.ko.json'), {
  schemaVersion: 1,
  source: 'https://pokeapi.co/docs/v2/',
  processing:
    'pokemon + pokemon-species; names/genera language=ko; types in slot order',
  pokemon: records,
});
console.log(
  `${records.length}종 한국어 데이터 생성 완료 (${refresh ? 'API 갱신' : '오프라인 스냅샷'})`,
);
