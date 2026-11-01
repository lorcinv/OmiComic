import {expect,it,vi} from 'vitest';
it('only a typed native reader cancellation becomes AbortError across the port',async()=>{
  vi.resetModules();vi.stubGlobal('MutationObserver',class{observe(){} disconnect(){}});
  const {connectAndroid}=await import('../src/android/bridge');const sent:any[]=[];
  const port={onmessage:null as null|((event:any)=>void),start(){},postMessage(data:string){sent.push(JSON.parse(data));}};
  const connecting=connectAndroid();window.dispatchEvent(new MessageEvent('message',{data:'omi-native',ports:[port as unknown as MessagePort]}));const call=await connecting;
  const cancelled=call('readerPrepare');const first=sent.at(-1);port.onmessage!({data:JSON.stringify({id:first.id,error:'old window',errorCode:'READER_CANCELLED'})});
  await expect(cancelled).rejects.toMatchObject({name:'AbortError'});
  const broken=call('readerPrepare');const second=sent.at(-1);port.onmessage!({data:JSON.stringify({id:second.id,error:'corrupt PNG'})});
  await expect(broken).rejects.toMatchObject({name:'Error',message:'corrupt PNG'});vi.unstubAllGlobals();
});
