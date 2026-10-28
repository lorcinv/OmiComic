"""Audit production Android ZIP/nesting code on a host JVM, with host file/cache adapters.
Android SAF and JNI RAR/7z still require a device; this test does not claim to cover them.
Requires org.json 20240303 at .cache/android-zip-host/json-20240303.jar.
"""
import os
from pathlib import Path
import subprocess

root = Path('.cache/android-zip-host').resolve()
root.mkdir(parents=True, exist_ok=True)
(root / 'classes').mkdir(exist_ok=True)
java_home = Path('.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1').resolve()
source = Path('android/src/io/github/lorcinv/omicomic').resolve()
java = {
    'SeekableSource.java': r'''package io.github.lorcinv.omicomic;
import java.io.*;import android.os.ParcelFileDescriptor;
final class SeekableSource implements Closeable {
 final File file;final RandomAccessFile input;
 SeekableSource(File file)throws IOException{this.file=file;input=new RandomAccessFile(file,"r");}
 long size(){try{return input.length();}catch(IOException e){throw new RuntimeException(e);}}
 synchronized byte[] readAt(long offset,int count)throws IOException{byte[] bytes=new byte[count];input.seek(offset);input.readFully(bytes);return bytes;}
 InputStream stream(long offset,long length)throws IOException{RandomAccessFile reader=new RandomAccessFile(file,"r");reader.seek(offset);return new InputStream(){long remaining=length;
  public int read()throws IOException{byte[] b=new byte[1];return read(b,0,1)<0?-1:b[0]&255;}
  public int read(byte[] b,int start,int count)throws IOException{if(remaining==0)return -1;int n=reader.read(b,start,(int)Math.min(remaining,count));if(n<0)throw new EOFException();remaining-=n;return n;}
  public void close()throws IOException{reader.close();}};}
 ParcelFileDescriptor duplicate()throws IOException{throw new IOException("JNI format outside ZIP host harness");}
 public void close()throws IOException{input.close();}
}''',
    'DiskCache.java': r'''package io.github.lorcinv.omicomic;
import java.util.*;final class DiskCache{final Map<String,byte[]> values=new HashMap<>();byte[] get(String key){return values.get(key);}void put(String key,byte[] bytes){values.put(key,bytes);}}
''',
    'ZipHostAudit.java': r'''package io.github.lorcinv.omicomic;
import java.io.*;import java.nio.file.*;import java.util.*;import org.json.*;
public final class ZipHostAudit {
 static void check(boolean value,String message)throws IOException{if(!value)throw new IOException(message);}
 public static void main(String[] args)throws Exception{
  File directory=new File(args[0]),scratch=new File(args[1]);scratch.mkdirs();
  DiskCache metadata=new DiskCache(),pages=new DiskCache();int count=0,nested=0,reads=0,covers=0;
  List<File> files=new ArrayList<>();for(File file:Objects.requireNonNull(directory.listFiles()))if(file.getName().toLowerCase(Locale.ROOT).endsWith(".zip"))files.add(file);
  check(!files.isEmpty(),"No ZIP audit input");
  try(NativeArchives reader=new NativeArchives(metadata,pages,true,scratch)){
   for(File file:files){String identity=file.getCanonicalPath()+"\n"+file.length()+"\n"+file.lastModified();
    try(SeekableSource input=new SeekableSource(file)){
     List<String> names=reader.images(input,identity);check(!names.isEmpty(),"Empty archive: "+file.getName());count++;
     if(names.get(0).startsWith("__omi_nested_v1__/"))nested++;
     for(String name:Arrays.asList(names.get(0),names.get(names.size()-1))){byte[] bytes=reader.read(input,identity,name);check(bytes.length>0,"Empty page");check(!NativeArchives.displayName(name).contains("__omi_nested_v1__"),"Virtual name leaked");reads++;}
     check(reader.cover(input,identity).length>0,"Empty cover");covers++;
     reader.release();check(reader.read(input,identity,names.get(0)).length>0,"Read after release failed");reads++;
    }
   }
  }
  check(Objects.requireNonNull(scratch.listFiles()).length==0,"Temporary containers retained after close");
  JSONObject result=new JSONObject().put("archives",count).put("nonempty",count).put("nested",nested).put("pageReads",reads).put("covers",covers).put("cacheRelease",true).put("scratchClean",true).put("runtime","Host JVM; production NativeArchives/ZipArchive; host file and cache adapters");
  Files.write(Paths.get(args[2]),result.toString(2).getBytes("UTF-8"));System.out.println(result);
 }
}'''
}
local = (source / 'LocalLibrary.java').read_text(encoding='utf-8')
start = local.index('  static int natural(')
end = local.index('\n  }', start) + 4
java['LocalLibrary.java'] = 'package io.github.lorcinv.omicomic; final class LocalLibrary {\n' + local[start:end] + '\n}'
for name, text in java.items():
    (root / name).write_text(text, encoding='utf-8')
cp = os.pathsep.join(str(p.resolve()) for p in [
    root / 'json-20240303.jar', Path('.cache/android-tools/android-35/android.jar'),
    Path('android/build/native/classes.jar')])
subprocess.run([str(java_home / 'bin/javac.exe'), '--release', '8', '-encoding', 'UTF-8', '-cp', cp,
                '-d', str(root / 'classes'), *[str(root / name) for name in java],
                str(source / 'NativeArchives.java'), str(source / 'ZipArchive.java')], check=True)
subprocess.run([str(java_home / 'bin/java.exe'), '-Dfile.encoding=UTF-8', '-cp',
                str(root / 'classes') + os.pathsep + cp, 'io.github.lorcinv.omicomic.ZipHostAudit',
                os.environ['OMICOMIC_ARCHIVE_AUDIT_ROOT'], str(root / 'nested-cache'),
                str(Path('test-results/android-zip-host-audit.json').resolve())], check=True)
