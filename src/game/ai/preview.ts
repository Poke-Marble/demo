import { runSimulation } from './harness.ts';

const form = document.querySelector<HTMLFormElement>('#controls')!;
const seedInput = document.querySelector<HTMLInputElement>('#seed')!;
const result = document.querySelector<HTMLParagraphElement>('#result')!;
const trace = document.querySelector<HTMLTableSectionElement>('#trace')!;
const button = form.querySelector('button')!;

async function render() {
  button.disabled = true;
  result.textContent = '실행 중';
  try {
    const simulation = await runSimulation(Number(seedInput.value));
    trace.replaceChildren(
      ...simulation.trace.map((entry, i) => {
        const row = document.createElement('tr');
        for (const value of [i + 1, entry.playerId, entry.kind, entry.cash]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.append(cell);
        }
        return row;
      }),
    );
    result.textContent = `Seed ${simulation.seed} · ${simulation.trace.length}개 확정 행동 · ${simulation.stops.join(' / ')}`;
  } catch (error) {
    trace.replaceChildren();
    result.textContent = `실패: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void render();
});
void render();
