import Phaser from 'phaser';
import type { GameView, UIUpdate } from '../adapter';
import type { PlayerId, PokemonId, TileId } from '../../../game/contracts';
import type { SpecialEventRequest } from '../events/contracts';
import { findSprite, type AnimationName } from '../../../assets/sprites';
import { boardCells } from '../presentation';
import {
  depthOrder,
  pawnFoot,
  projectWorld,
  tileGeometry,
} from '../projection';
import { createFacility, createTileFaces } from '../isometric';
import { modelPlacement } from '../art/model-geometry';
import { createSceneryArt } from '../art/regional';
import {
  constructionFromHolding,
  type BuildingMetadata,
  type ConstructionVisual,
} from '../art/construction';
import { applyConstructionOwner, ownerFromInput } from '../art/ownership';
import { createArtCredits } from '../art/credits';
import { gameCredits } from '../events/credits';
import { createMapLabels } from './labels';
import { pawnDepth, standingFoot } from './occlusion';
import './style.css';
import { createBoardFlight } from './board-flight';
import skyBackgroundUrl from './background/Sky.1.png';

export interface BoardVisuals {
  construction?: ReadonlyMap<TileId, ConstructionVisual>;
  metadata?: ReadonlyMap<TileId, BuildingMetadata>;
}
export type Completion = { status: 'completed' | 'cancelled' | 'destroyed' };
export interface PhaserBoardOptions extends BoardVisuals {
  view: GameView;
  onSelect(tileId: TileId): void;
  /** Shared external SFX; Phaser never creates an audio bus. */
  onStep?(): void;
  onFlightHover?(): void;
  onFlightSelect?(): void;
  onLockChange?(locked: boolean): void;
  /** Bridge to the existing HTML VS/flight presenter. Must honor AbortSignal. */
  presentEffect?(
    request: SpecialEventRequest,
    signal: AbortSignal,
  ): Promise<void>;
  reducedMotion?: boolean;
  renderer?: 'auto' | 'canvas';
}
type Pawn = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  pokemonId: PokemonId;
  tileId: TileId;
  seat: number;
};
type TileVisual = {
  signature: string;
  images: Phaser.GameObjects.Image[];
  keys: string[];
  button: HTMLButtonElement;
};

