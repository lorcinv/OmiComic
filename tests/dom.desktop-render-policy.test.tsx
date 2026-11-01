import {it,expect} from 'vitest';
import {preferDesktopViewportDisplay} from '../src/reader/desktopDisplayPolicy';
import {preferNativeImageDisplay} from '../src/reader/largeImagePolicy';
import {desktopViewportRaster,viewportContains,viewportRaster} from '../src/reader/viewportRaster';

it('separates PC pixel/memory policy from the unchanged Android encoded-size policy',()=>{
  expect(preferDesktopViewportDisplay(2562,3625)).toBe(false);
  expect(preferNativeImageDisplay(2562,3625,8686452)).toBe(true);
  expect(preferDesktopViewportDisplay(6000,4000)).toBe(false);
  expect(preferDesktopViewportDisplay(8000,10000)).toBe(true);
  expect(preferDesktopViewportDisplay(100,32769)).toBe(true);
  expect(preferDesktopViewportDisplay(NaN,Infinity)).toBe(false);
});
it('reuses covered source viewports without spending visible resolution on the offscreen apron',()=>{
  const box=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height});
  const clip=box(0,0,1440,900),source=box(-3000,-2000,8000,10000);
  const cached=desktopViewportRaster(source,clip,8000,10000,1.25)!;
  expect(viewportContains(cached,viewportRaster(box(-3100,-2100,8000,10000),clip,8000,10000,1.25,0)!)).toBe(true);
  expect(viewportContains(cached,viewportRaster(box(-4000,-3000,8000,10000),clip,8000,10000,1.25,0)!)).toBe(false);
  for(const dpr of [1,1.25,2]){
    const area=desktopViewportRaster(source,box(0,0,3840,2160),8000,10000,dpr)!,visible=viewportRaster(source,box(0,0,3840,2160),8000,10000,dpr,0)!;
    expect(area.pixelsWide*area.pixelsHigh).toBeLessThanOrEqual(8_000_000);
    expect(area.pixelsWide/area.width).toBeGreaterThanOrEqual(visible.pixelsWide/visible.width-.002);
  }
});
