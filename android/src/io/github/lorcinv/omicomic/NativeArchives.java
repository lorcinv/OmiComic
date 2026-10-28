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
  private static final long MAX_NESTED=256L*1024*1024;
  private static final String NESTED_PREFIX="__omi_nested_v1__/";
  /** Bound retained metadata too: entry count and decoded image bytes alone do not bound names. */
  static final class MetadataBudget {
    private int bytes;
    void add(String name)throws IOException {
      if(name==null)return;
      if(name.length()>4096)throw new IOException("压缩包文件路径过长。");
      int size=name.getBytes(StandardCharsets.UTF_8).length;
      if(size>8*1024*1024-bytes)throw new IOException("压缩包文件目录超过安全读取上限。");
      bytes+=size;
    }
  }
  private static final class PageEntry {
    final int ordinal; final Long modifiedAt;
    final String nestedArchive,childName;
    PageEntry(int ordinal,Long modifiedAt){this(ordinal,modifiedAt,null,null);}
    PageEntry(int ordinal,Long modifiedAt,String nestedArchive,String childName){this.ordinal=ordinal;this.modifiedAt=modifiedAt;this.nestedArchive=nestedArchive;this.childName=childName;}
  }
  private final Map<String,LinkedHashMap<String,PageEntry>> indexes=new LinkedHashMap<>(4,.75f,true);
  private final Map<String,Integer> indexNameBytes=new HashMap<>();
  private final Map<String,byte[]> pages=new LinkedHashMap<>(8,.75f,true);
  private final Map<String,ZipArchive> zipIndexes=new HashMap<>();
  private int cachedBytes;
  private String currentKey;
  private final DiskCache disk;
  private final DiskCache pageDisk;
  private final boolean retainPages;
  private final File nestedDirectory;
  private final Map<String,File> nestedFiles=new LinkedHashMap<>(8,.75f,true);
  private final java.util.concurrent.atomic.AtomicBoolean caching=new java.util.concurrent.atomic.AtomicBoolean(true);
  private final java.util.concurrent.atomic.AtomicLong cacheEpoch=new java.util.concurrent.atomic.AtomicLong();
  void setCaching(boolean enabled){if(caching.getAndSet(enabled)!=enabled)cacheEpoch.incrementAndGet();}
  private long indexBuilds,pageDecodes,pageDiskHits,zipRandomReads;

  NativeArchives(DiskCache cache,DiskCache pageDisk,boolean retainPages,File nestedDirectory){
    disk=cache;this.pageDisk=pageDisk;this.retainPages=retainPages;this.nestedDirectory=nestedDirectory;
    File[] stale=nestedDirectory.listFiles();if(stale!=null)for(File file:stale)if(file.isFile()&&file.getName().startsWith("nested-"))file.delete();
  }
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
  static boolean image(String name) {
    if(name==null||name.startsWith("__MACOSX/")||name.indexOf('\0')>=0)return false;
    String path=name.replace('\\','/');
    if(path.startsWith("/")||path.matches("^[A-Za-z]:.*"))return false;
    for(String part:path.split("/"))if(part.equals(".."))return false;
    int dot=name.lastIndexOf('.');
    return dot>=0&&Arrays.asList("jpg","jpeg","png","webp","gif","bmp").contains(name.substring(dot+1).toLowerCase(Locale.ROOT));
  }
  static boolean archive(String name){
    if(name==null||name.startsWith("__MACOSX/")||name.indexOf('\0')>=0)return false;
    String path=name.replace('\\','/');if(path.startsWith("/")||path.matches("^[A-Za-z]:.*"))return false;
    for(String part:path.split("/"))if(part.equals(".."))return false;
    int dot=name.lastIndexOf('.');return dot>=0&&Arrays.asList("zip","cbz","rar","cbr","7z","cb7").contains(name.substring(dot+1).toLowerCase(Locale.ROOT));
  }
  private static String encoded(String name){try{return java.net.URLEncoder.encode(name,"UTF-8").replace("+","%20").replace("%21","!").replace("%27","'").replace("%28","(").replace("%29",")").replace("%7E","~");}catch(UnsupportedEncodingException impossible){throw new AssertionError(impossible);}}
  private static String nestedName(String outer,String child){return NESTED_PREFIX+encoded(outer)+"/"+(child.startsWith(NESTED_PREFIX)?child.substring(NESTED_PREFIX.length()):encoded(child));}
  static String displayName(String name){
    if(!name.startsWith(NESTED_PREFIX))return name;
    try{String[] parts=name.substring(NESTED_PREFIX.length()).split("/");for(int i=0;i<parts.length;i++)parts[i]=java.net.URLDecoder.decode(parts[i].replace("+","%2B"),"UTF-8");return String.join(" / ",parts);}catch(Exception invalid){return name;}
  }
  private String childKey(String key,String name){return key+"\n@nested:"+name;}
  private synchronized File stage(SeekableSource source,String key,String name)throws IOException{
    String id=childKey(key,name);File cached=nestedFiles.get(id);if(cached!=null&&cached.isFile())return cached;
    if(!nestedDirectory.isDirectory()&&!nestedDirectory.mkdirs())throw new IOException("无法创建内层压缩包缓存。");
    String suffix=name.substring(name.lastIndexOf('.'));File file=File.createTempFile("nested-",suffix,nestedDirectory);
    try(OutputStream output=new BufferedOutputStream(new FileOutputStream(file))){
      ZipArchive zip=zipIndexes.get(key);
      if(zip!=null)zip.copyTo(source,name,output,MAX_NESTED);
      else try(Handle handle=open(source)){
        long entry;int count=0;boolean found=false;
        while((entry=Archive.readNextHeader(handle.archive))!=0){
          if(++count>MAX_ENTRIES)throw new IOException("压缩包条目过多。");
          if(!name.equals(name(entry)))continue;checkEncryption(entry);long size=ArchiveEntry.size(entry);
          if(size<0||size>MAX_NESTED)throw new IOException("内层压缩包超过 256 MB，请先解压后打开。");
          ByteBuffer buffer=ByteBuffer.allocateDirect(65536);byte[] bytes=new byte[65536];long done=0;
          while(true){buffer.clear();Archive.readData(handle.archive,buffer);int n=buffer.position();if(n==0)break;if(n>size-done)throw new IOException("内层压缩包展开长度不符。");buffer.flip();buffer.get(bytes,0,n);output.write(bytes,0,n);done+=n;}
          if(done!=size)throw new IOException("内层压缩包内容不完整。");found=true;break;
        }
        if(!found)throw new FileNotFoundException("内层压缩包已不存在。");
      }
    }catch(IOException|RuntimeException error){file.delete();throw error;}
    nestedFiles.put(id,file);long bytes=0;for(File item:nestedFiles.values())bytes+=item.length();
    Iterator<Map.Entry<String,File>> it=nestedFiles.entrySet().iterator();
    while(nestedFiles.size()>1&&(bytes>512L*1024*1024||nestedFiles.size()>12)){Map.Entry<String,File> oldest=it.next();long size=oldest.getValue().length();if(oldest.getValue().delete())bytes-=size;it.remove();}
    return file;
  }
  private static void checkEncryption(long entry)throws IOException {
    if(ArchiveEntry.isEncrypted(entry))throw new IOException("此压缩包已加密，暂不支持密码漫画。");
  }
  synchronized List<String> images(SeekableSource source,String key)throws IOException {
    return images(source,key,0);
  }
  private synchronized List<String> images(SeekableSource source,String key,int depth)throws IOException {
    try {
    LinkedHashMap<String,PageEntry> index=indexes.get(key);
    if(index==null){
      ZipArchive zip=ZipArchive.restore(disk.get("zip3\n"+key),source.size());
      if(zip==null){zip=ZipArchive.open(source);if(zip!=null){indexBuilds++;disk.put("zip3\n"+key,zip.serialize());}}
      if(zip!=null){
        zipIndexes.put(key,zip);index=new LinkedHashMap<>();int ordinal=0;
        for(ZipArchive.Entry entry:zip.entries.values())index.put(entry.name,new PageEntry(ordinal++,entry.modified));
      }
    }
    if(index==null)index=loadIndex(key);
    if(index==null) {
      // Limit native decoder memory to one archive (solid RAR/7z can have large dictionaries).
      closeReader();
      indexBuilds++;
      index=new LinkedHashMap<>();
      Handle handle=open(source);long total=0;MetadataBudget names=new MetadataBudget();
      try {
        long entry;int ordinal=0;
        while((entry=Archive.readNextHeader(handle.archive))!=0) {
          if(ordinal>=MAX_ENTRIES)throw new IOException("压缩包条目过多。");
          checkEncryption(entry);
          long size=ArchiveEntry.size(entry);
          if(size<0||size>MAX_TOTAL-total)throw new IOException("压缩包展开内容超过手机端读取上限。");
          total+=size;
          String name=name(entry);
          names.add(name);
          if(ArchiveEntry.filetype(entry)==ArchiveEntry.AE_IFREG&&((image(name)&&size<=MAX_IMAGE)||archive(name))) {
            Long modifiedAt=null;
            if(ArchiveEntry.mtimeIsSet(entry)) {
              try { modifiedAt=Math.addExact(Math.multiplyExact(ArchiveEntry.mtime(entry),1000),ArchiveEntry.mtimeNsec(entry)/1000000); }
              catch(ArithmeticException invalidTime) { /* Invalid timestamps remain absent. */ }
            }
            if(index.put(name,new PageEntry(ordinal,modifiedAt))!=null)throw new IOException("压缩包中存在重复的图片路径。");
          }
          ordinal++;
        }
      } catch(IOException error) { throw friendly(error); }
      finally { handle.close(); }
      saveIndex(key,index);
    }
    // Raw indexes retain containers; public page indexes flatten their images.
    if(!indexes.containsKey(key)){
      LinkedHashMap<String,PageEntry> flattened=new LinkedHashMap<>();MetadataBudget names=new MetadataBudget();
      for(Map.Entry<String,PageEntry> row:index.entrySet()){
        if(image(row.getKey())){names.add(row.getKey());flattened.put(row.getKey(),row.getValue());continue;}
        if(!archive(row.getKey()))continue;
        if(depth>=3)throw new IOException("压缩包嵌套超过 3 层，请解压一层后打开。");
        File child=stage(source,key,row.getKey());String nestedKey=childKey(key,row.getKey());
        try(SeekableSource nested=new SeekableSource(child)){
          for(String page:images(nested,nestedKey,depth+1)){
            if(flattened.size()>=MAX_ENTRIES)throw new IOException("压缩包条目过多。");
            String virtual=nestedName(row.getKey(),page);names.add(virtual);
            if(flattened.put(virtual,new PageEntry(-1,modifiedAt(nestedKey,page),row.getKey(),page))!=null)throw new IOException("内层压缩包图片路径重复。");
          }
        }
      }
      index=flattened;
    }
    indexes.put(key,index);
    if(!indexNameBytes.containsKey(key)){int size=0;for(String name:index.keySet())size+=name.getBytes(StandardCharsets.UTF_8).length;indexNameBytes.put(key,size);}
    int entries=0;for(Map<String,PageEntry> value:indexes.values())entries+=value.size();
    int names=0;for(int size:indexNameBytes.values())names+=size;
    while(indexes.size()>1&&(indexes.size()>32||entries>60000||names>16*1024*1024)){String oldest=indexes.keySet().iterator().next();entries-=indexes.remove(oldest).size();names-=indexNameBytes.remove(oldest);zipIndexes.remove(oldest);}
    List<String> result=new ArrayList<>(index.keySet());result.sort(LocalLibrary::natural);return result;
    }catch(IOException|RuntimeException error){indexes.remove(key);indexNameBytes.remove(key);zipIndexes.remove(key);throw error;}
  }
  synchronized Long modifiedAt(String key,String name) {
    Map<String,PageEntry> index=indexes.get(key);
    PageEntry entry=index==null?null:index.get(name);
    return entry==null?null:entry.modifiedAt;
  }
  byte[] read(SeekableSource source,String identity,String name)throws IOException {
    long epoch=cacheEpoch.get();
    String key=identity+"\n"+name;
    synchronized(this){byte[] cached=pages.get(key);if(cached!=null)return cached;}
    byte[] cached=pageDisk.get(key);if(cached!=null){synchronized(this){pageDiskHits++;rememberPage(key,cached,epoch);}return cached;}
    ZipArchive zip;PageEntry metadata;
    synchronized(this){
      if(!indexes.containsKey(identity))images(source,identity);
      metadata=indexes.get(identity).get(name);zip=zipIndexes.get(identity);
      if(metadata==null)throw new IOException("压缩包图片已不存在或超出读取上限。");
    }
    if(metadata.nestedArchive!=null){
      File child=stage(source,identity,metadata.nestedArchive);
      try(SeekableSource nested=new SeekableSource(child)){return read(nested,childKey(identity,metadata.nestedArchive),metadata.childName);}
    }
    if(zip!=null){
      // pread has an independent cursor. A background ZIP page must not hold
      // the stateful RAR/7z decoder lock while the user requests another page.
      byte[] data=zip.read(source,name,MAX_IMAGE);synchronized(this){pageDecodes++;zipRandomReads++;rememberPage(key,data,epoch);}
      if(retainPages&&caching.get()&&epoch==cacheEpoch.get())pageDisk.put(key,data);return data;
    }
    int ordinal=metadata.ordinal;
    synchronized(this){
    cached=pages.get(key);if(cached!=null)return cached;
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
        pageDecodes++;
        rememberPage(key,data,epoch);
        if(retainPages&&caching.get()&&epoch==cacheEpoch.get())pageDisk.put(key,data);
        return data;
    } catch(IOException error) { closeReader();throw friendly(error); }
    }
  }
  private void rememberPage(String key,byte[] data,long epoch) {
    if(!caching.get()||epoch!=cacheEpoch.get())return;
    if(data.length>CACHE_BYTES/2)return;
    byte[] old=pages.put(key,data);cachedBytes+=data.length-(old==null?0:old.length);
    while(cachedBytes>CACHE_BYTES||pages.size()>12){String first=pages.keySet().iterator().next();cachedBytes-=pages.remove(first).length;}
  }
  private LinkedHashMap<String,PageEntry> loadIndex(String key) {
    byte[] cached=disk.get("raw3\n"+key);if(cached==null)return null;
    try {
      JSONArray rows=new JSONArray(new String(cached,StandardCharsets.UTF_8));
      if(rows.length()>MAX_ENTRIES)return null;
      LinkedHashMap<String,PageEntry> result=new LinkedHashMap<>();
      MetadataBudget names=new MetadataBudget();
      for(int i=0;i<rows.length();i++){
        JSONArray row=rows.getJSONArray(i);String name=row.getString(0);int ordinal=row.getInt(1);
        // Older indexes omit timestamps; rebuild them once after upgrading.
        if(row.length()!=3)return null;
        Long modifiedAt=row.isNull(2)?null:row.getLong(2);
        names.add(name);
        if((!image(name)&&!archive(name))||ordinal<0||ordinal>=MAX_ENTRIES||result.put(name,new PageEntry(ordinal,modifiedAt))!=null)return null;
      }
      return result;
    }catch(Exception invalid){return null;}
  }
  private void saveIndex(String key,Map<String,PageEntry> index) {
    JSONArray rows=new JSONArray();for(Map.Entry<String,PageEntry> entry:index.entrySet())rows.put(new JSONArray().put(entry.getKey()).put(entry.getValue().ordinal).put(entry.getValue().modifiedAt==null?JSONObject.NULL:entry.getValue().modifiedAt));
    disk.put("raw3\n"+key,rows.toString().getBytes(StandardCharsets.UTF_8));
  }
  /** Covers do not build a whole-book index or disturb the active reader. */
  byte[] cover(SeekableSource source,String key)throws IOException {
    return cover(source,key,0);
  }
  private byte[] cover(SeekableSource source,String key,int depth)throws IOException {
    ZipArchive zip=ZipArchive.open(source);
    List<String> nested=new ArrayList<>();
    if(zip!=null){
      List<String> names=new ArrayList<>();for(String name:zip.entries.keySet()){if(image(name))names.add(name);else if(archive(name))nested.add(name);}
      names.sort(LocalLibrary::natural);if(!names.isEmpty())return zip.read(source,names.get(0),MAX_IMAGE);
      synchronized(this){zipIndexes.put(key,zip);while(zipIndexes.size()>6){String oldest=zipIndexes.keySet().iterator().next();if(oldest.equals(key))break;zipIndexes.remove(oldest);}}
      return nestedCover(source,key,nested,depth);
    }
    Handle handle=open(source);
    try {
      long entry,skipped=0;int count=0;
      while((entry=Archive.readNextHeader(handle.archive))!=0){
        if(++count>MAX_ENTRIES)throw new IOException("压缩包条目过多。");
        checkEncryption(entry);
        if(archive(name(entry)))nested.add(name(entry));
        long size=ArchiveEntry.size(entry);
        if(size<0||size>MAX_NESTED-skipped)throw new IOException("此压缩包需要先打开漫画才能生成封面。");
        if(ArchiveEntry.filetype(entry)==ArchiveEntry.AE_IFREG&&image(name(entry)))return readEntry(handle.archive,entry);
        skipped+=size;
      }
    }catch(IOException error){throw friendly(error);}finally{handle.close();}
    return nestedCover(source,key,nested,depth);
  }
  private byte[] nestedCover(SeekableSource source,String key,List<String> names,int depth)throws IOException{
    if(depth>=3)throw new IOException("压缩包嵌套超过 3 层，请解压一层后打开。");
    names.sort(LocalLibrary::natural);int attempts=0;IOException last=null;
    for(String name:names){
      if(++attempts>4)break;
      try{File file=stage(source,key,name);try(SeekableSource child=new SeekableSource(file)){return cover(child,childKey(key,name),depth+1);}}
      catch(IOException failed){last=failed;}
    }
    if(last!=null)throw last;throw new IOException("压缩包没有可阅读图片。");
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
    indexNameBytes.keySet().retainAll(indexes.keySet());
    zipIndexes.keySet().retainAll(indexes.keySet());
    Iterator<Map.Entry<String,byte[]>> it=pages.entrySet().iterator();
    while(it.hasNext()){Map.Entry<String,byte[]> entry=it.next();if(matches(entry.getKey(),path)){cachedBytes-=entry.getValue().length;it.remove();}}
  }
  private boolean matches(String key,String path){return key.startsWith(path+"\n")||key.startsWith(path+"/");}
  synchronized void release(){closeReader();pages.clear();cachedBytes=0;for(File file:nestedFiles.values())file.delete();nestedFiles.clear();}
  private void closeReader() {
    if(reader!=null){try{reader.close();}catch(IOException ignored){}reader=null;}
    currentKey=null;nextOrdinal=0;
  }
  @Override public synchronized void close(){closeReader();indexes.clear();indexNameBytes.clear();zipIndexes.clear();pages.clear();cachedBytes=0;for(File file:nestedFiles.values())file.delete();nestedFiles.clear();}
}