/** One Game/Scene/canvas per factory. No rules, dispatch, RNG or audio context. */
export function createPhaserBoard(options: PhaserBoardOptions) {
  const element = document.createElement('section');
  element.className = 'phaser-board';
  element.setAttribute('aria-label', 'Phaser 보드');
  const surface = document.createElement('div');
  surface.className = 'phaser-board-surface';
  surface.style.setProperty('--pm-board-sky', `url("${skyBackgroundUrl}")`);
  const alternatives = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '키보드로 칸 선택 · 32칸 목록';
  const tileList = document.createElement('div');
  tileList.className = 'phaser-board-tiles';
  alternatives.append(summary, tileList);
  const credits = document.createElement('div');
  credits.className = 'phaser-board-credits';
  element.append(surface, alternatives, credits);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let view = options.view;
  let latestView = view;
  let visuals: BoardVisuals = options;
  let destroyed = false;
  let externalLock = false;
  let busy = 0;
  let generation = 0;
  let revision = 0;
  let zoom = 1;
  let mounted = false;
  let readyDone!: () => void;
  const ready = new Promise<void>((resolve) => {
    readyDone = resolve;
  });
  const tiles = new Map<TileId, TileVisual>();
  const pawns = new Map<PlayerId, Pawn>();
  const seen = new Map<string, Promise<Completion>>();
  const effectsSeen = new Set<string>();
  const active = new Set<AbortController>();
  let tail: Promise<unknown> = Promise.resolve();
  const reduced = () => options.reducedMotion ?? media.matches;
  const locked = () => destroyed || externalLock || busy > 0;
  function notifyLock() {
    for (const tile of tiles.values()) {
      tile.button.disabled = externalLock || destroyed;
      tile.button.setAttribute('aria-disabled', String(locked()));
    }
    flight.lock(locked());
    element.dataset.locked = String(locked());
    options.onLockChange?.(locked());
  }
  function select(id: TileId) {
    labels.focus(id);
    if (locked()) return;
    if (flight.selection) {
      if (flight.pick(id)) options.onFlightSelect?.();
    } else options.onSelect(id);
  }
  const labels = createMapLabels(surface, (id) => select(id as TileId));

  let flightGraphics: Phaser.GameObjects.Graphics | undefined;
  const flight = createBoardFlight(element, drawFlight);
  function drawFlight() {
    if (!flightGraphics) return;
    flightGraphics.clear();
    const selection = flight.selection;
    if (!selection) return;
    const { side, cells } = boardCells(view.map.tiles.length);
    const geometry = (id: TileId) => {
      const i = view.map.tiles.findIndex((t) => t.id === id);
      return i < 0 ? undefined : tileGeometry(cells[i]!, side);
    };
    for (const destination of selection.destinations) {
      const g = geometry(destination.tileId);
      if (!g) continue;
      const selected = destination.tileId === flight.candidate;
      flightGraphics.lineStyle(
        selected ? 4 : 2,
        selected ? 0xffd34e : 0x2d9979,
        1,
      );
      flightGraphics.fillStyle(
        selected ? 0xffd34e : 0xb7ffcf,
        selected ? 0.3 : 0.12,
      );
      const points = [
        { x: g.x, y: g.y - g.height / 2 },
        { x: g.x + g.width / 2, y: g.y },
        { x: g.x, y: g.y + g.height / 2 },
        { x: g.x - g.width / 2, y: g.y },
      ];
      const vectors = points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      flightGraphics.fillPoints(vectors, true).strokePoints(vectors, true);
    }
    const origin = view.state.players.find(
      (p) => p.id === selection.playerId,
    )?.position;
    const from = origin && geometry(origin);
    const to = flight.candidate && geometry(flight.candidate);
    if (from && to) {
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(from.x, from.y),
        new Phaser.Math.Vector2(
          (from.x + to.x) / 2,
          Math.min(from.y, to.y) - 110,
        ),
        new Phaser.Math.Vector2(to.x, to.y),
      );
      flightGraphics
        .lineStyle(4, 0xffd34e, 1)
        .strokePoints(curve.getPoints(48));
      flightGraphics.fillStyle(0xffd34e, 1).fillCircle(to.x, to.y, 6);
    }
  }
  class BoardScene extends Phaser.Scene {
    constructor() {
      super('board');
    }
    preload() {
      for (const id of [
        'pokemon:0001',
        'pokemon:0004',
        'pokemon:0007',
        'pokemon:0025',
      ] as const) {
        for (const name of ['Idle', 'Walk'] as const) {
          const { animation: a, url } = findSprite(id, name);
          if (a && url)
            this.load.spritesheet(`${id}:${name}`, url, {
              frameWidth: a.frameWidth,
              frameHeight: a.frameHeight,
            });
        }
      }
    }
    create() {
      if (destroyed) {
        readyDone();
        return;
      }
      this.game.canvas.setAttribute('aria-hidden', 'true');
      const syncLabels = () => labels.sync(this, this.game.canvas, locked());
      this.game.events.on(Phaser.Core.Events.POST_RENDER, syncLabels);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        this.game.events.off(Phaser.Core.Events.POST_RENDER, syncLabels),
      );
      for (const id of [
        'pokemon:0001',
        'pokemon:0004',
        'pokemon:0007',
        'pokemon:0025',
      ])
        for (const name of ['Idle', 'Walk']) {
          const key = `${id}:${name}`;
          if (this.textures.exists(key))
            this.textures
              .get(key)
              .setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      const ground = this.add.graphics().setDepth(-100);
      const polygon = (points: number[], color: number) =>
        ground.fillStyle(color).fillPoints(
          points.reduce<Phaser.Math.Vector2[]>(
            (p, _, i) =>
              i % 2
                ? p
                : [...p, new Phaser.Math.Vector2(points[i]!, points[i + 1]!)],
            [],
          ),
          true,
        );
      polygon([100, 350, 500, 580, 500, 608, 100, 378], 0x647e69);
      polygon([500, 580, 900, 350, 900, 378, 500, 608], 0x49666a);
      polygon([500, 120, 900, 350, 500, 580, 100, 350], 0xb1cd97);
      ground
        .lineStyle(14, 0xd6e8b4)
        .beginPath()
        .moveTo(480, 235)
        .lineTo(430, 315)
        .lineTo(566, 393)
        .lineTo(533, 456)
        .strokePath();
      ground
        .lineStyle(9, 0x7db8c7)
        .beginPath()
        .moveTo(480, 235)
        .lineTo(430, 315)
        .lineTo(566, 393)
        .lineTo(533, 456)
        .strokePath();
      for (const [r, c] of [
        [0.28, 0.32],
        [0.36, 0.29],
        [0.45, 0.23],
        [0.68, 0.28],
        [0.73, 0.36],
        [0.25, 0.64],
        [0.3, 0.72],
        [0.65, 0.71],
      ]) {
        const p = projectWorld(r! * 9 - 0.5, c! * 9 - 0.5, 9);
        void svgTexture(createSceneryArt('forest'), 'tree').then((key) => {
          if (!destroyed)
            this.add
              .image(p.x, p.y, key)
              .setDisplaySize(64, 76.8)
              .setOrigin(0.5, 0.9)
              .setDepth(depthOrder(p));
        });
      }
      flightGraphics = this.add.graphics().setDepth(9000);
      drawFlight();
      let dragged = false;
      let down = { x: 0, y: 0 };
      const hitTile = (pointer: Phaser.Input.Pointer) => {
        const { side, cells } = boardCells(view.map.tiles.length);
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        // Reverse depth for deterministic top-most diamond hit testing.
        const hit = view.map.tiles
          .map((tile, i) => ({ tile, g: tileGeometry(cells[i]!, side) }))
          .sort((a, b) => b.g.y - a.g.y)
          .find(
            ({ g }) =>
              Math.abs(point.x - g.x) / (g.width / 2) +
                Math.abs(point.y - g.y) / (g.height / 2) <=
              1,
          );
        return hit?.tile.id;
      };
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        dragged = false;
        const rect = this.game.canvas.getBoundingClientRect();
        down = {
          x: (pointer.x * rect.width) / this.scale.width,
          y: (pointer.y * rect.height) / this.scale.height,
        };
      });
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (dragged || locked()) return;
        const id = hitTile(pointer);
        if (id) select(id);
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) {
          if (flight.selection && !locked()) {
            const old = flight.hover;
            flight.inspect(hitTile(pointer));
            if (flight.hover && old !== flight.hover) options.onFlightHover?.();
          }
          return;
        }
        const rect = this.game.canvas.getBoundingClientRect();
        if (
          Math.hypot(
            (pointer.x * rect.width) / this.scale.width - down.x,
            (pointer.y * rect.height) / this.scale.height - down.y,
          ) > 8
        )
          dragged = true;
        if ((!flight.selection && zoom <= 1) || !dragged) return;
        const camera = this.cameras.main;
        camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
        camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
      });
      readyDone();
      // Scene becomes RUNNING only after create() returns.
      queueMicrotask(fit);
    }
  }
  const scene = new BoardScene();
  const game = new Phaser.Game({
    type: options.renderer === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
    parent: surface,
    width: 1000,
    height: 720,
    transparent: true,
    audio: { noAudio: true },
    input: { keyboard: false },
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
    banner: false,
  });
  function fit() {
    if (destroyed || !mounted || !scene.sys.isActive()) return;
    const bounds = surface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // refresh() measures parents after scaling: a formerly detached parent needs
    // its actual size supplied first, otherwise the first narrow frame stays 0px.
    game.scale.setParentSize(bounds.width, bounds.height);
    // Match the allocated surface instead of letterboxing a fixed 1000x720
    // frame. Keep at least 1000 logical pixels across for crisp sprite/model
    // textures; the label layer already projects through scene.scale.
    const height = Math.round((1000 * bounds.height) / bounds.width);
    if (game.scale.width !== 1000 || game.scale.height !== height)
      game.scale.setGameSize(1000, height);
    // The island, tall facilities and pawns fit inside this padded world box.
    // User zoom remains relative to this complete-board view on every resize.
    const framing = Math.min(1000 / 860, height / 600);
    scene.cameras.main.setZoom(framing * zoom).centerOn(500, 340);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(surface);
  const textureJobs = new Map<string, Promise<string>>();
  async function svgTexture(svg: SVGSVGElement, key: string): Promise<string> {
    if (scene.textures.exists(key)) return key;
    const existing = textureJobs.get(key);
    if (existing) return existing;
    const job = (async () => {
      const box = svg.viewBox.baseVal;
      svg.setAttribute('width', String(box.width * 2));
      svg.setAttribute('height', String(box.height * 2));
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      await image.decode();
      if (!destroyed) scene.textures.addImage(key, image);
      return key;
    })();
    textureJobs.set(key, job);
    try {
      return await job;
    } finally {
      textureJobs.delete(key);
    }
  }
  function renderCredits() {
    credits.replaceChildren(createArtCredits());
    const details = document.createElement('details');
    const heading = document.createElement('summary');
    heading.textContent = '스프라이트 출처 및 이용 조건';
    details.append(heading);
    for (const credit of gameCredits(view.credits)) {
      const p = document.createElement('p');
      p.textContent = `${credit.label} · ${credit.attribution}`;
      if (credit.sourceUrl) {
        const a = document.createElement('a');
        a.href = credit.sourceUrl;
        a.textContent = ' 출처';
        a.target = '_blank';
        a.rel = 'noreferrer';
        p.append(a);
      }
      (credit.requiredInline ? credits : details).append(p);
    }
    credits.append(details);
  }
  async function render(
    snapshot: GameView,
    settings: BoardVisuals,
    preserve = false,
  ) {
    const token = ++revision;
    await ready;
    if (destroyed) return;
    const { side, cells } = boardCells(snapshot.map.tiles.length);
    for (const [id, tile] of tiles)
      if (!snapshot.map.tiles.some((t) => t.id === id)) {
        removeTile(tile);
        tile.button.remove();
        labels.remove(id);
        tiles.delete(id);
      }
    const fontFamily =
      getComputedStyle(element).getPropertyValue('--pm-font-game').trim() ||
      'system-ui';
    await Promise.all(
      snapshot.map.tiles.map(async (tile, i) => {
        const holding = snapshot.state.holdings.find(
          (h) => h.tileId === tile.id,
        );
        const requested = settings.construction?.get(tile.id);
        const owner = ownerFromInput(
          requested?.owner,
          holding?.ownerId,
          snapshot.state.players,
        );
        const visual = applyConstructionOwner(
          requested ?? constructionFromHolding(holding),
          owner,
        );
        const metadata = settings.metadata?.get(tile.id);
        const g = tileGeometry(cells[i]!, side);
        const signature = JSON.stringify([
          tile,
          g,
          visual,
          metadata,
          fontFamily,
        ]);
        let entry = tiles.get(tile.id);
        if (entry?.signature === signature) return;
        const keys = [`face:${token}:${i}`, `model:${token}:${i}`];
        const faceSvg = createTileFaces(
          tile.kind,
          g,
          visual.stage === 'unowned' ? null : owner,
        );
        if (tile.kind === 'special')
          faceSvg
            .querySelector('.pm-face-top')
            ?.setAttribute('fill', '#d9c9ed');
        await Promise.all([
          svgTexture(faceSvg, keys[0]!),
          svgTexture(
            createFacility(
              tile.kind,
              holding?.facilityLevel ?? 0,
              i,
              { ...tile, ...metadata },
              visual,
            ),
            keys[1]!,
          ),
        ]);
        if (destroyed || token !== revision) {
          if (!destroyed) keys.forEach((k) => scene.textures.remove(k));
          return;
        }
        if (!entry) {
          const button = document.createElement('button');
          button.type = 'button';
          button.onclick = () => select(tile.id);
          button.dataset.tileId = tile.id;
          tileList.append(button);
          entry = { signature: '', images: [], keys: [], button };
          tiles.set(tile.id, entry);
        }
        removeTile(entry);
        entry.signature = signature;
        entry.keys = keys;
        entry.button.textContent = `${i + 1}. ${tile.nameKo} · ${tile.kind} · ${visual.stage}${owner ? ` · ${owner.name}` : ''}`;
        entry.button.dataset.stage = visual.stage;
        entry.button.dataset.ownerId = owner?.id ?? '';
        entry.button.dataset.kind = tile.kind;
        entry.button.disabled = externalLock || destroyed;
        entry.button.setAttribute('aria-disabled', String(locked()));
        const face = scene.add
          .image(g.x, g.y, keys[0]!)
          .setOrigin(0.5, g.height / 2 / (g.height + g.thickness))
          .setDisplaySize(g.width, g.height + g.thickness)
          .setDepth(g.y);
        const p = modelPlacement(g);
        const model = scene.add
          .image(p.x, p.y, keys[1]!)
          .setOrigin(0.5, 0.9)
          .setDisplaySize(p.width, p.height)
          .setDepth(depthOrder({ x: g.x, y: p.depthY }));
        labels.set({
          id: tile.id,
          order: i,
          name: tile.nameKo,
          x: g.x,
          y: g.y,
          width: g.width,
          height: g.height,
          special: tile.kind === 'special',
        });
        entry.images = [face, model];
      }),
    );
    if (destroyed || token !== revision) return;
    // Async texture decoding must not scramble keyboard/map traversal order.
    snapshot.map.tiles.forEach((tile, i) => {
      const button = tiles.get(tile.id)!.button;
      if (tileList.children[i] !== button)
        tileList.insertBefore(button, tileList.children[i] ?? null);
    });
    for (const [id, pawn] of pawns)
      if (
        !snapshot.state.players.some(
          (p) => p.id === id && !p.bankrupt && p.pokemonId === pawn.pokemonId,
        )
      ) {
        pawn.sprite.destroy();
        pawn.shadow.destroy();
        pawns.delete(id);
      }
    snapshot.state.players.forEach((player, seat) => {
      if (player.bankrupt) return;
      let pawn = pawns.get(player.id);
      if (!pawn) {
        const key = `${player.pokemonId}:Idle`;
        const sprite = scene.add
          .sprite(0, 0, scene.textures.exists(key) ? key : '__DEFAULT')
          .setScale(1.2);
        const shadow = scene.add.ellipse(0, 0, 22, 9, 0x163a43, 0.27);
        pawn = {
          sprite,
          shadow,
          pokemonId: player.pokemonId,
          tileId: player.position,
          seat,
        };
        pawns.set(player.id, pawn);
        sprite.on('animationupdate', () => anchor(pawn!));
      }
      pawn.seat = seat;
      if (!preserve) pawn.tileId = player.position;
      const index = snapshot.map.tiles.findIndex((t) => t.id === pawn.tileId);
      if (index >= 0) placePawn(pawn, foot(index, seat));
      animatePawn(pawn, 'Idle', 0);
    });
    renderCredits();
    element.dataset.tiles = String(tiles.size);
  }
  function removeTile(entry: TileVisual) {
    entry.images.forEach((i) => i.destroy());
    entry.keys.forEach((k) => scene.textures.remove(k));
    entry.images = [];
    entry.keys = [];
  }
  const origins = new Map<string, { x: number; y: number }>();
  function anchor(pawn: Pawn) {
    const frame = pawn.sprite.frame;
    const key = `${pawn.sprite.texture.key}:${frame.name}`;
    let origin = origins.get(key);
    if (!origin) {
      const canvas = document.createElement('canvas');
      canvas.width = frame.cutWidth;
      canvas.height = frame.cutHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(
        pawn.sprite.texture.getSourceImage() as HTMLImageElement,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width,
        right = 0,
        bottom = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (pixels[(y * canvas.width + x) * 4 + 3]! > 16) {
            left = Math.min(left, x);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
      origin = {
        x: bottom ? (left + right) / 2 / canvas.width : 0.5,
        y: bottom ? bottom / canvas.height : 1,
      };
      origins.set(key, origin);
    }
    pawn.sprite.setOrigin(origin.x, origin.y);
  }
  function animatePawn(pawn: Pawn, name: AnimationName, row: number) {
    const { animation: a } = findSprite(pawn.pokemonId, name);
    const texture = `${pawn.pokemonId}:${name}`;
    if (!a || !scene.textures.exists(texture)) return;
    const cols = a.sheetWidth / a.frameWidth;
    const key = `${texture}:${row}`;
    if (!scene.anims.exists(key))
      scene.anims.create({
        key,
        frameRate: 1000,
        repeat: -1,
        frames: a.durationsMs.map((ms, i) => ({
          key: texture,
          frame: row * cols + i,
          // Phaser 4 uses the frame duration directly (not a base-frame addition).
          duration: ms,
        })),
      });
    pawn.sprite.play(key, true);
    if (reduced()) {
      pawn.sprite.anims.stop();
      pawn.sprite.setTexture(texture, row * cols);
    }
    anchor(pawn);
  }
  function placePawn(pawn: Pawn, p: { x: number; y: number }, lift = 0) {
    const depth = pawnDepth(p);
    pawn.sprite.setPosition(p.x, p.y - lift).setDepth(depth.sprite);
    pawn.shadow.setPosition(p.x, p.y + 1).setDepth(depth.shadow);
    pawn.shadow.setScale(1 - lift / 160);
  }
  function foot(index: number, seat: number) {
    const { side, cells } = boardCells(view.map.tiles.length);
    const cell = cells[index]!;
    const p = pawnFoot(cell, side, seat),
      center = tileGeometry(cell, side);
    // Keep the shared projection, spreading its four seats for opaque sprite silhouettes.
    return standingFoot(view.map.tiles[index]!, center, seat, {
      x: center.x + (p.x - center.x) * 1.55,
      y: center.y + (p.y - center.y) * 1.55,
    });
  }
  function tween(
    config: Phaser.Types.Tweens.TweenBuilderConfig,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted || destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        signal.removeEventListener('abort', stop);
        resolve();
      };
      const task = scene.tweens.add({
        ...config,
        duration: reduced() ? 0 : config.duration,
        onComplete: finish,
      });
      const stop = () => {
        task.stop();
        task.remove();
        finish();
      };
      signal.addEventListener('abort', stop, { once: true });
    });
  }
  async function walk(
    playerId: PlayerId,
    path: readonly TileId[],
    signal: AbortSignal,
    fly = false,
  ) {
    const pawn = pawns.get(playerId);
    if (!pawn) return;
    for (const id of path) {
      if (signal.aborted || destroyed) break;
      const index = view.map.tiles.findIndex((t) => t.id === id);
      if (index < 0) continue;
      const to = foot(index, pawn.seat),
        from = { x: pawn.shadow.x, y: pawn.shadow.y - 1 };
      // Screen-space direction rows are S,SE,E,NE,N,NW,W,SW in AnimData.
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const row = (((2 - Math.round(angle / (Math.PI / 4))) % 8) + 8) % 8;
      animatePawn(pawn, 'Walk', row);
      if (!fly && !reduced() && !signal.aborted) options.onStep?.();
      const cursor = { ...from, t: 0 };
      await tween(
        {
          targets: cursor,
          x: to.x,
          y: to.y,
          t: 1,
          duration: fly ? 720 : 240,
          ease: 'Linear',
          onUpdate: () =>
            placePawn(
              pawn,
              cursor,
              fly ? Math.sin(cursor.t * Math.PI) * 75 : 0,
            ),
        },
        signal,
      );
      if (!destroyed) {
        pawn.tileId = id;
        placePawn(pawn, to);
      }
    }
    if (!destroyed) animatePawn(pawn, 'Idle', 0);
  }
  function schedule(
    run: (signal: AbortSignal) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<Completion> {
    if (destroyed) return Promise.resolve({ status: 'destroyed' });
    const epoch = generation;
    busy++;
    notifyLock();
    const job = tail
      .then(async (): Promise<Completion> => {
        await ready;
        if (destroyed) return { status: 'destroyed' };
        if (epoch !== generation || signal?.aborted)
          return { status: 'cancelled' };
        const controller = new AbortController();
        active.add(controller);
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        try {
          await run(controller.signal);
          return {
            status: destroyed
              ? 'destroyed'
              : controller.signal.aborted
                ? 'cancelled'
                : 'completed',
          };
        } finally {
          signal?.removeEventListener('abort', abort);
          active.delete(controller);
        }
      })
      .finally(() => {
        busy--;
        notifyLock();
      });
    tail = job.catch(() => {});
    return job;
  }
  async function pulse(tileId: TileId, signal: AbortSignal) {
    const model = tiles.get(tileId)?.images[1];
    if (!model) return;
    const scale = model.scaleX;
    try {
      await tween(
        {
          targets: model,
          alpha: 0.5,
          duration: 160,
          yoyo: true,
          repeat: 1,
          scaleX: scale * 1.12,
        },
        signal,
      );
    } finally {
      if (!destroyed && model.active) model.setAlpha(1).setScale(scale);
    }
  }
  function present(
    update: UIUpdate,
    presentationOptions: { signal?: AbortSignal } = {},
  ) {
    if (update.id && seen.has(update.id)) return seen.get(update.id)!;
    flight.invalidate(update.view.flightSelection);
    latestView = update.view;
    const settings = visuals;
    const job = schedule(async (signal) => {
      view = update.view;
      await render(
        view,
        settings,
        !!update.movement || !!update.effects?.some((e) => e.type === 'fly'),
      );
      if (signal.aborted || destroyed) return;
      if (update.movement && !update.effects?.some((e) => e.type === 'fly'))
        await walk(update.movement.playerId, update.movement.path, signal);
      for (const event of update.events) {
        if (signal.aborted || destroyed) break;
        if (
          event.type === 'city-acquired' ||
          event.type === 'facility-upgraded'
        )
          await pulse(event.tileId, signal);
      }
      for (const request of update.effects ?? []) {
        if (signal.aborted || destroyed) break;
        if (effectsSeen.has(request.id)) continue;
        effectsSeen.add(request.id);
        if (request.type === 'fly' && options.presentEffect) {
          const pawn = pawns.get(request.playerId);
          pawn?.sprite.setVisible(false);
          pawn?.shadow.setVisible(false);
          element.dataset.mountedPlayer = request.playerId;
          try {
            await abortable(options.presentEffect(request, signal), signal);
          } finally {
            delete element.dataset.mountedPlayer;
            if (!destroyed && pawn) {
              pawn.tileId = request.to;
              const index = view.map.tiles.findIndex(
                (tile) => tile.id === request.to,
              );
              if (index >= 0) placePawn(pawn, foot(index, pawn.seat));
              pawn.sprite.setVisible(true);
              pawn.shadow.setVisible(true);
            }
          }
        } else {
          if (options.presentEffect)
            await abortable(options.presentEffect(request, signal), signal);
          if (request.type === 'fly')
            await walk(request.playerId, [request.to], signal, true);
          else if (!options.presentEffect) await pulse(request.tileId, signal);
        }
      }
      if (!destroyed) await render(view, settings);
    }, presentationOptions.signal);
    if (update.id) {
      seen.set(update.id, job);
      if (seen.size > 512) seen.delete(seen.keys().next().value!);
    }
    return job;
  }
  function abortable(task: Promise<void>, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      void task.catch(() => {});
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener('abort', finish);
        resolve();
      };
      signal.addEventListener('abort', finish, { once: true });
      void task.then(finish, (error) => {
        signal.removeEventListener('abort', finish);
        reject(error);
      });
    });
  }
  function cancel() {
    flight.set(undefined);
    generation++;
    for (const controller of active) controller.abort();
  }
  const onMotion = () => {
    cancel();
    void reconcile();
  };
  function reconcile() {
    const snapshot = latestView,
      settings = visuals;
    return schedule(async () => {
      view = snapshot;
      await render(view, settings);
    });
  }
  media.addEventListener('change', onMotion);
  busy++;
  notifyLock();
  const initialized = render(view, visuals).finally(() => {
    busy--;
    notifyLock();
  });
  tail = initialized.catch(() => {});
  return {
    element,
    setFlightSelection: flight.set,
    invalidateFlightSelection: flight.invalidate,
    ready: initialized,
    mount(parent: HTMLElement) {
      if (destroyed) throw new Error('Board destroyed');
      parent.append(element);
      mounted = true;
      fit();
      return element;
    },
    update(
      next: GameView | UIUpdate,
      settings: BoardVisuals = visuals,
    ): Promise<Completion> {
      visuals = settings;
      if ('view' in next) return present(next);
      flight.invalidate(next.flightSelection);
      latestView = next;
      return schedule(async () => {
        view = next;
        await render(view, settings);
      });
    },
    move(
      movement: NonNullable<UIUpdate['movement']>,
      settings: { signal?: AbortSignal } = {},
    ) {
      return schedule(
        (signal) => walk(movement.playerId, movement.path, signal),
        settings.signal,
      );
    },
    flightAnchors(request: Extract<SpecialEventRequest, { type: 'fly' }>) {
      if (destroyed || !scene.cameras?.main || !game.canvas) return undefined;
      const pawn = pawns.get(request.playerId);
      if (!pawn) return undefined;
      const point = (id: TileId) => {
        const index = view.map.tiles.findIndex((tile) => tile.id === id);
        if (index < 0) return undefined;
        const p = foot(index, pawn.seat);
        const screen = scene.cameras.main.matrixCombined.transformPoint(
          p.x,
          p.y,
        );
        const bounds = game.canvas.getBoundingClientRect();
        return {
          x: bounds.left + (screen.x * bounds.width) / scene.scale.width,
          y: bounds.top + (screen.y * bounds.height) / scene.scale.height,
        };
      };
      const from = point(request.from),
        to = point(request.to);
      return from && to ? { from, to } : undefined;
    },
    present,
    cancel,
    /** Skip every queued presentation, then reconcile to the latest supplied snapshot. */
    async skip() {
      cancel();
      await reconcile();
    },
    setInputLocked(value: boolean) {
      externalLock = value;
      notifyLock();
    },
    setZoom(value: number) {
      zoom = Phaser.Math.Clamp(value, 1, 2.5);
      fit();
    },
    resize: fit,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      revision++;
      readyDone();
      observer.disconnect();
      flight.destroy();
      labels.destroy();
      media.removeEventListener('change', onMotion);
      tileList.querySelectorAll('button').forEach((b) => (b.onclick = null));
      await tail;
      await new Promise<void>((resolve) => {
        game.events.once(Phaser.Core.Events.DESTROY, resolve);
        game.destroy(true);
      });
      tiles.clear();
      pawns.clear();
      origins.clear();
      seen.clear();
      effectsSeen.clear();
      textureJobs.clear();
      element.remove();
    },
  };
}

export type PhaserBoardRenderer = ReturnType<typeof createPhaserBoard>;
