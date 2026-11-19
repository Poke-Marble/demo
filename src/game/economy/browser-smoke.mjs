import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import assert from 'node:assert/strict';

// Uses an isolated headless browser profile; never attaches to a user's browser.
const browser = process.argv[2];
assert.ok(browser, 'Pass a Chrome/Edge executable path.');
const directory = mkdtempSync(join(tmpdir(), 'poke-economy-smoke-'));
try {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../../../', import.meta.url)),
      contents: `
        import { kantoJohtoMap } from './src/data/maps/kanto-johto.ts';
        import { createGame } from './src/game/core/index.ts';
        import { createEconomyContext, initializeEconomy, dispatchEconomy, getLegalActions, verifyCommittedReceipt } from './src/game/economy/index.ts';
        try {
          const context = createEconomyContext(kantoJohtoMap);
          const roster = [0,1,2,3].map(i => ({ id:'player:'+i, name:'P'+i, pokemonId:'pokemon:000'+(i+1) }));
          const original = initializeEconomy(createGame(context.map,roster,{seed:1,legendary:{}}),context,'browser-smoke');
          const command = { sessionId:'browser-smoke', commandId:'browser-roll', expectedRevision:0, playerId:original.activePlayerId, intent:{type:'roll-dice',playerId:original.activePlayerId} };
          const rolled = dispatchEconomy(original,context,command);
          if (!rolled.ok || !verifyCommittedReceipt(rolled.state,context,rolled.receipt)) throw Error('roll/receipt');
          const legal = getLegalActions(rolled.state,context,rolled.state.activePlayerId);
          const choice = legal.actions.find(a => a.intent.type === 'construct-property' && a.intent.targetStage === 1);
          if (!choice) throw Error('legal construction');
          const built = dispatchEconomy(rolled.state,context,{...command,commandId:'browser-buy',expectedRevision:rolled.state.economy.revision,intent:choice.intent});
          if (!built.ok || built.state.holdings[0]?.facilityLevel !== 1) throw Error('construction');
          const replay = dispatchEconomy(built.state,context,command);
          if (!replay.ok || !replay.replayed || replay.events.length) throw Error('duplicate roll');
          document.body.textContent = 'PASS economy browser smoke: roll, quote, purchase, receipt, replay';
        } catch (error) { document.body.textContent = 'FAIL '+error.message; }
      `,
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    write: false,
  });
  const html = join(directory, 'smoke.html');
  writeFileSync(
    html,
    `<html><body>WAIT<script>${bundle.outputFiles[0].text}</script></body></html>`,
  );
  const result = spawnSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(directory, 'profile')}`,
      '--dump-dom',
      pathToFileURL(html).href,
    ],
    { encoding: 'utf8', timeout: 20000, windowsHide: true },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<body>PASS economy browser smoke:/);
  process.stdout.write(
    'PASS headless browser: roll, quote, purchase, receipt, replay\n',
  );
} finally {
  // Verify the exact temporary target before recursive cleanup on Windows.
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('poke-economy-smoke-'));
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
