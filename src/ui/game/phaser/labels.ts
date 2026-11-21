import type Phaser from 'phaser';
import { layoutLabels, type LabelObstacle } from './labels-layout';
import './labels.css';

interface Label {
  id: string;
  order: number;
  name: string;
  x: number;
  y: number;
  special: boolean;
}

/** Browser text stays at CSS size/DPR; the single existing Phaser camera owns position. */
export function createMapLabels(
  surface: HTMLElement,
  select: (id: string) => void,
) {
  const layer = document.createElement('div');
  layer.className = 'phaser-map-labels';
  layer.setAttribute('aria-label', '지도 도시 이름');
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.setAttribute('aria-hidden', 'true');
  layer.append(lines);
  surface.append(layer);
  const directory = document.createElement('nav');
  directory.className = 'phaser-map-label-directory';
  directory.setAttribute('aria-label', '도시 이름 · 선택하면 지도 위치 표시');
  directory.hidden = true;
  surface.after(directory);
  const focused = document.createElement('span');
  focused.className = 'phaser-map-label phaser-map-label-focused';
  focused.setAttribute('aria-hidden', 'true');
  focused.hidden = true;
  layer.append(focused);
  const entries = new Map<
    string,
    {
      data: Label;
      button: HTMLButtonElement;
      line: SVGLineElement;
    }
  >();
  let signature = '';
  let dead = false;
  let activeId = '';
  const invalidate = () => {
    signature = '';
  };
  // Direct renderer clients also load the same local Galmuri face. DOM text
  // repaints automatically when it arrives; no stale fallback canvas texture.
  void document.fonts
    .load('14px "PM Galmuri"')
    .then(() => {
      if (!dead) invalidate();
    })
    .catch(() => {});
  return {
    focus(id: string) {
      activeId = id;
      invalidate();
    },
    set(data: Label) {
      if (!activeId && data.order === 0) activeId = data.id;
      const existing = entries.get(data.id);
      if (existing) {
        existing.data = data;
        existing.button.textContent = data.name;
        existing.button.dataset.special = String(data.special);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'phaser-map-label';
        button.dataset.tileId = data.id;
        button.dataset.special = String(data.special);
        button.textContent = data.name;
        button.onclick = () => select(data.id);
        button.onfocus = () => {
          activeId = data.id;
          invalidate();
        };
        button.onblur = invalidate;
        const line = document.createElementNS(
          lines.namespaceURI,
          'line',
        ) as SVGLineElement;
        lines.append(line);
        layer.append(button);
        entries.set(data.id, { data, button, line });
      }
      invalidate();
    },
    remove(id: string) {
      const entry = entries.get(id);
      entry?.button.remove();
      entry?.line.remove();
      entries.delete(id);
      invalidate();
    },
    sync(scene: Phaser.Scene, canvas: HTMLCanvasElement, locked: boolean) {
      if (dead || !layer.isConnected) return;
      const camera = scene.cameras.main;
      const bounds = canvas.getBoundingClientRect();
      const parent = surface.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Protect visible model and pawn silhouettes, including moving sprites.
      // Bounds remain world coordinates until projected by the existing camera.
      const obstacles: LabelObstacle[] = [];
      for (const child of scene.children.list) {
        const image = child as Phaser.GameObjects.Image;
        if (
          !image.visible ||
          !image.texture ||
          !(image.texture.key.startsWith('model:') || child.type === 'Sprite')
        )
          continue;
        const b = image.getBounds();
        const a = camera.matrixCombined.transformPoint(b.left, b.top);
        const z = camera.matrixCombined.transformPoint(b.right, b.bottom);
        obstacles.push({
          left:
            (a.x * bounds.width) / scene.scale.width +
            bounds.left -
            parent.left -
            2,
          top:
            (a.y * bounds.height) / scene.scale.height +
            bounds.top -
            parent.top -
            2,
          width: ((z.x - a.x) * bounds.width) / scene.scale.width + 4,
          height: ((z.y - a.y) * bounds.height) / scene.scale.height + 4,
        });
      }
      const next = [
        camera.scrollX,
        camera.scrollY,
        camera.zoom,
        ...camera.matrixCombined.matrix,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        dpr,
        locked,
        ...obstacles.flatMap((b) => [b.left, b.top, b.width, b.height]),
        document.activeElement?.getAttribute('data-tile-id'),
      ].join(':');
      if (next === signature || bounds.width <= 0 || bounds.height <= 0) return;
      signature = next;
      const sx = bounds.width / scene.scale.width;
      const sy = bounds.height / scene.scale.height;
      const compact = parent.width < 560;
      directory.hidden = !compact;
      focused.hidden = true;
      const home = compact ? directory : layer;
      const ordered = [...entries.values()].sort(
        (a, b) => a.data.order - b.data.order,
      );
      let nextButton: HTMLButtonElement | null = null;
      for (const { button } of [...ordered].reverse()) {
        if (
          button.parentElement !== home ||
          button.nextElementSibling !== nextButton
        )
          home.insertBefore(button, nextButton);
        nextButton = button;
      }
      const ox = bounds.left - parent.left;
      const oy = bounds.top - parent.top;
      const visible = [];
      for (const { data, button, line } of ordered) {
        const p = camera.matrixCombined.transformPoint(data.x, data.y);
        const x = p.x * sx + ox,
          y = p.y * sy + oy;
        const hidden = x < 0 || x > parent.width || y < 0 || y > parent.height;
        button.hidden = !compact && hidden;
        button.dataset.active = String(data.id === activeId);
        line.style.display = hidden || data.id !== activeId ? 'none' : '';
        button.setAttribute('aria-disabled', String(locked));
        if (compact && data.id === activeId && !hidden) {
          focused.hidden = false;
          focused.textContent = data.name;
          focused.dataset.special = String(data.special);
        }
        const target = compact ? focused : button;
        if (!hidden && (!compact || data.id === activeId))
          visible.push({
            id: data.id,
            x,
            y,
            width: target.offsetWidth,
            height: target.offsetHeight,
            // The ring's upper two sides sit above models; lower sides sit
            // below. Prefer the outside edge rather than the board interior.
            preferredX:
              x + (data.order < 16 ? -1 : 1) * (target.offsetWidth / 2 + 8),
            preferredY:
              y +
              (data.order >= 8 && data.order < 24 ? -80 * sy * camera.zoom : 4),
          });
      }
      // Reserve the selected name first. All labels retain browser-sized text.
      visible.sort(
        (a, b) => Number(b.id === activeId) - Number(a.id === activeId),
      );
      for (const box of layoutLabels(
        visible,
        parent.width,
        parent.height,
        obstacles,
      )) {
        const entry = entries.get(box.id)!;
        const button = compact ? focused : entry.button;
        const line = entry.line;
        const left = Math.round(box.left * dpr) / dpr;
        const top = Math.round(box.top * dpr) / dpr;
        button.style.left = `${left}px`;
        button.style.top = `${top}px`;
        line.setAttribute('x1', String(box.x));
        line.setAttribute('y1', String(box.y));
        line.setAttribute('x2', String(left + box.width / 2));
        line.setAttribute('y2', String(top + box.height / 2));
      }
    },
    destroy() {
      dead = true;
      entries.clear();
      layer.remove();
      directory.remove();
    },
  };
}
