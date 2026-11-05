import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import '../src/android/pressFeedback';

function pointer(target:Element,type:string,id:number,primary=true,x=20){
  const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:20});
  Object.defineProperties(event,{pointerId:{value:id},isPrimary:{value:primary}});target.dispatchEvent(event);
}
beforeEach(()=>{vi.useFakeTimers();document.documentElement.dataset.platform='android';document.body.innerHTML='<article class="mobile-resource-card"><strong>Book</strong></article>';});
afterEach(()=>{window.dispatchEvent(new Event('blur'));vi.useRealTimers();delete document.documentElement.dataset.platform;});

it('another finger cannot cancel or release the primary card press',()=>{
  const card=document.querySelector('article')!;pointer(card,'pointerdown',1);
  pointer(card,'pointerdown',2,false);pointer(card,'pointermove',2,false,200);pointer(card,'pointerup',2,false);
  vi.advanceTimersByTime(250);expect(card.getAttribute('data-omi-pressed')).toBe('true');
  pointer(card,'pointerup',1);vi.advanceTimersByTime(100);expect(card.getAttribute('data-omi-pressed')).toBe('true');
  vi.advanceTimersByTime(300);expect(card.hasAttribute('data-omi-pressed')).toBe(false);
});
it('scrolling cancels a card press without leaving a stuck highlight',()=>{
  const card=document.querySelector('article')!;pointer(card,'pointerdown',1);pointer(card,'pointermove',1,true,80);
  expect(card.hasAttribute('data-omi-pressed')).toBe(false);pointer(card,'pointerup',1);vi.advanceTimersByTime(400);expect(card.hasAttribute('data-omi-pressed')).toBe(false);
});
