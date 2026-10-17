import { app, nativeImage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeRasterImage } from './documentImageSafety';
import { validArtworkCrop, type HomeArtwork, type SaveHomeArtwork } from '../shared/homeArtwork';

export type { HomeArtwork } from '../shared/homeArtwork';
const location = () => path.join(app.getPath('userData'), 'home-artwork.json');
let mutation: Promise<unknown> = Promise.resolve();

function change<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.then(operation);
  mutation = result.catch(() => undefined);
  return result;
}

export async function getHomeArtwork(): Promise<HomeArtwork | null> {
  await mutation;
  try {
    const file = location();
    if ((await fs.stat(file)).size > 64 * 1024 * 1024) return null;
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return typeof data.name === 'string' && typeof data.url === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data.url)
      ? { name: data.name, url: data.url,
        sourceUrl: typeof data.sourceUrl === 'string' && data.sourceUrl.startsWith('data:image/png;base64,') ? data.sourceUrl : undefined,
        crop: validArtworkCrop(data.crop) ? data.crop : undefined } : null;
  } catch { return null; }
}

export function importHomeArtwork(source: string, decodeImage: (url: string) => Promise<string>): Promise<HomeArtwork> {
  return change(async () => {
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的图片。');
    const buffer = await fs.readFile(source);
    if (!safeRasterImage(buffer, 40_000_000)) throw new Error('图片无法读取或尺寸过大，请换一张图片。');
    let image = nativeImage.createFromBuffer(buffer);
    // Chromium supports static WebP and BMP variants that nativeImage cannot read.
    if (image.isEmpty()) {
      const mime = buffer.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : buffer.subarray(0, 2).toString() === 'BM' ? 'image/bmp' : null;
      if (mime) {
        try { image = nativeImage.createFromDataURL(await decodeImage(`data:${mime};base64,${buffer.toString('base64')}`)); }
        catch { throw new Error('图片无法读取或尺寸过大，请换一张图片。'); }
      }
    }
    if (image.isEmpty()) throw new Error('图片无法读取或尺寸过大，请换一张图片。');
    const { width, height } = image.getSize();
    if (Math.max(width, height) > 2400) image = image.resize(width >= height ? { width: 2400, quality: 'best' } : { height: 2400, quality: 'best' });
    // Selection is a draft. Cancelling the crop dialog must preserve the saved artwork.
    return { name: path.basename(source), url: image.toDataURL() };
  });
}

export function saveHomeArtwork(input: SaveHomeArtwork): Promise<HomeArtwork> {
  return change(async () => {
    if (!input || typeof input.name !== 'string' || typeof input.sourceUrl !== 'string'
      || input.sourceUrl.length > 32 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(input.sourceUrl)
      || !validArtworkCrop(input.crop)) throw new Error('裁剪范围无效，请重新选择。');
    const buffer = Buffer.from(input.sourceUrl.slice(input.sourceUrl.indexOf(',') + 1), 'base64');
    if (!safeRasterImage(buffer, 6_000_000)) throw new Error('图片无法读取，请重新选择。');
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('图片无法读取，请重新选择。');
    const size = image.getSize(), c = input.crop;
    const x = Math.min(size.width - 1, Math.round(c.x * size.width));
    const y = Math.min(size.height - 1, Math.round(c.y * size.height));
    const width = Math.max(1, Math.min(size.width - x, Math.round(c.width * size.width)));
    const height = Math.max(1, Math.min(size.height - y, Math.round(c.height * size.height)));
    const artwork: HomeArtwork = { name: path.basename(input.name).slice(0, 255), sourceUrl: image.toDataURL(),
      crop: { x: x / size.width, y: y / size.height, width: width / size.width, height: height / size.height },
      url: image.crop({ x, y, width, height }).toDataURL() };
    const file = location(), temporary = `${file}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.writeFile(temporary, JSON.stringify(artwork), 'utf8');
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
    return artwork;
  });
}

export function resetHomeArtwork(): Promise<null> {
  return change(async () => { await fs.rm(location(), { force: true }); return null; });
}
