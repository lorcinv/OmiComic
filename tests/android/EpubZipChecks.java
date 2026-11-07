package io.github.lorcinv.omicomic;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Host JVM checks of the production ZIP parser, with a seekable-file adapter. */
public final class EpubZipChecks {
  private static void check(boolean value,String message)throws IOException{if(!value)throw new IOException(message);}
  private interface Attempt {void run()throws Exception;}
  private static void rejects(Attempt attempt,String label)throws Exception{
    try{attempt.run();}catch(IOException expected){return;}
    throw new IOException("Expected rejection: "+label);
  }
  public static void main(String[] args)throws Exception{
    File root=new File(args[0]);JSONArray checks=new JSONArray();
    for(String name:Arrays.asList("normal.zip","local-zip64.zip","directory-zip64.zip")){
      try(SeekableSource source=new SeekableSource(new File(root,name))){
        ZipArchive document=ZipArchive.openDocument(source);
        check(document!=null&&document.entries.containsKey("chapter.xhtml"),"Document chapter not indexed");
        check(new String(document.read(source,"chapter.xhtml",4096),StandardCharsets.UTF_8).contains("EPUB chapter"),"Chapter bytes changed");
        check(Arrays.equals(document.read(source,"image.png",4096),new byte[]{1,2,3,4}),"Image bytes changed");
        check(!document.entries.containsKey("folder/"),"Directory retained as file");
        ZipArchive comic=ZipArchive.open(source);
        check(comic!=null&&comic.entries.size()==1&&comic.entries.containsKey("image.png"),"Comic image index changed");
        rejects(()->document.read(source,"chapter.xhtml",3),"size limit");
        rejects(()->document.read(source,"missing.xhtml",4096),"missing entry");
        checks.put(name);
      }
    }
    for(String name:Arrays.asList("bad-crc.zip","bad-payload.zip")){
      try(SeekableSource source=new SeekableSource(new File(root,name))){
        ZipArchive document=ZipArchive.openDocument(source);check(document!=null,"Missing corrupt fixture index");
        rejects(()->document.read(source,"chapter.xhtml",4096),name);checks.put(name);
      }
    }
    for(String name:Arrays.asList("encrypted.zip","bad-directory.zip","bad-offset.zip","duplicate.zip")){
      try(SeekableSource source=new SeekableSource(new File(root,name))){
        rejects(()->ZipArchive.openDocument(source),name);checks.put(name);
      }
    }
    for(String name:Arrays.asList("unsupported.zip","not-zip.bin")){
      try(SeekableSource source=new SeekableSource(new File(root,name))){
        check(ZipArchive.openDocument(source)==null,"Compatibility fallback not selected: "+name);checks.put(name);
      }
    }
    JSONObject access=new JSONObject();
    try(SeekableSource source=new SeekableSource(new File(args[1]))){
      ZipArchive document=ZipArchive.openDocument(source);check(document!=null,"Deep EPUB missing index");
      long indexReads=source.readCalls,indexBytes=source.readBytes;
      for(int i=0;i<100;i++)check(document.read(source,"OEBPS/chapter-1199.xhtml",8*1024*1024).length>0,"Late chapter missing");
      check(source.readCalls-indexReads==100,"Chapter reads scanned directory again");
      access.put("directoryReadCalls",indexReads).put("directoryReadBytes",indexBytes).put("chapterReads",100).put("chapterHeaderReadCalls",source.readCalls-indexReads).put("chapterHeaderReadBytes",source.readBytes-indexBytes);
      source.close();rejects(()->document.read(source,"OEBPS/chapter-1199.xhtml",8*1024*1024),"closed source");
      checks.put("deep EPUB reuse / close");
    }
    System.out.println(new JSONObject().put("ok",true).put("checks",checks).put("access",access).put("runtime","Host JVM, production ZipArchive/NativeArchives, host seekable-file adapter; no Android/JNI timing"));
  }
}
