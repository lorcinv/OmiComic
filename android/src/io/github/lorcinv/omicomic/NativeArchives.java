package io.github.lorcinv.omicomic;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import me.zhanghai.android.libarchive.Archive;
import me.zhanghai.android.libarchive.ArchiveEntry;
import me.zhanghai.android.libarchive.ArchiveException;

/** ZIP/RAR4/RAR5/7z reader. Only requested pages are decoded; nothing is extracted to shared storage. */
final class NativeArchives implements Closeable {
  private static final long MAX_IMAGE=64L*1024*1024, MAX_TOTAL=8L*1024*1024*1024;
  private static final int MAX_ENTRIES=30000, CACHE_BYTES=24*1024*1024;
  private final Map<String,LinkedHashMap<String,Integer>> indexes=new LinkedHashMap<>(4,.75f,true);
  private final Map<String,byte[]> pages=new LinkedHashMap<>(8,.75f,true);
  private int cachedBytes;
  private String currentKey;
  private final DiskCache disk;
  private long indexBuilds;

  NativeArchives(DiskCache cache){disk=cache;}
  private Handle reader;
  private int nextOrdinal;

  private static final class Handle implements Closeable {
    final long archive;final ParcelFileDescriptor descriptor;
    Handle(long archive,ParcelFileDescriptor descriptor){this.archive=archive;this.descriptor=descriptor;}
    @Override public void close()throws IOException{try{Archive.free(archive);}finally{descriptor.close();}}
  }
  private static Handle open(SeekableSource source)throws IOException {
    ParcelFileDescriptor descriptor=source.duplicate();long archive=0;
    try {
      Os.lseek(descriptor.getFileDescriptor(),0,OsConstants.SEEK_SET);
      archive=Archive.readNew();
      Archive.setCharset(archive,"UTF-8".getBytes(StandardCharsets.UTF_8));
      Archive.readSupportFilterNone(archive);
      Archive.readSupportFormatZipSeekable(archive);
      Archive.readSupportFormatRar(archive);
      Archive.readSupportFormatRar5(archive);
      Archive.readSupportFormat7zip(archive);
      Archive.readOpenFd(archive,descriptor.getFd(),65536);
      return new Handle(archive,descriptor);
    }catch(Exception error){
      try{if(archive!=0)Archive.free(archive);}finally{descriptor.close();}
      throw friendly(error instanceof IOException?(IOException)error:new IOException(error));
    }
  }
  private static IOException friendly(IOException error) {
    if(!(error instanceof ArchiveException))return error;
    String message=String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
    if(message.contains("encrypt")||message.contains("passphrase")||message.contains("password"))
      return new IOException("此压缩包已加密，暂不支持密码漫画。",error);
    return new IOException("压缩包读取失败，文件可能损坏或使用了不支持的压缩方式。",error);
  }
  private static String name(long entry) {
    String name=ArchiveEntry.pathnameUtf8(entry);
    if(name==null){byte[] raw=ArchiveEntry.pathname(entry);if(raw!=null)name=new String(raw,StandardCharsets.UTF_8);}
    return name;
  }
  private static boolean image(String name) {
    if(name==null||name.startsWith("__MACOSX/")||name.indexOf('\0')>=0)return false;
    String path=name.replace('\\','/');
    if(path.startsWith("/")||path.matches("^[A-Za-z]:.*"))return false;
    for(String part:path.split("/"))if(part.equals(".."))return false;
    int dot=name.lastIndexOf('.');
    return dot>=0&&Arrays.asList("jpg","jpeg","png","webp","gif","bmp").contains(name.substring(dot+1).toLowerCase(Locale.ROOT));
  }
  private static void checkEncryption(long entry)throws IOException {
    if(ArchiveEntry.isEncrypted(entry))throw new IOException("此压缩包已加密，暂不支持密码漫画。");
  }
  synchronized List<String> images(SeekableSource source,String key)throws IOException {
    LinkedHashMap<String,Integer> index=indexes.get(key);
    if(index==null)index=loadIndex(key);
    if(index==null) {
      // Limit native decoder memory to one archive (solid RAR/7z can have large dictionaries).
      closeReader();
      indexBuilds++;
      index=new LinkedHashMap<>();
      Handle handle=open(source);long total=0;
      try {
        long entry;int ordinal=0;
        while((entry=Archive.readNextHeader(handle.archive))!=0) {
          if(ordinal>=MAX_ENTRIES)throw new IOException("压缩包条目过多。");
          checkEncryption(entry);
          long size=ArchiveEntry.size(entry);
          if(size<0||size>MAX_TOTAL-total)throw new IOException("压缩包展开内容超过手机端读取上限。");
          total+=size;
          String name=name(entry);
          if(ArchiveEntry.filetype(entry)==ArchiveEntry.AE_IFREG&&image(name)&&size<=MAX_IMAGE) {
            if(index.put(name,ordinal)!=null)throw new IOException("压缩包中存在重复的图片路径。");
          }
          ordinal++;
        }
      } catch(IOException error) { throw friendly(error); }
      finally { handle.close(); }
      saveIndex(key,index);
    }
    indexes.put(key,index);
    int entries=0;for(Map<String,Integer> value:indexes.values())entries+=value.size();
    while(indexes.size()>1&&(indexes.size()>32||entries>60000)){String oldest=indexes.keySet().iterator().next();entries-=indexes.remove(oldest).size();}
    List<String> result=new ArrayList<>(index.keySet());result.sort(LocalLibrary::natural);return result;
  }
  synchronized byte[] read(SeekableSource source,String identity,String name)throws IOException {
    String key=identity+"\n"+name;
    byte[] cached=pages.get(key);if(cached!=null)return cached;
    if(!indexes.containsKey(identity))images(source,identity);
    Integer ordinal=indexes.get(identity).get(name);
    if(ordinal==null)throw new IOException("压缩包图片已不存在或超出读取上限。");
    try {
      if(reader==null||!identity.equals(currentKey)||ordinal<nextOrdinal) {
        closeReader();reader=open(source);currentKey=identity;nextOrdinal=0;
      }
      long entry=0;
      while(nextOrdinal<=ordinal) {
        entry=Archive.readNextHeader(reader.archive);
        if(entry==0)throw new IOException("压缩包图片已不存在。");
        nextOrdinal++;
      }
      checkEncryption(entry);
      if(!name.equals(name(entry)))throw new IOException("压缩包内容已改变，请重新打开漫画。");
      byte[] data=readEntry(reader.archive,entry);
        if(data.length<=CACHE_BYTES/2) {
          pages.put(key,data);cachedBytes+=data.length;
          while(cachedBytes>CACHE_BYTES||pages.size()>12){String oldest=pages.keySet().iterator().next();cachedBytes-=pages.remove(oldest).length;}
        }
        return data;
    } catch(IOException error) { closeReader();throw friendly(error); }
  }
  private LinkedHashMap<String,Integer> loadIndex(String key) {
    byte[] cached=disk.get(key);if(cached==null)return null;
    try {
      JSONArray rows=new JSONArray(new String(cached,StandardCharsets.UTF_8));
      if(rows.length()>MAX_ENTRIES)return null;
      LinkedHashMap<String,Integer> result=new LinkedHashMap<>();
      for(int i=0;i<rows.length();i++){
        JSONArray row=rows.getJSONArray(i);String name=row.getString(0);int ordinal=row.getInt(1);
        if(!image(name)||ordinal<0||ordinal>=MAX_ENTRIES||result.put(name,ordinal)!=null)return null;
      }
      return result;
    }catch(Exception invalid){return null;}
  }
  private void saveIndex(String key,Map<String,Integer> index) {
    JSONArray rows=new JSONArray();for(Map.Entry<String,Integer> entry:index.entrySet())rows.put(new JSONArray().put(entry.getKey()).put(entry.getValue()));
    disk.put(key,rows.toString().getBytes(StandardCharsets.UTF_8));
  }
  /** Covers do not build a whole-book index or disturb the active reader. */
  static byte[] cover(SeekableSource source)throws IOException {
    Handle handle=open(source);
    try {
      long entry,skipped=0;int count=0;
      while((entry=Archive.readNextHeader(handle.archive))!=0){
        if(++count>MAX_ENTRIES)throw new IOException("压缩包条目过多。");
        checkEncryption(entry);
        long size=ArchiveEntry.size(entry);
        if(size<0||size>MAX_IMAGE-skipped)throw new IOException("此压缩包需要先打开漫画才能生成封面。");
        if(ArchiveEntry.filetype(entry)==ArchiveEntry.AE_IFREG&&image(name(entry)))return readEntry(handle.archive,entry);
        skipped+=size;
      }
      throw new IOException("压缩包没有可阅读图片。");
    }catch(IOException error){throw friendly(error);}finally{handle.close();}
  }
  static byte[] entry(SeekableSource source,String name,long limit)throws IOException {
    try(Handle handle=open(source)){
      long entry;int count=0;
      while((entry=Archive.readNextHeader(handle.archive))!=0){
        if(++count>MAX_ENTRIES)throw new IOException("压缩包条目过多。");
        if(!name.equals(name(entry)))continue;
        checkEncryption(entry);
        if(ArchiveEntry.size(entry)>limit)throw new IOException("电子书章节或图片过大。");
        return readEntry(handle.archive,entry,limit);
      }
      throw new IOException("电子书章节或图片不存在。");
    }
  }
  private static byte[] readEntry(long handle,long entry)throws IOException {
    return readEntry(handle,entry,MAX_IMAGE);
  }
  private static byte[] readEntry(long handle,long entry,long limit)throws IOException {
    long expected=ArchiveEntry.size(entry);
    if(expected<0||expected>limit)throw new IOException("文件内容超过手机端读取上限。");
    byte[] buffer=new byte[65536];ByteBuffer target=ByteBuffer.allocateDirect(buffer.length);
    try(ByteArrayOutputStream output=new ByteArrayOutputStream((int)expected)){
      while(true){
        target.clear();Archive.readData(handle,target);int count=target.position();if(count==0)break;
        if(count>limit-output.size())throw new IOException("文件内容超过手机端读取上限。");
        target.flip();target.get(buffer,0,count);output.write(buffer,0,count);
      }
      byte[] data=output.toByteArray();
      if(data.length!=expected)throw new IOException("压缩包图片数据不完整。");
      return data;
    }
  }
  synchronized void forget(String path) {
    if(currentKey!=null&&matches(currentKey,path))closeReader();
    indexes.keySet().removeIf(key->matches(key,path));
    Iterator<Map.Entry<String,byte[]>> it=pages.entrySet().iterator();
    while(it.hasNext()){Map.Entry<String,byte[]> entry=it.next();if(matches(entry.getKey(),path)){cachedBytes-=entry.getValue().length;it.remove();}}
  }
  private boolean matches(String key,String path){return key.startsWith(path+"\n")||key.startsWith(path+"/");}
  synchronized void release(){closeReader();pages.clear();cachedBytes=0;}
  private void closeReader() {
    if(reader!=null){try{reader.close();}catch(IOException ignored){}reader=null;}
    currentKey=null;nextOrdinal=0;
  }
  @Override public synchronized void close(){closeReader();indexes.clear();pages.clear();cachedBytes=0;}
}
