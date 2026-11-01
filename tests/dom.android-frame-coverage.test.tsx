import {useRef} from 'react';
import {render} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
const notify=vi.hoisted(()=>vi.fn());
vi.mock('../src/android/bridge',()=>({hasAndroidRenderer:()=>true,androidNotify:notify}));
import useNativeReaderSurface from '../src/android/useNativeReaderSurface';
import {DEFAULT_ADJUSTMENTS} from '../electron/shared/readerPreferences';
function Scene({error=false,scrubbing=false}:{error?:boolean;scrubbing?:boolean}){
  const stage=useRef<HTMLDivElement>(null);useNativeReaderSurface(stage,error?2:1,true,true,{readerMemoryCacheSizeMb:100,readerImageLoadConcurrency:4},DEFAULT_ADJUSTMENTS);
  return <div className="reader-layout"><div className="reader-stage is-panorama" data-reader-scrubbing={scrubbing || undefined} ref={stage}><div className="reader-page-spread">
    <figure className="reader-page-frame" data-native-work-key="first">{error?<div className="reader-page-error"/>:<span data-native-image="clear"/>}</figure>
    {!error&&<><figure className="reader-page-frame waiting" data-native-work-key="second"><div className="reader-page-loading"/></figure><figure className="reader-page-frame gif"><img/></figure></>}
  </div></div></div>;
}
it('sends visible unloaded geometry separately from ready pixels, and lets error/GIF content remain in WebView',()=>{
  notify.mockClear();vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
  vi.spyOn(window,'getComputedStyle').mockImplementation(()=>({visibility:'visible',opacity:'1',getPropertyValue:()=> '#eee'}) as unknown as CSSStyleDeclaration);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return new DOMRect(this.classList.contains('waiting')?300:this.classList.contains('gif')?600:0,0,this.classList.contains('reader-stage')?900:300,800);});
  const view=render(<Scene/>),frame=()=>notify.mock.calls.filter(c=>c[0]==='readerFrame').at(-1)![1];
  expect(frame().slots).toHaveLength(1);expect(frame().expected).toHaveLength(2);expect(frame().nativeExpected).toBe(true);expect(frame().visible).toEqual(['first','second']);
  expect(frame().scrubbing).toBe(false);
  view.rerender(<Scene error scrubbing/>);expect(frame().slots).toHaveLength(0);expect(frame().expected).toHaveLength(0);expect(frame().nativeExpected).toBe(false);expect(frame().scrubbing).toBe(true);
  view.unmount();vi.unstubAllGlobals();
});
