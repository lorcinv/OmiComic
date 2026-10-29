import { expect, it } from 'vitest';
import { DISPLAY_TILE_LIMIT, samplingCrop, samplingRadius, samplingTileSize, samplingWeights } from '../src/reader/displaySamplingKernel';

it('covers the entire output without exceeding bounded source tiles, including large odd sizes', () => {
  for (const [source,target] of [[8000,659],[10000,824],[1062,583],[16383,1256],[2049,1537],[1500,1392]]) {
    const tile = samplingTileSize(source,target,DISPLAY_TILE_LIMIT,512);
    expect(tile).toBeGreaterThan(0);
    const radius=samplingRadius(target/source);
    for(let start=0;start<target;start+=tile){
      const count=Math.min(tile,target-start),crop=samplingCrop(start,count,source,target);
      expect(crop.length).toBeLessThanOrEqual(DISPLAY_TILE_LIMIT);
      expect(crop.first).toBeGreaterThanOrEqual(0);expect(crop.first+crop.length).toBeLessThanOrEqual(source);
      const firstCenter=(start+.5)*source/target-.5,lastCenter=(start+count-.5)*source/target-.5;
      expect(crop.first).toBeLessThanOrEqual(Math.max(0,Math.floor(firstCenter)-radius));
      expect(crop.first+crop.length).toBeGreaterThanOrEqual(Math.min(source,Math.ceil(lastCenter)+radius+1));
    }
  }
});
it('preserves flat tone and suppresses dense non-power-of-two texture before downsampling', () => {
  const weights=samplingWeights(8000,659);
  for(const axis of weights)expect([...axis.weights].reduce((a,b)=>a+b,0)).toBeCloseTo(1,10);
  for(const period of [3,5,10,12]){
    const values=weights.slice(10,-10).map(axis=>[...axis.weights].reduce((sum,w,i)=>sum+w*Math.cos((axis.first+i)*Math.PI*2/period),0));
    const deviation=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length)*127.5;
    expect(deviation,`source period ${period}`).toBeLessThan(1);
  }
});
