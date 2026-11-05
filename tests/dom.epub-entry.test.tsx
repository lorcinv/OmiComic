import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { 阅读资源结果 } from '../src/types';
import { useReaderDocument } from '../src/reader/useReaderDocument';
import { installMock } from './mock';

const control=vi.hoisted(()=>({sources:[] as any[]}));
vi.mock('../src/reader/documentSource',()=>({DocumentSource:class {
  static acquirePrepared=vi.fn(async()=>undefined);
  startIndexing=vi.fn();releaseReader=vi.fn();dispose=vi.fn();subscribe=vi.fn(()=>()=>{});
  open=vi.fn(async()=>({...this.input,total:1,pages:[{index:0,name:'One',sourcePath:this.input.sourcePath,type:'epub-chapter'}]}));
  constructor(private input:阅读资源结果){control.sources.push(this);}
}}));
const book=(type:'epub'|'pdf'|'mobi'):阅读资源结果=>({key:type+':/book',resourceKey:type+':/book',sourcePath:'/book.'+type,sourceType:type,title:'Book',pages:[],total:0});
beforeEach(()=>{control.sources=[];installMock({count:1});document.documentElement.dataset.platform='android';});
afterEach(()=>{delete document.documentElement.dataset.platform;vi.restoreAllMocks();});

it('settles the EPUB viewport before opening and leaves background chapters until entry finishes',async()=>{
  let prepared!:()=>void;
  window.omicomic.prepareEpubReaderViewport=vi.fn(()=>new Promise(resolve=>{prepared=()=>resolve({ok:true,data:true});}));
  const input=book('epub');const hook=renderHook(({pending})=>useReaderDocument(input,0,pending),{initialProps:{pending:true}});
  await waitFor(()=>expect(window.omicomic.prepareEpubReaderViewport).toHaveBeenCalledWith(input.sourcePath));
  expect(control.sources).toHaveLength(0);
  await act(async()=>prepared());await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  const source=control.sources[0];expect(source.startIndexing).not.toHaveBeenCalled();
  hook.rerender({pending:false});await waitFor(()=>expect(source.startIndexing).toHaveBeenCalledOnce());
  expect(source.open).toHaveBeenCalledOnce();expect(control.sources).toHaveLength(1);
  hook.unmount();expect(source.releaseReader).toHaveBeenCalledOnce();
});

it.each(['pdf','mobi'] as const)('%s keeps its existing opening and background indexing without an EPUB handshake',async type=>{
  window.omicomic.prepareEpubReaderViewport=vi.fn(()=>new Promise(()=>{}));
  const input=book(type);const hook=renderHook(()=>useReaderDocument(input,0,true));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  expect(window.omicomic.prepareEpubReaderViewport).not.toHaveBeenCalled();expect(control.sources[0].startIndexing).toHaveBeenCalledOnce();
  hook.unmount();
});

it('desktop EPUB keeps its existing opening path',async()=>{
  delete document.documentElement.dataset.platform;
  window.omicomic.prepareEpubReaderViewport=vi.fn(()=>new Promise(()=>{}));
  const input=book('epub');const hook=renderHook(()=>useReaderDocument(input,0,true));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  expect(window.omicomic.prepareEpubReaderViewport).not.toHaveBeenCalled();expect(control.sources[0].startIndexing).toHaveBeenCalledOnce();hook.unmount();
});

it('cancelling a prepared entry never opens a late EPUB',async()=>{
  let prepared!:()=>void;window.omicomic.prepareEpubReaderViewport=vi.fn(()=>new Promise(resolve=>{prepared=()=>resolve({ok:true,data:true});}));
  const input=book('epub');const hook=renderHook(()=>useReaderDocument(input,0,true));
  await waitFor(()=>expect(window.omicomic.prepareEpubReaderViewport).toHaveBeenCalled());hook.unmount();
  await act(async()=>prepared());expect(control.sources).toHaveLength(0);
});

it('an unavailable optional viewport preparation does not break EPUB reading',async()=>{
  window.omicomic.prepareEpubReaderViewport=vi.fn(async()=>{throw Error('No snapshot');});
  const input=book('epub');const hook=renderHook(()=>useReaderDocument(input,0,false));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));expect(hook.result.current.error).toBeUndefined();hook.unmount();
});
