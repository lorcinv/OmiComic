// Runs in the browser to create lossless, non-power-of-two screen patterns.
export function seedDenseScreentones({width,height,initial=1}:{width:number;height:number;initial?:number}) {
  const api=window.omicomic,get=api.getAppData;
  api.getAppData=async()=>{const r=await get();if(r.ok){r.data.recentOpened[0].currentPageIndex=initial;r.data.settings.readerMemoryCacheSizeMb=512;r.data.settings.readerPreloadPages=12;}return r;};
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d')!;
  ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
  const zones=[];
  for(let n=0;n<8;n++){
    const pitch=[2,3,4,6,8,5,10,12][n],tile=document.createElement('canvas');tile.width=tile.height=pitch;const p=tile.getContext('2d')!;
    p.fillStyle='white';p.fillRect(0,0,pitch,pitch);p.fillStyle='black';
    if(n===0){p.fillRect(0,0,1,1);p.fillRect(1,1,1,1);}
    else if(n===1)p.fillRect(1,1,1,1);
    else if(n===2||n===4||n===7){p.beginPath();p.arc(pitch/2,pitch/2,pitch*.32,0,Math.PI*2);p.fill();}
    else if(n===3){for(let y=0;y<pitch;y++)p.fillRect(y,y,2,1);}
    else if(n===5){p.fillRect(0,0,1,pitch);p.fillRect(0,0,pitch,1);}
    else{p.fillRect(2,0,2,pitch);p.fillRect(0,2,pitch,2);}
    const pixels=p.getImageData(0,0,pitch,pitch).data;let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i];
    const x=(n%2)*width/2+width*.01,y=Math.floor(n/2)*height/4+height*.01,w=width*.48,h=height*.23;
    ctx.fillStyle=ctx.createPattern(tile,'repeat')!;ctx.fillRect(x,y,w,h);ctx.lineWidth=Math.max(2,width/600);ctx.strokeStyle='black';ctx.strokeRect(x,y,w,h);
    zones.push({n,x:(x+w*.5)/width,y:(y+h*.55)/height,expected:sum/(pixels.length/4)});
  }
  const url=c.toDataURL('image/png');api.getPageImage=async()=>({ok:true,data:{url,width,height}});
  (window as any).__denseZones=zones;
}
