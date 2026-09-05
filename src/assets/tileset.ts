/**
 * Track tileset loader — fetches public/assets/tiles/track at runtime.
 * Missing PNG/JSON → null; Mode-7 keeps procedural palette.
 *
 * Artist convention: tile index 0 = upper-left pixel (0,0). No blank tile 0.
 */

import {
  SURFACE_GRASS,
  SURFACE_ROAD,
  SURFACE_WALL,
  SURFACE_FINISH,
} from '../track';

const TILESET_BASE = '/assets/tiles/track';
const TILESET_JSON = `${TILESET_BASE}/tileset.json`;

/** JSON surface names → engine surface codes (track.ts). */
export const SURFACE_CODE_BY_NAME: Record<string, number> = {
  grass: SURFACE_GRASS,
  road: SURFACE_ROAD,
  wall: SURFACE_WALL,
  finish: SURFACE_FINISH,
};

export const SURFACE_NAME_BY_CODE: Record<number, string> = {
  [SURFACE_GRASS]: 'grass',
  [SURFACE_ROAD]: 'road',
  [SURFACE_WALL]: 'wall',
  [SURFACE_FINISH]: 'finish',
};

export interface TilesetJson {
  image: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  padding: number;
  spacing: number;
  surfaces: Record<string, number[]>;
}

export interface TrackTileset {
  meta: TilesetJson;
  image: HTMLImageElement;
  /** Full sheet pixels for fast sampling. */
  pixels: Uint8ClampedArray;
  imageWidth: number;
  imageHeight: number;
  /** surface code → tile index list */
  indicesBySurface: number[][];
}

let active: TrackTileset | null = null;

export function getActiveTileset(): TrackTileset | null {
  return active;
}

export function setActiveTileset(ts: TrackTileset | null): void {
  active = ts;
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

function extractPixels(img: HTMLImageElement): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  return { pixels: data.data, width: c.width, height: c.height };
}

function buildIndicesBySurface(surfaces: Record<string, number[]>): number[][] {
  const byCode: number[][] = [[0], [0], [0], [0]];
  for (const [name, list] of Object.entries(surfaces)) {
    const code = SURFACE_CODE_BY_NAME[name];
    if (code === undefined || !list?.length) continue;
    byCode[code] = list.slice();
  }
  return byCode;
}

/**
 * Load track tileset from public/assets. Returns null if JSON or PNG missing.
 */
export async function loadTrackTileset(): Promise<TrackTileset | null> {
  try {
    const res = await fetch(TILESET_JSON);
    if (!res.ok) return null;
    const meta = (await res.json()) as TilesetJson;
    if (!meta?.image || !meta.tileWidth || !meta.columns) return null;

    const imgUrl = `${TILESET_BASE}/${meta.image}`;
    const image = await loadImage(imgUrl);
    const { pixels, width, height } = extractPixels(image);

    const ts: TrackTileset = {
      meta,
      image,
      pixels,
      imageWidth: width,
      imageHeight: height,
      indicesBySurface: buildIndicesBySurface(meta.surfaces ?? {}),
    };
    active = ts;
    return ts;
  } catch {
    active = null;
    return null;
  }
}

/** Stable tile index for a surface at world map coords. */
export function pickTileIndex(
  ts: TrackTileset,
  surfaceCode: number,
  wx: number,
  wy: number,
): number {
  const list = ts.indicesBySurface[surfaceCode] ?? ts.indicesBySurface[0];
  if (!list || list.length === 0) return 0;
  if (list.length === 1) return list[0]!;
  const tx = (wx >> 4) & 0xffff;
  const ty = (wy >> 4) & 0xffff;
  return list[(tx + ty * 3) % list.length]!;
}

/** Pixel (sx, sy) inside a tile index on the sheet. */
export function tilePixelOffset(
  ts: TrackTileset,
  tileIndex: number,
  sx: number,
  sy: number,
): number {
  const { tileWidth: tw, tileHeight: th, columns, padding, spacing } = ts.meta;
  const col = tileIndex % columns;
  const row = (tileIndex / columns) | 0;
  const px =
    padding + col * (tw + spacing) + ((sx % tw) + tw) % tw;
  const py =
    padding + row * (th + spacing) + ((sy % th) + th) % th;
  return (py * ts.imageWidth + px) * 4;
}

/** Sample RGB from tileset for a world map pixel + surface code. */
export function sampleTilesetRGB(
  ts: TrackTileset,
  surfaceCode: number,
  wx: number,
  wy: number,
): [number, number, number] {
  const idx = pickTileIndex(ts, surfaceCode, wx, wy);
  const off = tilePixelOffset(ts, idx, wx, wy);
  const p = ts.pixels;
  return [p[off]!, p[off + 1]!, p[off + 2]!];
}

/** Draw one tile into a canvas (debug / tooling). */
export function getTileCanvas(
  ts: TrackTileset,
  tileIndex: number,
): HTMLCanvasElement {
  const tw = ts.meta.tileWidth;
  const th = ts.meta.tileHeight;
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const col = tileIndex % ts.meta.columns;
  const row = (tileIndex / ts.meta.columns) | 0;
  const { padding, spacing } = ts.meta;
  const sx = padding + col * (tw + spacing);
  const sy = padding + row * (th + spacing);
  ctx.drawImage(ts.image, sx, sy, tw, th, 0, 0, tw, th);
  return c;
}

export function getTileImageData(
  ts: TrackTileset,
  tileIndex: number,
): ImageData {
  const c = getTileCanvas(ts, tileIndex);
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}
