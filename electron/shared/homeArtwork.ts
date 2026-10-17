export interface ArtworkCrop { x: number; y: number; width: number; height: number }
export interface HomeArtwork { name: string; url: string; sourceUrl?: string; crop?: ArtworkCrop }
export interface SaveHomeArtwork { name: string; sourceUrl: string; crop: ArtworkCrop }
export const fullArtworkCrop: ArtworkCrop = { x: 0, y: 0, width: 1, height: 1 };

export function validArtworkCrop(value: unknown): value is ArtworkCrop {
  if (!value || typeof value !== 'object') return false;
  const c = value as ArtworkCrop;
  return [c.x, c.y, c.width, c.height].every(Number.isFinite)
    && c.x >= 0 && c.y >= 0 && c.width > 0 && c.height > 0
    && c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001;
}

export function centerArtworkCrop(crop: ArtworkCrop, width: number, height: number): ArtworkCrop {
  width = Math.max(Number.EPSILON, Math.min(1, width)); height = Math.max(Number.EPSILON, Math.min(1, height));
  return { x: Math.max(0, Math.min(1 - width, crop.x + (crop.width - width) / 2)),
    y: Math.max(0, Math.min(1 - height, crop.y + (crop.height - height) / 2)), width, height };
}
