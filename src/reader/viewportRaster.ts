type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
/** Copy only the visible source region at physical display resolution. */
export function viewportRaster(image: Box, clip: Box, sourceWidth: number, sourceHeight: number, dpr: number, padding=64) {
  if (![image.width,image.height,sourceWidth,sourceHeight,dpr].every(v => Number.isFinite(v) && v > 0)) return null;
  const left=Math.max(image.left,clip.left-padding),top=Math.max(image.top,clip.top-padding);
  const right=Math.min(image.right,clip.right+padding),bottom=Math.min(image.bottom,clip.bottom+padding);
  if(right<=left||bottom<=top||image.right<=clip.left||image.left>=clip.right||image.bottom<=clip.top||image.top>=clip.bottom)return null;
  const width=right-left,height=bottom-top;
  const density=Math.min(dpr,Math.sqrt(8_000_000/(width*height)));
  return {left,top,width,height,x:(left-image.left)*sourceWidth/image.width,y:(top-image.top)*sourceHeight/image.height,
    sourceWidth:width*sourceWidth/image.width,sourceHeight:height*sourceHeight/image.height,
    pixelsWide:Math.max(1,Math.floor(width*density)),pixelsHigh:Math.max(1,Math.floor(height*density))};
}

export function desktopViewportRaster(image:Box,clip:Box,width:number,height:number,dpr:number){
  const visible=viewportRaster(image,clip,width,height,dpr,0);if(!visible)return null;
  const density=Math.min(dpr,Math.sqrt(8_000_000/(visible.width*visible.height)));
  let padding=Math.min(320,clip.width/4,clip.height/4);
  // Extra coverage saves repeated source uploads during a drag, but must not
  // lower the visible pixel density just to retain offscreen pixels.
  while(padding>1){const area=viewportRaster(image,clip,width,height,dpr,padding);if(area&&area.width*area.height*density*density<=8_000_000) return area;padding/=2;}
  return visible;
}
export function viewportContains(cached:NonNullable<ReturnType<typeof viewportRaster>>,visible:NonNullable<ReturnType<typeof viewportRaster>>){
  return cached.x<=visible.x+.001&&cached.y<=visible.y+.001&&cached.x+cached.sourceWidth>=visible.x+visible.sourceWidth-.001&&cached.y+cached.sourceHeight>=visible.y+visible.sourceHeight-.001;
}
