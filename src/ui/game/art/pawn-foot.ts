/** Anchor the opaque first animation frame, rather than its transparent canvas. */
const offsets = new Map<string, Promise<{ x: number; y: number }>>();
export function alignPawnFoot(node: HTMLElement) {
  const background = node.style.backgroundImage;
  const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
  const width = parseFloat(node.style.width),
    height = parseFloat(node.style.height);
  if (!match || !width || !height) return;
  const url = match[1]!;
  const key = `${url}/${width}/${height}`;
  if (!offsets.has(key))
    offsets.set(
      key,
      (async () => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return { x: 0, y: 0 };
        context.drawImage(image, 0, 0, width, height, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let left = width,
          right = 0,
          bottom = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            if (pixels[(y * width + x) * 4 + 3]! > 16) {
              left = Math.min(left, x);
              right = Math.max(right, x + 1);
              bottom = Math.max(bottom, y + 1);
            }
        return {
          x: bottom ? width / 2 - (left + right) / 2 : 0,
          y: bottom ? height - bottom : 0,
        };
      })(),
    );
  void offsets
    .get(key)!
    .then(({ x, y }) => {
      node.style.setProperty('--pawn-center-offset', `${x}px`);
      node.style.setProperty('--pawn-foot-offset', `${y}px`);
      node.dataset.footAligned = 'true';
    })
    .catch(() => {
      node.style.backgroundImage = 'none';
      node.style.backgroundColor = '#e9c673';
      node.style.borderRadius = '50%';
      node.style.width = '14px';
      node.style.height = '14px';
      node.dataset.assetStatus = 'fallback';
    });
}
