import { DISPLAY_TILE_LIMIT, samplingCrop, samplingTileSize, samplingWeights } from './displaySamplingKernel';

// Crop without resizing. Each bounded tile filters at the final output scale,
// preventing an earlier generic resize from baking moire into the result.
const surface = new OffscreenCanvas(1, 1);
const gl = surface.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
let program: WebGLProgram | null = null;
function shader(type: number, source: string) {
  const result = gl!.createShader(type)!;
  gl!.shaderSource(result, source); gl!.compileShader(result);
  if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) throw Error('Display sampling shader failed');
  return result;
}
function pipeline() {
  if (program) return program;
  const vertex = shader(gl!.VERTEX_SHADER, `#version 300 es
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`);
  const fragment = shader(gl!.FRAGMENT_SHADER, `#version 300 es
  precision highp float; precision highp int;
  uniform sampler2D image;
  uniform vec2 sourceSize, outputSize, sourceOrigin, outputOrigin, scale;
  uniform int vertical;
  out vec4 color;
  float weight(float x){x=abs(x);if(x<0.00001)return 1.0;if(x>=3.0)return 0.0;float p=3.141592653589793*x;return sin(p)*sin(p/3.0)/(p*p/3.0);}
  void main(){
    float ratio=vertical==1?scale.y:scale.x;
    float position=vertical==1?outputOrigin.y+outputSize.y-gl_FragCoord.y:outputOrigin.x+gl_FragCoord.x;
    float origin=vertical==1?sourceOrigin.y:sourceOrigin.x;
    float center=position/ratio-0.5-origin,total=0.0;
    vec4 sum=vec4(0.0);
    int radius=int(ceil(3.0/(ratio*0.9)))+1;
    for(int i=-radius;i<=radius;i++){
      int index=int(floor(center))+i;
      float w=weight((float(index)-center)*ratio*0.9);
      ivec2 p=vertical==1?ivec2(int(gl_FragCoord.x),clamp(index,0,int(sourceSize.y)-1)):ivec2(clamp(index,0,int(sourceSize.x)-1),int(gl_FragCoord.y));
      sum+=texelFetch(image,p,0)*w;total+=w;
    }
    color=sum/total;color.a=clamp(color.a,0.0,1.0);color.rgb=clamp(color.rgb,vec3(0.0),vec3(color.a));
  }`);
  const created = gl!.createProgram()!;
  gl!.attachShader(created, vertex); gl!.attachShader(created, fragment); gl!.linkProgram(created);
  gl!.deleteShader(vertex); gl!.deleteShader(fragment);
  if (!gl!.getProgramParameter(created, gl!.LINK_STATUS)) { gl!.deleteProgram(created); throw Error('Display sampling program failed'); }
  return program = created;
}
function texture(width: number, height: number, image?: ImageBitmap) {
  const t = gl!.createTexture()!;
  gl!.bindTexture(gl!.TEXTURE_2D, t);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
  if (image) gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, image);
  else gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, width, height, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
  return t;
}
async function tiledResize(input: ImageBitmap, width: number, height: number) {
  const limit = Math.min(DISPLAY_TILE_LIMIT, gl!.getParameter(gl!.MAX_TEXTURE_SIZE));
  const fits = input.width <= limit && input.height <= limit;
  const tileWidth = fits ? width : samplingTileSize(input.width, width, limit, 512), tileHeight = fits ? height : samplingTileSize(input.height, height, limit, 128);
  if (tileWidth < 1 || tileHeight < 1) throw Error('Display sampling kernel exceeds tile');
  const output = new OffscreenCanvas(width, height), context = output.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  const p = pipeline();
  try {
    for (let top = 0; top < height; top += tileHeight) for (let left = 0; left < width; left += tileWidth) {
      const w = Math.min(tileWidth, width - left), h = Math.min(tileHeight, height - top);
      const x = samplingCrop(left, w, input.width, width), y = samplingCrop(top, h, input.height, height);
      const crop = x.first === 0 && y.first === 0 && x.length === input.width && y.length === input.height
        ? input : await createImageBitmap(input, x.first, y.first, x.length, y.length, { premultiplyAlpha: 'premultiply' });
      let source: WebGLTexture | null = null, horizontal: WebGLTexture | null = null, frame: WebGLFramebuffer | null = null;
      try {
        surface.width = w; surface.height = h;
        source = texture(crop.width, crop.height, crop); horizontal = texture(w, crop.height); frame = gl!.createFramebuffer();
        gl!.useProgram(p); gl!.activeTexture(gl!.TEXTURE0); gl!.uniform1i(gl!.getUniformLocation(p, 'image'), 0);
        gl!.uniform2f(gl!.getUniformLocation(p, 'scale'), width / input.width, height / input.height);
        gl!.uniform2f(gl!.getUniformLocation(p, 'sourceOrigin'), x.first, y.first);
        gl!.uniform2f(gl!.getUniformLocation(p, 'outputOrigin'), left, top);
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, frame);
        gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, horizontal, 0);
        if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) throw Error('Display sampling surface unavailable');
        gl!.bindTexture(gl!.TEXTURE_2D, source); gl!.viewport(0, 0, w, crop.height);
        gl!.uniform2f(gl!.getUniformLocation(p, 'sourceSize'), crop.width, crop.height);
        gl!.uniform2f(gl!.getUniformLocation(p, 'outputSize'), w, crop.height); gl!.uniform1i(gl!.getUniformLocation(p, 'vertical'), 0);
        gl!.drawArrays(gl!.TRIANGLES, 0, 3);
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null); gl!.bindTexture(gl!.TEXTURE_2D, horizontal); gl!.viewport(0, 0, w, h);
        gl!.uniform2f(gl!.getUniformLocation(p, 'sourceSize'), w, crop.height);
        gl!.uniform2f(gl!.getUniformLocation(p, 'outputSize'), w, h); gl!.uniform1i(gl!.getUniformLocation(p, 'vertical'), 1);
        gl!.drawArrays(gl!.TRIANGLES, 0, 3);
        if (gl!.isContextLost() || gl!.getError() !== gl!.NO_ERROR) throw Error('Display sampling graphics unavailable');
        const tile = surface.transferToImageBitmap();
        try { context.drawImage(tile, left, top); } finally { tile.close(); }
      } finally {
        if (crop !== input) crop.close(); gl!.deleteTexture(source); gl!.deleteTexture(horizontal); gl!.deleteFramebuffer(frame);
      }
    }
    return output.transferToImageBitmap();
  } finally { output.width = output.height = 1; surface.width = surface.height = 1; }
}

