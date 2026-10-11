import { processPixels } from './imageProcessing';
self.onmessage = async (event: MessageEvent<{ id: number; bitmap: ImageBitmap; denoise: number; sharpen: number }>) => {
  const { id, bitmap, denoise, sharpen } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processed = processPixels(pixels.data, canvas.width, canvas.height, denoise, sharpen);
    pixels.data.set(processed); ctx.putImageData(pixels, 0, 0);
    const result = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, blob: result, width: canvas.width, height: canvas.height });
    canvas.width = canvas.height = 1;
  } catch (error) { bitmap.close(); self.postMessage({ id, error: String(error) }); }
};
