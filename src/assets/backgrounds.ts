/**
 * Parallax background loader — public/assets/backgrounds.
 * Missing PNGs → null; Mode-7 keeps procedural sky.
 */

const MANIFEST_URL = '/assets/backgrounds/manifest.json';
const BASE = '/assets/backgrounds';

export interface BgSlotJson {
  image: string;
  width?: number;
  height: number;
  scrollFactor: number;
}

export interface BackgroundsManifest {
  far: BgSlotJson;
  near: BgSlotJson;
  notes?: string;
}

export interface ParallaxLayer {
  image: HTMLImageElement;
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

async function loadSlot(slot: BgSlotJson): Promise<ParallaxLayer> {
  const image = await loadImage(`${BASE}/${slot.image}`);
  return {
    image,
    height: slot.height || image.naturalHeight,
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
