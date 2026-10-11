package io.github.lorcinv.omicomic;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import me.zhanghai.android.libarchive.Archive;
import me.zhanghai.android.libarchive.ArchiveEntry;
import me.zhanghai.android.libarchive.ArchiveException;

/** RAR4/RAR5/7z reader. Only requested pages are decoded; nothing is extracted to shared storage. */
final class NativeArchives implements Closeable {
  private static final long MAX_IMAGE=64L*1024*1024, MAX_TOTAL=8L*1024*1024*1024;
  private static final int MAX_ENTRIES=30000, CACHE_BYTES=24*1024*1024;
  private final Map<File,LinkedHashMap<String,Integer>> indexes=new LinkedHashMap<>(4,.75f,true);
  private final Map<String,byte[]> pages=new LinkedHashMap<>(8,.75f,true);
  private int cachedBytes;
  private File currentFile;
  private long reader;
  private int nextOrdinal;

  private static long open(File file)throws IOException {
    long handle=Archive.readNew();
    try {
      Archive.setCharset(handle,"UTF-8".getBytes(StandardCharsets.UTF_8));
      Archive.readSupportFilterNone(handle);
      Archive.readSupportFormatRar(handle);
      Archive.readSupportFormatRar5(handle);
      Archive.readSupportFormat7zip(handle);
      Archive.readOpenFileName(handle,file.getAbsolutePath().getBytes(StandardCharsets.UTF_8),65536);
      return handle;
    } catch(IOException error) { Archive.free(handle);throw friendly(error); }
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
  synchronized List<String> images(File file)throws IOException {
    LinkedHashMap<String,Integer> index=indexes.get(file);
    if(index==null) {
      // Limit native decoder memory to one archive (solid RAR/7z can have large dictionaries).
      closeReader();
      index=new LinkedHashMap<>();
      long handle=open(file),total=0;
      try {
        long entry;int ordinal=0;
        while((entry=Archive.readNextHeader(handle))!=0) {
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
      finally { Archive.free(handle); }
      indexes.put(file,index);
      while(indexes.size()>3)indexes.remove(indexes.keySet().iterator().next());
    }
    List<String> result=new ArrayList<>(index.keySet());result.sort(LocalLibrary::natural);return result;
  }
  synchronized byte[] read(File file,String name)throws IOException {
    String key=file.getAbsolutePath()+"\n"+name;
    byte[] cached=pages.get(key);if(cached!=null)return cached;
    images(file);
    Integer ordinal=indexes.get(file).get(name);
    if(ordinal==null)throw new IOException("压缩包图片已不存在或超出读取上限。");
    try {
      if(reader==0||!file.equals(currentFile)||ordinal<nextOrdinal) {
        closeReader();reader=open(file);currentFile=file;nextOrdinal=0;
      }
      long entry=0;
      while(nextOrdinal<=ordinal) {
        entry=Archive.readNextHeader(reader);
        if(entry==0)throw new IOException("压缩包图片已不存在。");
        nextOrdinal++;
      }
      checkEncryption(entry);
      if(!name.equals(name(entry)))throw new IOException("压缩包内容已改变，请重新打开漫画。");
      long expected=ArchiveEntry.size(entry);
      if(expected<0||expected>MAX_IMAGE)throw new IOException("图片数据超过 64 MB 读取上限。");
      byte[] buffer=new byte[65536];ByteBuffer target=ByteBuffer.wrap(buffer);
      try(ByteArrayOutputStream output=new ByteArrayOutputStream((int)expected)) {
        while(true) {
          target.clear();Archive.readData(reader,target);int count=target.position();
          if(count==0)break;
          if(count>MAX_IMAGE-output.size())throw new IOException("图片数据超过 64 MB 读取上限。");
          output.write(buffer,0,count);
        }
        byte[] data=output.toByteArray();
        if(data.length!=expected)throw new IOException("压缩包图片数据不完整。");
        if(data.length<=CACHE_BYTES/2) {
          pages.put(key,data);cachedBytes+=data.length;
          while(cachedBytes>CACHE_BYTES||pages.size()>12){String oldest=pages.keySet().iterator().next();cachedBytes-=pages.remove(oldest).length;}
        }
        return data;
      }
    } catch(IOException error) { closeReader();throw friendly(error); }
  }
  synchronized void forget(File file) {
    if(file.equals(currentFile))closeReader();indexes.remove(file);
    Iterator<Map.Entry<String,byte[]>> it=pages.entrySet().iterator();
    while(it.hasNext()){Map.Entry<String,byte[]> entry=it.next();if(entry.getKey().startsWith(file.getAbsolutePath()+"\n")){cachedBytes-=entry.getValue().length;it.remove();}}
  }
  private void closeReader() {
    if(reader!=0){try{Archive.free(reader);}catch(IOException ignored){}reader=0;}
    currentFile=null;nextOrdinal=0;
  }
  @Override public synchronized void close(){closeReader();indexes.clear();pages.clear();cachedBytes=0;}
}
