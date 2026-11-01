/** Android's native body cache must lead the drag direction. Visible bodies are
 * independently pinned by the native renderer, including a page behind us. */
export function nativeReaderBodyCapacity(limit:number,states:Iterable<{native?:boolean;decodedBytes?:number}>){
  let largest=4*1024*1024;for(const state of states)if(state.native)largest=Math.max(largest,state.decodedBytes||16*1024*1024);
  return Math.max(2,Math.min(46,Math.floor(limit/largest)));
}
export function nativePanoramaWindow(indices:number[],center:number,direction:number,capacity=48,behind=2){
  const sign=direction<0?-1:1;
  const score=(index:number)=>{const distance=(index-center)*sign;return distance>=0?distance:1000-distance;};
  const ordered=[...new Set(indices)].sort((a,b)=>score(a)-score(b)),back=Math.min(16,Math.max(0,behind));
  const keep=[...ordered.filter(index=>(index-center)*sign>=0).slice(0,Math.max(1,Math.min(48-back,capacity))),...ordered.filter(index=>(index-center)*sign<0).slice(0,back)];
  const focus=[center,center+sign,center+sign*2].filter(index=>keep.includes(index));
  return {keep,focus,key:JSON.stringify([keep,focus])};
}
