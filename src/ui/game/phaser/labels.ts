import type Phaser from 'phaser';
import { tileNamePlate } from './labels-layout';
import './labels.css';

interface Label {
  id: string;
  order: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  special: boolean;
}

/** Tile-local nameplates: only the existing camera can move or scale them. */
export function createMapLabels(
  surface: HTMLElement,
  select: (id: string) => void,
) {
  const layer = document.createElement('div');
  layer.className = 'phaser-map-labels';
  layer.setAttribute('aria-label', '지도 도시 이름');
  surface.append(layer);
  const entries = new Map<string, { data: Label; button: HTMLButtonElement }>();
  let signature = '';
  let activeId = '';
  let dead = false;
  const invalidate = () => {
    signature = '';
  };
  void document.fonts.load('14px "PM Galmuri"').catch(() => {});
  return {
    focus(id: string) {
      activeId = id;
      invalidate();
    },
    set(data: Label) {
      let entry = entries.get(data.id);
      if (!entry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'phaser-map-label';
        button.dataset.tileId = data.id;
        button.onclick = () => select(data.id);
        button.onfocus = () => {
          activeId = data.id;
          invalidate();
        };
        layer.append(button);
        entry = { data, button };
        entries.set(data.id, entry);
      }
      entry.data = data;
      entry.button.textContent = data.name;
      entry.button.title = data.name;
      entry.button.style.fontSize = `${Math.min(14, 70 / [...data.name].length)}px`;
      // Keep deterministic keyboard traversal without reparenting on selection.
      for (const item of [...entries.values()].sort(
        (a, b) => a.data.order - b.data.order,
      ))
        layer.append(item.button);
      invalidate();
    },
    remove(id: string) {
      entries.get(id)?.button.remove();
      entries.delete(id);
      invalidate();
    },
    sync(scene: Phaser.Scene, canvas: HTMLCanvasElement, locked: boolean) {
      if (dead || !layer.isConnected) return;
      const camera = scene.cameras.main;
      const bounds = canvas.getBoundingClientRect();
      const parent = surface.getBoundingClientRect();
      const next = [
        ...camera.matrixCombined.matrix,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        parent.x,
        parent.y,
        locked,
        activeId,
      ].join(':');
      if (next === signature || bounds.width <= 0 || bounds.height <= 0) return;
      signature = next;
      const project = (x: number, y: number) => {
        const p = camera.matrixCombined.transformPoint(x, y);
        return {
          x:
            (p.x * bounds.width) / scene.scale.width +
            bounds.left -
            parent.left,
          y:
            (p.y * bounds.height) / scene.scale.height +
            bounds.top -
            parent.top,
        };
      };
      for (const { data, button } of entries.values()) {
        const plate = tileNamePlate(data);
        const p = project(plate.x, plate.y);
        const u = project(plate.x + plate.a, plate.y + plate.b);
        const v = project(plate.x + plate.c, plate.y + plate.d);
        button.style.transform = `matrix(${u.x - p.x},${u.y - p.y},${v.x - p.x},${v.y - p.y},${p.x},${p.y})`;
        button.hidden =
          p.x < -80 ||
          p.x > parent.width + 80 ||
          p.y < -40 ||
          p.y > parent.height + 40;
        button.dataset.active = String(data.id === activeId);
        button.setAttribute('aria-disabled', String(locked));
      }
    },
    destroy() {
      dead = true;
      entries.clear();
      layer.remove();
    },
  };
}
