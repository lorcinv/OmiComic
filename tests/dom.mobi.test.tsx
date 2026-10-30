import {expect,it} from 'vitest';
import {inspectMobi,MAX_MOBI_BYTES} from '../src/reader/mobiLimits';
import {documentRaster} from '../src/reader/documentRaster';
import {chapterPresentation} from '../src/reader/documentSource';
import {mobiFixture} from './helpers/mobiFixture.cjs';

const asBuffer=(bytes:Uint8Array)=>Uint8Array.from(bytes).buffer;
it('validates independent MOBI records, encrypted files, oversized text, and bad offsets',()=>{
  const valid=mobiFixture(['<p>你好 Omi</p>','<p>Next</p>']);expect(inspectMobi(asBuffer(valid))).toEqual({kf8:false});
  expect(()=>inspectMobi(asBuffer(mobiFixture(['Book'],[],{encryption:1})))).toThrow(/DRM/);
  expect(()=>inspectMobi(asBuffer(mobiFixture(['Book'],[],{compression:17480})))).toThrow(/压缩/);
  const bad=Buffer.from(valid),start=bad.readUInt32BE(78);bad.writeUInt32BE(9*1024*1024,start+4);expect(()=>inspectMobi(asBuffer(bad))).toThrow(/上限/);
  const offset=Buffer.from(valid);offset.writeUInt32BE(MAX_MOBI_BYTES,78);expect(()=>inspectMobi(asBuffer(offset))).toThrow(/范围/);
});
it('rejects document image bombs and active/vector resources before decoding',()=>{
  const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.writeUInt32BE(100000,16);png.writeUInt32BE(100000,20);expect(documentRaster(png)).toBe(null);png.writeUInt32BE(100,16);png.writeUInt32BE(200,20);expect(documentRaster(png)).toBe('image/png');expect(documentRaster(Buffer.from('<svg onload="alert(1)">'))).toBe(null);
});
it('image chapters have no text padding or artificial minimum page height while text keeps its margins',()=>{
  const image=chapterPresentation('<html><head></head><body><p>第 52 页</p><div><img src="data:image/png;base64,AAAA"></div></body></html>');expect(image.imagePage).toBe(true);expect(image.html).toContain('data-omi-image-page="true"');expect(image.html).not.toContain('第 52 页');expect(image.html).toContain('padding:0!important');
  const text=chapterPresentation('<html><head></head><body><p>小说的第一章。</p><img src="data:image/png;base64,AAAA"></body></html>');expect(text.imagePage).toBe(false);expect(text.html).toContain('padding:36px 42px');expect(text.html).toContain('小说的第一章。');
});