// No-WebGL / very small target fallback: read bounded strips, retaining only
// the filtered rows needed by the current vertical kernel.
function softwareResize(input: ImageBitmap, width: number, height: number) {
  const xs = samplingWeights(input.width, width), ys = samplingWeights(input.height, height);
  const stripHeight = Math.min(64, input.height), strip = new OffscreenCanvas(input.width, stripHeight);
  const read = strip.getContext('2d', { willReadFrequently: true })!;
  const output = new OffscreenCanvas(width, height), context = output.getContext('2d')!;
  const line = context.createImageData(width, 1), rows = new Map<number, Float32Array>();
  let stripTop = -1, data: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray();
  try {
    for (let y = 0; y < height; y++) {
      const vertical = ys[y];
      for (const row of rows.keys()) { if (row >= vertical.first) break; rows.delete(row); }
      for (let sy = vertical.first; sy < vertical.first + vertical.weights.length; sy++) {
        if (rows.has(sy)) continue;
        if (sy < stripTop || sy >= stripTop + stripHeight) {
          stripTop = Math.floor(sy / stripHeight) * stripHeight;
          read.clearRect(0, 0, input.width, stripHeight);
          read.drawImage(input, 0, stripTop, input.width, Math.min(stripHeight, input.height - stripTop), 0, 0, input.width, Math.min(stripHeight, input.height - stripTop));
          data = read.getImageData(0, 0, input.width, stripHeight).data;
        }
        const row = new Float32Array(width * 4), offset = (sy - stripTop) * input.width * 4;
        for (let x = 0; x < width; x++) {
          const horizontal = xs[x], at = x * 4;
          for (let i = 0; i < horizontal.weights.length; i++) {
            const source = offset + (horizontal.first + i) * 4, weight = horizontal.weights[i], alpha = data[source + 3] / 255;
            row[at] += data[source] * alpha * weight; row[at + 1] += data[source + 1] * alpha * weight;
            row[at + 2] += data[source + 2] * alpha * weight; row[at + 3] += data[source + 3] * weight;
          }
        }
        rows.set(sy, row);
      }
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0; const at = x * 4;
        for (let i = 0; i < vertical.weights.length; i++) {
          const row = rows.get(vertical.first + i)!, weight = vertical.weights[i];
          r += row[at] * weight; g += row[at + 1] * weight; b += row[at + 2] * weight; a += row[at + 3] * weight;
        }
        line.data[at] = a > .5 ? r * 255 / a : 0; line.data[at + 1] = a > .5 ? g * 255 / a : 0;
        line.data[at + 2] = a > .5 ? b * 255 / a : 0; line.data[at + 3] = a;
      }
      context.putImageData(line, 0, y);
    }
    return output.transferToImageBitmap();
  } finally { strip.width = strip.height = output.width = output.height = 1; }
}
self.onmessage = async (event: MessageEvent<{ id: number; bitmap?: ImageBitmap; url?: string; width: number; height: number }>) => {
  const { id, url, width, height } = event.data;
  let input = event.data.bitmap;
  try {
    if (!input && url) { const response = await fetch(url); if (!response.ok) throw Error('Display source unavailable'); input = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'premultiply' }); }
    if (!input || width < 1 || height < 1 || width * height > 4_000_000) throw Error('Invalid display size');
    let sampled: ImageBitmap;
    if (gl && !gl.isContextLost()) { try { sampled = await tiledResize(input, width, height); } catch { sampled = softwareResize(input, width, height); } }
    else sampled = softwareResize(input, width, height);
    self.postMessage({ id, bitmap: sampled }, { transfer: [sampled] });
  } catch { self.postMessage({ id, error: true }); }
  finally { input?.close(); }
};
