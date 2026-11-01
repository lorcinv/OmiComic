const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('Android queue prioritizes the latest page and bounds encoded reads without occupying its foreground lane',async t=>{
  const cached=path.resolve('.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1'),home=process.env.JAVA_HOME||cached;
  try{await fs.access(path.join(home,'bin/javac.exe'));}catch{t.skip('Build JDK not installed');return;}
  const target=await fs.mkdtemp(path.join(os.tmpdir(),'omi-reader-queue-'));
  try{
    const sources=['ReaderWorkQueue','ReaderDecodeGate','ReaderCancelledException'].map(name=>path.resolve('android/src/io/github/lorcinv/omicomic/'+name+'.java'));
    execFileSync(path.join(home,'bin/javac.exe'),['--release','8','-encoding','UTF-8','-d',target,...sources,path.resolve('tests/android/ReaderQueueChecks.java')],{windowsHide:true});
    const result=execFileSync(path.join(home,'bin/java.exe'),['-cp',target,'io.github.lorcinv.omicomic.ReaderQueueChecks'],{encoding:'utf8',windowsHide:true,timeout:15000});
    assert.match(result,/reserved decode lane passed/);
  }finally{assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('omi-reader-queue-'));await fs.rm(target,{recursive:true,force:true});}
});
