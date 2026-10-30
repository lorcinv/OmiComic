/** Positive follows book order. Vertical navigation is independent of RTL. */
export function readerTapDirection(x:number,y:number,vertical:boolean,rtl:boolean,touch:boolean,horizontalEdge=.25):1|-1|0 {
  const horizontal=x<horizontalEdge?(rtl?1:-1):x>1-horizontalEdge?(rtl?-1:1):0;
  const upDown=y<.25?-1:y>.75?1:0;
  return (vertical?upDown||touch&&horizontal:horizontal||touch&&upDown)||0;
}
