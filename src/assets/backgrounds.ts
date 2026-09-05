/**
 * Parallax background loader — public/assets/backgrounds.
 * Missing PNGs → null; Mode-7 keeps procedural sky.
 */

const MANIFEST_URL = '/assets/backgrounds/manifest.json';
const BASE = '/assets/backgrounds';

/** Near-black threshold for chromaKey bake (0–255 channel distance). */
const CHROMA_THRESHOLD = 16;

export interface BgSlotJson {
  image: string;
  width?: number;
  height: number;
  scrollFactor: number;
  /** Optional hex color (e.g. "#000000") baked to alpha 0 on load. */
  chromaKey?: string;
}

export interface BackgroundsManifest {
  far: BgSlotJson;
  near: BgSlotJson;
  notes?: string;
}

export interface ParallaxLayer {
  /** Source image, or canvas with chromaKey already baked to alpha. */
  image: CanvasImageSource & { width: number; height: number };
  height: number;
  scrollFactor: number;
}

export interface ParallaxLayers {
  far: ParallaxLayer;
  near: ParallaxLayer;
}

let layers: ParallaxLayers | null = null;

export function getParallaxLayers(): ParallaxLayers | null {
  return layers;
}

export function setParallaxLayers(l: ParallaxLayers | null): void {
  layers = l;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Bake chromaKey → transparent on a canvas (near-black within threshold → alpha 0).
 */
function bakeChromaKey(
  img: HTMLImageElement,
  chromaKey: string,
): HTMLCanvasElement {
  const key = parseHexColor(chromaKey) ?? [0, 0, 0];
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const [kr, kg, kb] = key;
  const thr = CHROMA_THRESHOLD;
  for (let i = 0; i < d.length; i += 4) {
    const dr = Math.abs(d[i]! - kr);
    const dg = Math.abs(d[i + 1]! - kg);
    const db = Math.abs(d[i + 2]! - kb);
    if (dr <= thr && dg <= thr && db <= thr) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function sourceSize(src: CanvasImageSource & { width: number; height: number }): {
  width: number;
  height: number;
} {
  if (src instanceof HTMLImageElement) {
    return { width: src.naturalWidth, height: src.naturalHeight };
  }
  return { width: src.width, height: src.height };
}

async function loadSlot(slot: BgSlotJson): Promise<ParallaxLayer> {
  const raw = await loadImage(`${BASE}/${slot.image}`);
  const image = slot.chromaKey ? bakeChromaKey(raw, slot.chromaKey) : raw;
  const size = sourceSize(image);
  return {
    image,
    height: slot.height || size.height,
    scrollFactor: slot.scrollFactor ?? 0.2,
  };
}

/**
 * Load far/near parallax from manifest + PNGs.
 * Returns null if manifest or either image is missing.
 */
export async function loadBackgrounds(): Promise<ParallaxLayers | null> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return null;
    const manifest = (await res.json()) as BackgroundsManifest;
    if (!manifest?.far?.image || !manifest?.near?.image) return null;

    const [far, near] = await Promise.all([
      loadSlot(manifest.far),
      loadSlot(manifest.near),
    ]);

    layers = { far, near };
    return layers;
  } catch {
    layers = null;
    return null;
  }
}
