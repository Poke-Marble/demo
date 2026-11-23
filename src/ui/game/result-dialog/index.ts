import type { GameView } from '../adapter';
import { createPortrait } from '../portraits/portrait';
import { resultRows, victoryLabels } from './model';
import './style.css';

export function mountResultDialog(root: HTMLElement, restart: () => void) {
  let dialog: HTMLDialogElement | undefined;
  let portraits: ReturnType<typeof createPortrait>[] = [];
  let frame = 0;
  let disposed = false;
  let restarting = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    dialog?.querySelector('canvas')?.remove();
  };
  const visibility = () => {
    if (document.hidden) stop();
  };
  motion.addEventListener('change', stop);
  document.addEventListener('visibilitychange', visibility);
  function reset() {
    stop();
    portraits.forEach((portrait) => portrait.destroy());
    portraits = [];
    dialog?.close();
    dialog?.remove();
    dialog = undefined;
    restarting = false;
  }
  return {
    show(view: GameView, busy: boolean) {
      if (disposed) return;
      if (dialog) {
        if (!busy) restarting = false;
        dialog.querySelector('button')!.disabled = busy || restarting;
        return;
      }
      dialog = document.createElement('dialog');
      dialog.className = 'pm-dialog pm-ranking-dialog';
      const title = document.createElement('h2');
      title.id = `pm-result-${crypto.randomUUID()}`;
      title.textContent = 'Poké Marble · 여행 완료!';
      dialog.setAttribute('aria-labelledby', title.id);
      const reason = document.createElement('p');
      reason.className = 'pm-ranking-reason';
      reason.id = `${title.id}-reason`;
      const winner = view.state.players.find(
        (p) => p.id === view.state.victory?.winnerId,
      );
      reason.textContent = `${winner?.name ?? '트레이너'} 승리 · ${view.state.victory ? victoryLabels[view.state.victory.reason] : '결과 확인'}`;
      dialog.setAttribute('aria-describedby', reason.id);
      const table = document.createElement('table');
      table.className = 'pm-ranking-table';
      const caption = table.createCaption();
      caption.textContent = '최종 결과';
      const head = table.createTHead().insertRow();
      for (const text of ['순위', '플레이어', '최종 자산']) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = text;
        head.append(cell);
      }
      const body = table.createTBody();
      resultRows(view).forEach(({ player, total, bankrupt }, index) => {
        const row = body.insertRow();
        row.dataset.playerId = player.id;
        if (index === 0) row.className = 'pm-ranking-winner';
        row.insertCell().textContent = `${index + 1}위`;
        const identity = document.createElement('div');
        identity.className = 'pm-ranking-player';
        const portrait = createPortrait({
          pokemonId: player.pokemonId,
          name: player.name,
        });
        portrait.setReaction(
          index === 0 ? 'victory' : bankrupt ? 'bankrupt' : 'normal',
        );
        portraits.push(portrait);
        const name = document.createElement('span');
        name.textContent = player.name;
        identity.append(portrait.element, name);
        row.insertCell().append(identity);
        const asset = row.insertCell();
        asset.textContent =
          total === null ? '확인 불가' : `${total.toLocaleString('ko-KR')} ₽`;
        if (bankrupt) {
          const status = document.createElement('small');
          status.textContent = '파산';
          asset.append(status);
        }
      });
      const note = document.createElement('p');
      note.className = 'pm-ranking-note';
      note.textContent = '승자 우선 · 나머지 자산순 (동점: 현금 → 원래 seat)';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pm-primary';
      button.textContent = '새 여행 시작';
      button.disabled = busy;
      button.autofocus = true;
      button.onclick = () => {
        if (restarting) return;
        restarting = true;
        button.disabled = true;
        restart();
      };
      dialog.addEventListener('cancel', (event) => event.preventDefault());
      dialog.append(title, reason, table, note, button);
      root.append(dialog);
      dialog.showModal();
      button.focus();
      if (!motion.matches && !document.hidden) {
        const canvas = document.createElement('canvas');
        canvas.className = 'pm-ranking-fireworks';
        canvas.setAttribute('aria-hidden', 'true');
        dialog.append(canvas);
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const started = performance.now();
        const draw = (now: number) => {
          const t = (now - started) / 1000;
          if (!ctx || t > 1.4) {
            stop();
            return;
          }
          ctx.clearRect(0, 0, 600, 400);
          for (let burst = 0; burst < 4; burst++) {
            const age = t - burst * 0.12;
            if (age < 0) continue;
            ctx.globalAlpha = Math.max(0, 1 - age / 1.1);
            ctx.fillStyle = ['#f7d66c', '#72b9e8', '#e891a6', '#8dc98a'][
              burst
            ]!;
            for (let i = 0; i < 16; i++) {
              const angle = (i * Math.PI) / 8;
              const x = (burst % 2 ? 550 : 50) + Math.cos(angle) * age * 65;
              const y =
                (burst < 2 ? 80 : 260) +
                Math.sin(angle) * age * 65 +
                age * age * 30;
              ctx.fillRect(x, y, 3, 3);
            }
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      }
    },
    reset,
    destroy() {
      disposed = true;
      reset();
      motion.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
