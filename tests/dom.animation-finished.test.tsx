import {afterEach,expect,test,vi} from 'vitest';
import {animationFinished} from '../src/reader/animationFinished';
afterEach(()=>vi.useRealTimers());
function legacy(state='running') {return Object.assign(new EventTarget(),{playState:state}) as unknown as Animation;}
test('native finished promise is reused',()=>{const animation=legacy();const promise=Promise.resolve(animation);Object.defineProperty(animation,'finished',{value:promise});expect(animationFinished(animation)).toBe(promise);});
test('legacy finish events resolve and release polling',async()=>{vi.useFakeTimers();const animation=legacy();const result=animationFinished(animation);animation.dispatchEvent(new Event('finish'));await expect(result).resolves.toBe(animation);expect(vi.getTimerCount()).toBe(0);});
test('legacy cancellation without a cancel event rejects and releases polling',async()=>{vi.useFakeTimers();const animation=legacy();const result=animationFinished(animation);const check=expect(result).rejects.toMatchObject({name:'AbortError'});Object.assign(animation,{playState:'idle'});await vi.advanceTimersByTimeAsync(32);await check;expect(vi.getTimerCount()).toBe(0);});
test('already finished legacy animation resolves immediately',async()=>{const animation=legacy('finished');await expect(animationFinished(animation)).resolves.toBe(animation);});
