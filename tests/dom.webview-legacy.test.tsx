import React from 'react';
import {render,act} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import useMobileLayout from '../src/hooks/useMobileLayout';

afterEach(()=>vi.unstubAllGlobals());
test('legacy MediaQueryList listens and cleans up without addEventListener',()=>{
  const query={matches:false,addListener:vi.fn(),removeListener:vi.fn()};
  vi.stubGlobal('matchMedia',()=>query);
  function Harness(){return <span>{String(useMobileLayout())}</span>;}
  const view=render(<Harness/>);expect(view.container.textContent).toBe('false');
  const listener=query.addListener.mock.calls[0][0];query.matches=true;act(()=>listener());
  expect(view.container.textContent).toBe('true');view.unmount();expect(query.removeListener).toHaveBeenCalledWith(listener);
});
test('UUID fallback uses cryptographic randomness, version 4 and RFC variant bits',async()=>{
  vi.resetModules();const random=vi.fn((bytes:Uint8Array)=>{bytes.fill(255);return bytes;});
  vi.stubGlobal('crypto',{getRandomValues:random});await import('../src/android/webviewCrypto');
  expect(crypto.randomUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');expect(random).toHaveBeenCalledOnce();
});
test('UUID shim preserves the engine implementation',async()=>{
  vi.resetModules();const uuid=vi.fn();vi.stubGlobal('crypto',{randomUUID:uuid,getRandomValues:vi.fn()});
  await import('../src/android/webviewCrypto');expect(crypto.randomUUID).toBe(uuid);
});
test('capability preflight handles an engine without AbortSignal',async()=>{
  vi.resetModules();const scope=globalThis;vi.stubGlobal('AbortSignal',undefined);
  delete (scope as any).__omiNeedsCompatiblePdf;
  try {const {needsCompatiblePdf}=await import('../src/android/webviewCapabilities');expect(needsCompatiblePdf).toBe(true);}
  finally {delete (scope as any).__omiNeedsCompatiblePdf;}
});
