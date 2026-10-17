package io.github.lorcinv.omicomic;

import android.content.*;
import android.database.Cursor;
import android.graphics.*;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.WebResourceResponse;
import org.json.*;
import org.xmlpull.v1.XmlPullParser;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

final class LocalLibrary {
  interface ReaderPreviewSource {byte[] preview(String url)throws Exception;}
  static final class ReaderPreview {
    final byte[] bytes;final boolean oriented;
    ReaderPreview(byte[] bytes,boolean oriented){this.bytes=bytes;this.oriented=oriented;}
  }
  private volatile ReaderPreviewSource readerPreviewSource;
  private final Context context;
  private final ContentResolver resolver;
  private final SharedPreferences grants;
  private final AtomicFile dataFile;
  private final Object dataLock=new Object();
  private final DirectoryIndex directoryIndex;
  private final java.util.concurrent.ExecutorService indexWrites=java.util.concurrent.Executors.newSingleThreadExecutor();
  private final File cache;
  private final Object metadataLock=new Object(), copyLock=new Object(), previewLock=new Object();
  private final Map<String,Entry> entries=new LinkedHashMap<String,Entry>(64,.75f,true);
  private final Map<String,List<Entry>> directories=new LinkedHashMap<String,List<Entry>>(8,.75f,true);
  private final Map<String,Long> directoryTimes=new HashMap<>();
  private final Map<String,Integer> pageCounts=Collections.synchronizedMap(new LinkedHashMap<>());
  private final java.util.concurrent.locks.ReentrantReadWriteLock fileAccess=new java.util.concurrent.locks.ReentrantReadWriteLock(true);
  private final DiskCache thumbnails;
  private final DiskCache readerPages;
  private final DiskCache readerRasters;
  private final java.util.concurrent.ExecutorService readerCleanup=java.util.concurrent.Executors.newSingleThreadExecutor();
  private final java.util.concurrent.Future<?> readerStartupCleanup;
  private final java.util.concurrent.atomic.AtomicLong readerSessionEpoch=new java.util.concurrent.atomic.AtomicLong();
  private final java.util.concurrent.atomic.AtomicBoolean readerSessionActive=new java.util.concurrent.atomic.AtomicBoolean();
  private final DiskCache folderCovers;
  private final Object coverLock=new Object();
  private final Map<String,CoverScan> coverScans=new LinkedHashMap<String,CoverScan>(16,.75f,true);
  private volatile long metadataGeneration;
  private long folderCoverHits,folderCoverSteps;
  private volatile boolean closed;
  private volatile String cacheSession=UUID.randomUUID().toString();
  private volatile long mediaEpoch;
  private long directoryQueries,copiedBytes,directoryIndexHits,uriIndexHits;
  private final Map<String,Doc> documents=new HashMap<>();
  private final Map<String,Media> media=new LinkedHashMap<>();
  private final NativeArchives nativeArchives,previewArchives;
  private static final long MAX_FILE=1024L*1024*1024,MAX_IMAGE=64L*1024*1024;
  private static final String[] COLUMNS={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED};
  private static final class Entry {String name,path,mime;Uri uri;long size,modified,cachedAt;boolean directory;}
  private static final class Media {String path,inner,identity;boolean preview;Media(String p,String i,boolean t,String id){path=p;inner=i;preview=t;identity=id;}}
  private static final class Doc {String path;SeekableSource source;List<String> chapters=new ArrayList<>();}
  private static final class CoverScan {
    final Deque<Entry> remaining=new ArrayDeque<>();
    final Set<String> visited=new HashSet<>();
    final String version;final long started=System.currentTimeMillis();Integer count;long byteSize;boolean failed;
    CoverScan(Entry root,String version){remaining.add(root);this.version=version;}
  }

  LocalLibrary(Context context){
    this.context=context;resolver=context.getContentResolver();grants=context.getSharedPreferences("omi-grants",0);
    dataFile=new AtomicFile(new File(context.getFilesDir(),"omicomic-data.json"));
    directoryIndex=new DirectoryIndex(context);
    cache=new File(context.getCacheDir(),"reader");cache.mkdirs();
    mediaEpoch=context.getSharedPreferences("omi-cache",0).getLong("mediaEpoch",0);
    // Keep derived caches across restarts, keyed by granted URI + size + modification time.
    thumbnails=new DiskCache(new File(context.getCacheDir(),"covers"),128L*1024*1024);
    readerPages=new DiskCache(new File(context.getCacheDir(),"reader-pages"),384L*1024*1024,64*1024*1024);
    readerRasters=new DiskCache(new File(context.getCacheDir(),"reader-rasters"),128L*1024*1024,24*1024*1024);
    // Raw pages and non-seekable copies are session scratch, including leftovers
    // from a killed process or the old mixed raw/raster cache.
    folderCovers=new DiskCache(new File(context.getCacheDir(),"folder-covers"),2*1024*1024);
    DiskCache indexCache=new DiskCache(new File(context.getCacheDir(),"archive-indexes"),16*1024*1024);
    nativeArchives=new NativeArchives(indexCache,readerPages,true);previewArchives=new NativeArchives(indexCache,readerPages,false);
    readerStartupCleanup=readerCleanup.submit(()->{readerPages.clear();clearSourceCopies();});
  }
  private void awaitReaderCleanup()throws Exception{readerStartupCleanup.get();}
  private void configureCaches(JSONObject settings){
    if(settings==null)return;
    thumbnails.setLimit(Math.max(64,Math.min(512,settings.optInt("androidThumbnailCacheSizeMb",128)))*1024L*1024);
    long total=Math.max(0,Math.min(2048,settings.optInt("androidReaderDiskCacheSizeMb",512)))*1024L*1024;
    long persistent=Math.min(128L*1024*1024,total/2);
    readerRasters.setLimit(persistent);readerPages.setLimit(total-persistent);
  }
  private JSONObject cacheInfo()throws Exception{return new JSONObject().put("thumbnailBytes",thumbnails.size()).put("thumbnailLimit",thumbnails.limit()).put("readerBytes",readerPages.size()+readerRasters.size()).put("readerLimit",readerPages.limit()+readerRasters.limit()).put("readerTemporaryBytes",readerPages.size()).put("readerRasterBytes",readerRasters.size()).put("readerRasterLimit",readerRasters.limit());}
  void beginReaderSession(){
    if(!readerSessionActive.getAndSet(true))readerSessionEpoch.incrementAndGet();
    nativeArchives.setCaching(true);previewArchives.setCaching(true);
  }
  void endReaderSession(){
    readerSessionActive.set(false);long epoch=readerSessionEpoch.incrementAndGet();
    nativeArchives.setCaching(false);previewArchives.setCaching(false);
    readerCleanup.execute(()->{
      fileAccess.writeLock().lock();try{
        if(readerSessionActive.get()||epoch!=readerSessionEpoch.get())return;
        nativeArchives.release();previewArchives.release();readerPages.clear();clearSourceCopies();
      }finally{fileAccess.writeLock().unlock();}
    });
  }
  private void clearSourceCopies(){File[] files=cache.listFiles();if(files!=null)for(File file:files)if(file.isFile())file.delete();}
  synchronized String addGrant(Uri uri,boolean tree)throws Exception{
    String key=hash(uri.toString()).substring(0,16);
    Uri document=tree?DocumentsContract.buildDocumentUriUsingTree(uri,DocumentsContract.getTreeDocumentId(uri)):uri;
    Entry root=stat(document,"/");
    String path="/local/"+key+"/"+root.name.replace('/','_');
    if(!grants.edit().putString(path,new JSONObject().put("uri",uri.toString()).put("tree",tree).toString()).commit())throw new IOException("目录授权保存失败。");
    return path;
  }
  private String root(String path)throws Exception{
    for(String key:grants.getAll().keySet())if(path.equals(key)||path.startsWith(key+"/"))return key;
    throw new SecurityException("No grant");
  }
  private Entry resolve(String path)throws Exception{
    if(path==null||path.contains("/../")||path.endsWith("/..")||path.contains("\\"))throw new SecurityException("Invalid path");
    String root=root(path); // Check grant membership even for cached entries.
    Entry cached;
    synchronized(metadataLock){
      cached=entries.get(path);
      if(cached!=null&&System.currentTimeMillis()-cached.cachedAt<30000)return cached;
    }
    if(cached!=null){
      try{Entry fresh=stat(cached.uri,path);synchronized(metadataLock){remember(fresh);}return fresh;}
      catch(FileNotFoundException missing){synchronized(metadataLock){entries.remove(path);}}
    }
    // The persisted URI removes per-level provider queries after a process restart.
    // Check the current grant above and stat the document before trusting its identity.
    String indexedUri=directoryIndex.uri(path);
    if(indexedUri!=null){
      try{Entry fresh=stat(Uri.parse(indexedUri),path);if(!fresh.name.equals(path.substring(path.lastIndexOf('/')+1)))throw new FileNotFoundException();uriIndexHits++;synchronized(metadataLock){remember(fresh);}return fresh;}
      catch(FileNotFoundException missing){/* Parent listing resolves a moved/replaced child. */}
    }
    JSONObject grant=new JSONObject(grants.getString(root,"{}"));Uri uri=Uri.parse(grant.getString("uri"));
    boolean tree=grant.getBoolean("tree");if(tree)uri=DocumentsContract.buildDocumentUriUsingTree(uri,DocumentsContract.getTreeDocumentId(uri));
    String current=root;
    if(!path.equals(root)){
      if(!tree)throw new SecurityException("Only this file is authorized");
      for(String part:path.substring(root.length()+1).split("/")){
        if(part.isEmpty()||part.equals(".")||part.equals(".."))throw new SecurityException("Invalid child");
        Entry found=null;
        for(Entry child:children(uri,current))if(child.name.equals(part)){found=child;break;}
        if(found==null)throw new FileNotFoundException(path);uri=found.uri;current=found.path;
      }
    }
    Entry result=stat(uri,path);synchronized(metadataLock){remember(result);}return result;
  }
  private void remember(Entry entry){
    entries.put(entry.path,entry);
    while(entries.size()>32000)entries.remove(entries.keySet().iterator().next());
  }
  private void refreshMetadata(String path){
    synchronized(metadataLock){
      metadataGeneration++;
      entries.keySet().removeIf(key->key.equals(path)||key.startsWith(path+"/"));
      directories.keySet().removeIf(key->key.equals(parent(path))||key.equals(path)||key.startsWith(path+"/"));
      directoryTimes.keySet().retainAll(directories.keySet());
    }
  }
  private Entry stat(Uri uri,String path)throws Exception{
    try(Cursor c=resolver.query(uri,COLUMNS,null,null,null)){if(c==null||!c.moveToFirst())throw new FileNotFoundException();return entry(c,uri,path);}
  }
  private Entry entry(Cursor c,Uri uri,String path){
    Entry e=new Entry();e.uri=uri;e.path=path;e.name=c.getString(1);e.mime=c.getString(2);e.size=c.getLong(3);e.modified=c.getLong(4);e.directory=DocumentsContract.Document.MIME_TYPE_DIR.equals(e.mime);e.cachedAt=System.currentTimeMillis();return e;
  }
  private List<Entry> children(Uri uri,String path)throws Exception{
    long generation;
    synchronized(metadataLock){
      List<Entry> old=directories.get(path);
      if(old!=null&&System.currentTimeMillis()-directoryTimes.get(path)<30000)return old;
      generation=metadataGeneration;
    }
    Entry directory=stat(uri,path);
    String version=uri+"\n"+directory.modified+"\n"+directory.size+"\n"+mediaEpoch;
    JSONArray saved=directory.modified>0?directoryIndex.children(path,version):null;
    if(saved!=null){
      List<Entry> restored=new ArrayList<>();
      try{for(int i=0;i<saved.length();i++){JSONObject row=saved.getJSONObject(i);Entry e=new Entry();e.path=row.getString("path");e.uri=Uri.parse(row.getString("uri"));e.name=row.getString("name");e.mime=row.getString("mime");e.size=row.getLong("size");e.modified=row.getLong("modified");e.directory=row.getBoolean("directory");e.cachedAt=0;if(!e.path.equals(path+"/"+e.name)||e.name.contains("/"))throw new IOException();restored.add(e);}
        synchronized(metadataLock){if(generation==metadataGeneration){for(Entry e:restored)remember(e);directories.put(path,restored);directoryTimes.put(path,System.currentTimeMillis());directoryIndexHits++;return restored;}}
      }catch(Exception invalid){/* Rebuild an invalid derived index. */}
    }
    synchronized(metadataLock){directoryQueries++;}
    // Provider I/O never holds the reader's metadata lock.
    List<Entry> entries=new ArrayList<>();Uri child=DocumentsContract.buildChildDocumentsUriUsingTree(uri,DocumentsContract.getDocumentId(uri));
    try(Cursor c=resolver.query(child,COLUMNS,null,null,null)){
      if(c==null)throw new IOException("目录读取失败。");
      while(c.moveToNext()){
        if(entries.size()>=30000)throw new IOException("目录内容过多，请选择较小的子目录。");
        String name=c.getString(1);if(name==null||name.contains("/")||name.equals(".")||name.equals(".."))continue;
        entries.add(entry(c,DocumentsContract.buildDocumentUriUsingTree(uri,c.getString(0)),path+"/"+name));
      }
    }
    entries.sort((a,b)->natural(a.name,b.name));
    JSONArray snapshot=new JSONArray();for(Entry e:entries)snapshot.put(new JSONObject().put("path",e.path).put("uri",e.uri.toString()).put("name",e.name).put("mime",e.mime).put("size",e.size).put("modified",e.modified).put("directory",e.directory));
    indexWrites.execute(()->{if(!closed&&generation==metadataGeneration)directoryIndex.save(path,version,snapshot);});
    synchronized(metadataLock){
    if(generation!=metadataGeneration)return entries;
    for(Entry item:entries)remember(item);
    directories.put(path,entries);directoryTimes.put(path,System.currentTimeMillis());
    int retained=0;for(List<Entry> items:directories.values())retained+=items.size();
    while(directories.size()>1&&(directories.size()>64||retained>32000)){String oldest=directories.keySet().iterator().next();retained-=directories.remove(oldest).size();directoryTimes.remove(oldest);}
    return entries;
    }

  }
  static int natural(String a,String b){
    int i=0,j=0;
    while(i<a.length()&&j<b.length()){
      char x=a.charAt(i),y=b.charAt(j);
      if(Character.isDigit(x)&&Character.isDigit(y)){
        int ia=i,jb=j;while(i<a.length()&&Character.isDigit(a.charAt(i)))i++;while(j<b.length()&&Character.isDigit(b.charAt(j)))j++;
        while(ia<i-1&&a.charAt(ia)=='0')ia++;while(jb<j-1&&b.charAt(jb)=='0')jb++;
        int c=Integer.compare(i-ia,j-jb);if(c!=0)return c;
        for(int k=0;k<i-ia;k++){c=Character.compare(a.charAt(ia+k),b.charAt(jb+k));if(c!=0)return c;}
      }else{int c=Character.compare(Character.toLowerCase(x),Character.toLowerCase(y));if(c!=0)return c;i++;j++;}
    }
    return Integer.compare(a.length(),b.length());
  }
  private String extension(String name){int i=name.lastIndexOf('.');return i<0?"":name.substring(i+1).toLowerCase(Locale.ROOT);}
  private boolean image(String name){return Arrays.asList("jpg","jpeg","png","webp","gif","bmp").contains(extension(name));}
  private String type(Entry e){if(e.directory)return "folder";String ext=extension(e.name);if(image(e.name))return "image";if(ext.equals("pdf")||ext.equals("epub"))return ext;if(Arrays.asList("zip","cbz","rar","cbr","7z","cb7").contains(ext))return "archive";return "unknown";}
  private JSONObject item(Entry e)throws Exception{return new JSONObject().put("id",e.path).put("path",e.path).put("name",e.name).put("type",type(e)).put("extension",extension(e.name)).put("size",e.size).put("modifiedAt",e.modified);}
  private JSONObject directory(String path)throws Exception{
    Entry e=resolve(path);if(!e.directory)throw new IOException("这不是一个目录。");JSONArray items=new JSONArray();
    for(Entry child:children(e.uri,path))if(!type(child).equals("unknown"))items.put(item(child));
    return new JSONObject().put("path",path).put("parentPath",path.equals(root(path))?JSONObject.NULL:parent(path)).put("items",items).put("total",items.length());
  }
  private String parent(String path){return path.substring(0,path.lastIndexOf('/'));}
  private String identity(Entry entry){return entry.path+"\n"+entry.uri+"\n"+entry.size+"\n"+entry.modified+(entry.modified>0?"":"\n"+cacheSession);}
  private SeekableSource source(Entry entry,boolean allowCopy)throws Exception{
    SeekableSource direct=SeekableSource.open(resolver,entry.uri);
    if(direct!=null)return direct;
    synchronized(copyLock){
      File target=new File(cache,hash(identity(entry)));
      if(target.isFile()){target.setLastModified(System.currentTimeMillis());return new SeekableSource(target);}
      // A background cover must never download/copy a whole streaming document.
      if(!allowCopy)throw new IOException("此文件提供程序需要先打开漫画才能生成封面。");
      if(entry.size>MAX_FILE)throw new IOException("流式文件提供程序的单本缓存上限为 1 GB，请移至手机本地目录后打开。");
      File partial=new File(cache,target.getName()+".part");
      try(InputStream in=resolver.openInputStream(entry.uri);OutputStream out=new FileOutputStream(partial)){copy(in,out,MAX_FILE);}
      catch(Exception ex){partial.delete();throw ex;}
      if(!partial.renameTo(target))throw new IOException("本地读取缓存保存失败。");
      copiedBytes+=target.length();
      File[] files=cache.listFiles();
      if(files!=null){
        Arrays.sort(files,Comparator.comparingLong(File::lastModified));long total=0;for(File f:files)total+=f.length();
        for(File f:files){if(total<=1536L*1024*1024)break;if(f.equals(target))continue;long length=f.length();if(f.delete())total-=length;}
      }
      return new SeekableSource(target);
    }
  }
  static void copy(InputStream in,OutputStream out,long limit)throws IOException{
    if(in==null)throw new FileNotFoundException();byte[] buffer=new byte[65536];long total=0;int n;
    while((n=in.read(buffer))!=-1){total+=n;if(total>limit)throw new IOException("文件内容超过手机端读取上限。");out.write(buffer,0,n);}
  }
  private byte[] bytes(InputStream in,long limit)throws IOException{try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){copy(stream,out,limit);return out.toByteArray();}}
  private List<String> archiveImages(String path)throws Exception{
    Entry entry=resolve(path);
    try(SeekableSource source=source(entry,true)){return nativeArchives.images(source,identity(entry));}
  }
  private JSONObject pages(String path)throws Exception{
    Entry e=stat(resolve(path).uri,path);synchronized(metadataLock){remember(e);}String type=type(e),source=path,title=e.name;JSONArray pages=new JSONArray();String key;
    if(type.equals("folder")||type.equals("image")){
      List<Entry> entries;
      if(type.equals("image")&&path.equals(root(path)))entries=Collections.singletonList(e);
      else{String dir=type.equals("folder")?path:parent(path);Entry d=resolve(dir);entries=children(d.uri,dir);title=d.name;}
      for(Entry page:entries)if(image(page.name)&&!page.directory)pages.put(new JSONObject().put("index",pages.length()).put("name",page.name).put("sourcePath",page.path).put("type","folder-image").put("modifiedAt",page.modified>0?page.modified:null));
      key="folder:"+(type.equals("folder")?path:parent(path));
    }else if(type.equals("archive")){
      for(String name:archiveImages(path))pages.put(new JSONObject().put("index",pages.length()).put("name",name).put("sourcePath",path).put("archiveInnerPath",name).put("type","archive-image").put("modifiedAt",nativeArchives.modifiedAt(identity(e),name)));key="archive:"+path;
    }else if(type.equals("pdf")||type.equals("epub"))key=type+":"+path;
    else throw new IOException("不支持此文件格式。");
    if(pages.length()==0&&!type.equals("pdf")&&!type.equals("epub"))throw new IOException("NO_IMAGES:未在该文件夹中找到可阅读图片。");
    synchronized(pageCounts){pageCounts.put(identity(e),pages.length());while(pageCounts.size()>256)pageCounts.remove(pageCounts.keySet().iterator().next());}
    return new JSONObject().put("key",key).put("resourceKey",key).put("title",title).put("sourcePath",source).put("sourceType",type).put("pages",pages).put("total",pages.length());
  }
  private String registerMedia(String path,String inner,boolean preview)throws Exception{
    return registerMedia(resolve(path),inner,preview);
  }
  private String registerMedia(Entry entry,String inner,boolean preview)throws Exception{
    String path=entry.path,identity=identity(entry),key=hash(identity+"\n"+inner+"\n"+preview);
    synchronized(media){media.put(key,new Media(path,inner,preview,identity));while(media.size()>4000)media.remove(media.keySet().iterator().next());}
    return "https://omi.local/media/"+key+"?v="+mediaEpoch;
  }
  void setReaderPreviewSource(ReaderPreviewSource source){readerPreviewSource=source;}
  private byte[] decodedReaderPreview(Media item)throws Exception{
    ReaderPreviewSource source=readerPreviewSource;if(source==null)return null;
    String key=hash(item.identity+"\n"+item.inner+"\nfalse");
    try{return source.preview("https://omi.local/media/"+key+"?v="+mediaEpoch);}
    catch(Exception|OutOfMemoryError unavailable){return null;/* A derived fast path must not make the actual page unreadable. */}
  }
  WebResourceResponse media(String key)throws Exception{
    awaitReaderCleanup();
    Media m;synchronized(media){m=media.get(key);}if(m==null)throw new FileNotFoundException();
    if(m.preview){
      // A warm preview must not wait behind a cold solid-archive decoder.
      fileAccess.readLock().lock();try{
        if(closed)throw new IOException("文件服务已关闭。");byte[] saved=thumbnails.get(key+":native");
        if(saved==null)saved=thumbnails.get(key);if(saved!=null)return mediaResponse("image/jpeg",saved);
        // The visible reader already owns these decoded pixels. Reusing them
        // avoids waiting behind unrelated/solid-archive thumbnail extraction.
        saved=decodedReaderPreview(m);
        if(saved!=null){thumbnails.put(key+":native",saved);return mediaResponse("image/jpeg",saved);}
      }finally{fileAccess.readLock().unlock();}
      // Only one thumbnail decoder; it never holds the foreground reader/bridge lock.
      synchronized(previewLock){
        // The body may have completed while this neighbour waited for another
        // preview. Recheck before repeating extraction and decode.
        byte[] shared=decodedReaderPreview(m);
        if(shared!=null){thumbnails.put(key+":native",shared);return mediaResponse("image/jpeg",shared);}
        return mediaResponse(key,m);
      }
    }
    return mediaResponse(key,m);
  }
  byte[] readerImage(String url)throws Exception{
    awaitReaderCleanup();
    Uri uri=Uri.parse(url);if(!MainActivity.isApp(uri)||!uri.getPath().startsWith("/media/"))throw new SecurityException("Invalid image URL");
    Media item;synchronized(media){item=media.get(uri.getLastPathSegment());}if(item==null||item.preview)throw new FileNotFoundException();
    fileAccess.readLock().lock();try{if(closed)throw new IOException("文件服务已关闭。");return imageBytes(item);}finally{fileAccess.readLock().unlock();}
  }
  ReaderPreview readerPreview(String url)throws Exception{
    Media item;synchronized(media){item=media.get(Uri.parse(url).getLastPathSegment());}
    // Only an exact page identity is eligible; an archive's unrelated cover is
    // never used for a requested inner page.
    if(item==null)return null;
    String key=hash(item.identity+"\n"+item.inner+"\ntrue");byte[] saved=thumbnails.get(key+":native");
    if(saved!=null)return new ReaderPreview(saved,true);
    saved=thumbnails.get(key);return saved==null?null:new ReaderPreview(saved,false);
  }
  byte[] readerRaster(String url,int sample){return readerRasters.get("filtered-raster-v2:"+Uri.parse(url).getLastPathSegment()+":"+sample);}
  boolean hasReaderRaster(String url,int sample){return readerRasters.contains("filtered-raster-v2:"+Uri.parse(url).getLastPathSegment()+":"+sample);}
  void saveReaderRaster(String url,int sample,byte[] data){readerRasters.put("filtered-raster-v2:"+Uri.parse(url).getLastPathSegment()+":"+sample,data);}
  long readerRasterEpoch(){return readerRasters.epoch();}
  void persistReaderRaster(String url,int sample,byte[] data,int width,int height,int orientation,long epoch){
    synchronized(readerRasters){
      if(closed||epoch!=readerRasters.epoch())return;
      saveReaderRaster(url,sample,data);saveReaderRasterInfo(url,width,height,orientation);
    }
  }
  JSONObject readerRasterInfo(String url){
    try{
      Media item;synchronized(media){item=media.get(Uri.parse(url).getLastPathSegment());}
      if(item==null||!identity(resolve(item.path)).equals(item.identity))return null;
      byte[] saved=readerRasters.get("filtered-raster-info-v2:"+Uri.parse(url).getLastPathSegment());
      return saved==null?null:new JSONObject(new String(saved,java.nio.charset.StandardCharsets.UTF_8));
    }catch(Exception invalid){return null;}
  }
  void saveReaderRasterInfo(String url,int width,int height,int orientation){
    try{readerRasters.put("filtered-raster-info-v2:"+Uri.parse(url).getLastPathSegment(),new JSONObject().put("width",width).put("height",height).put("orientation",orientation).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(JSONException ignored){}
  }
  private WebResourceResponse mediaResponse(String mime,byte[] bytes){
    WebResourceResponse result=MainActivity.response(mime,new ByteArrayInputStream(bytes),200,"OK");
    // URLs include file identity and a refresh generation; WebView can reuse them.
    Map<String,String> headers=new HashMap<>(result.getResponseHeaders());
    headers.put("Cache-Control","private, max-age=86400, immutable");result.setResponseHeaders(headers);return result;
  }
  private byte[] imageBytes(Media m)throws Exception{
      Entry entry=resolve(m.path);
      if(!identity(entry).equals(m.identity))throw new IOException("文件已改变，请刷新目录。");
      byte[] bytes;
      if(m.inner!=null||type(entry).equals("archive")||type(entry).equals("epub")){
        try(SeekableSource source=source(entry,!m.preview)){
          if(type(entry).equals("epub"))bytes=NativeArchives.entry(source,m.inner==null?epubCover(source):m.inner,MAX_IMAGE);
          else bytes=m.inner==null?NativeArchives.cover(source):(m.preview?previewArchives:nativeArchives).read(source,m.identity,m.inner);
        }
      }else {
        if(entry.directory){
          Entry first=null;for(Entry child:children(entry.uri,entry.path))if(image(child.name)&&!child.directory){first=child;break;}
          if(first==null)throw new IOException("目录中没有图片。");entry=first;
        }
        if(!image(entry.name))throw new SecurityException();
        if(entry.size>0&&entry.size<=MAX_IMAGE){
          bytes=new byte[(int)entry.size];try(InputStream input=resolver.openInputStream(entry.uri)){if(input==null)throw new FileNotFoundException();int done=0;while(done<bytes.length){int count=input.read(bytes,done,bytes.length-done);if(count<0)throw new EOFException("图片数据不完整。");done+=count;}if(input.read()!=-1)throw new IOException("文件已改变，请刷新目录。");}
        }else bytes=bytes(resolver.openInputStream(entry.uri),MAX_IMAGE);
      }
      return bytes;
  }
  private WebResourceResponse mediaResponse(String key,Media m)throws Exception{
    fileAccess.readLock().lock();
    try {
      if(m.preview){byte[] cached=thumbnails.get(key);if(cached!=null)return mediaResponse("image/jpeg",cached);}
      byte[] bytes=imageBytes(m);
      BitmapFactory.Options size=new BitmapFactory.Options();size.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,size);
      if(size.outWidth<=0||size.outHeight<=0||(long)size.outWidth*size.outHeight>100_000_000L)throw new IOException("图片尺寸超出上限。");
      String mime=size.outMimeType;
      if(m.preview){
        BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=1;
        while(Math.max(size.outWidth,size.outHeight)/opts.inSampleSize>480)opts.inSampleSize*=2;
        Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);if(bitmap==null)throw new IOException("图片解码失败。");
        ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,80,out);bitmap.recycle();bytes=out.toByteArray();mime="image/jpeg";
        thumbnails.put(key,bytes);
      }
      return mediaResponse(mime,bytes);
    }finally{fileAccess.readLock().unlock();}
  }
  private JSONObject pageImage(JSONObject input)throws Exception{return new JSONObject().put("url",registerMedia(input.getString("sourcePath"),input.optString("archiveInnerPath",null),input.optBoolean("preview")));}
  private JSONObject thumbnail(JSONObject input)throws Exception{
    Entry root=resolve(input.getString("path"));
    if(!root.directory)return coverResult(root,null).put("byteSize",root.size);
    synchronized(coverLock){
      // Folder hints remain valid across process restarts, including providers
      // without folder timestamps. The referenced cover is validated below.
      String version=root.path+"\n"+root.uri;
      byte[] saved=folderCovers.get(root.path);
      if(saved!=null)try{
        JSONObject hint=new JSONObject(new String(saved,StandardCharsets.UTF_8));
        String path=hint.getString("path");Uri uri=Uri.parse(hint.getString("uri"));
        if(hint.getString("version").equals(version)
            &&path.startsWith(root.path+"/")&&Objects.equals(uri.getAuthority(),root.uri.getAuthority())
            &&DocumentsContract.getTreeDocumentId(uri).equals(DocumentsContract.getTreeDocumentId(root.uri))){
          Entry target=stat(uri,path);synchronized(metadataLock){remember(target);}
          if(!target.directory&&target.name.equals(path.substring(path.lastIndexOf('/')+1))&&!type(target).equals("unknown")){folderCoverHits++;return coverResult(target,hint.has("count")?hint.getInt("count"):null).put("byteSize",hint.optLong("byteSize",0));}
        }
      }catch(Exception stale){ /* A moved or deleted cover falls back to a new search. */ }
      CoverScan scan=coverScans.get(root.path);
      if(scan==null||!scan.version.equals(version)||System.currentTimeMillis()-scan.started>60000){
        scan=new CoverScan(root,version);coverScans.put(root.path,scan);
        while(coverScans.size()>64)coverScans.remove(coverScans.keySet().iterator().next());
      }
      // Resume a small slice on the dedicated cover worker. No depth cutoff and no
      // repeating the first folders after the time budget expires.
      long deadline=android.os.SystemClock.uptimeMillis()+60;int steps=0;
      while(!scan.remaining.isEmpty()&&scan.visited.size()<8192&&steps++<8){
        if(Thread.currentThread().isInterrupted())throw new IOException("封面加载已取消。");
        Entry next=scan.remaining.removeFirst();
        if(!scan.visited.add(next.uri.toString()))continue;
        folderCoverSteps++;
        try{
          List<Entry> children=children(next.uri,next.path);
          if(next.path.equals(root.path)){
            int folders=0,books=0;
            for(Entry child:children){if(child.directory)folders++;else if(Arrays.asList("archive","pdf","epub").contains(type(child)))books++;}
            scan.count=folders>0||books>1?folders+books:null;
            if(scan.count==null)for(Entry child:children)if(!child.directory&&!type(child).equals("unknown"))scan.byteSize+=child.size;
          }
          Entry selected=null;
          for(Entry child:children)if(!child.directory&&image(child.name)){selected=child;break;}
          if(selected==null)for(Entry child:children)if(!child.directory&&!type(child).equals("unknown")){selected=child;break;}
          if(selected!=null){
            JSONObject hint=new JSONObject().put("version",version).put("path",selected.path).put("uri",selected.uri.toString()).put("savedAt",System.currentTimeMillis()).put("count",scan.count).put("byteSize",scan.byteSize);
            folderCovers.put(root.path,hint.toString().getBytes(StandardCharsets.UTF_8));coverScans.remove(root.path);
            return coverResult(selected,scan.count).put("byteSize",scan.byteSize);
          }
          for(int i=children.size()-1;i>=0;i--)if(children.get(i).directory&&scan.remaining.size()<32000)scan.remaining.addFirst(children.get(i));
        }catch(SecurityException revoked){throw revoked;}
        catch(Exception unavailable){scan.failed=true;}
        if(android.os.SystemClock.uptimeMillis()>=deadline)break;
      }
      JSONObject result=new JSONObject().put("url",JSONObject.NULL).put("itemCount",scan.count);
      if(!scan.remaining.isEmpty()&&scan.visited.size()<8192)return result.put("pending",true);
      coverScans.remove(root.path);
      return result.put("retryable",scan.failed||!scan.remaining.isEmpty());
    }
  }
  private JSONObject coverResult(Entry entry,Integer count)throws Exception{
    if(entry.cachedAt==0)entry=resolve(entry.path);
    JSONObject result=new JSONObject().put("url",JSONObject.NULL).put("itemCount",count);
    String type=type(entry);
    if(type.equals("pdf"))return result.put("pdfPath",entry.path).put("sourceVersion",identity(entry));
    if(type.equals("unknown"))return result;
    return result.put("url",registerMedia(entry,null,true));
  }
  private void refreshThumbnails(){
    invalidateMedia();cacheSession=UUID.randomUUID().toString();
    synchronized(coverLock){coverScans.clear();folderCovers.clear();}
    synchronized(metadataLock){metadataGeneration++;entries.clear();directories.clear();directoryTimes.clear();}
    indexWrites.execute(directoryIndex::clear);
  }
  private void invalidateMedia(){mediaEpoch++;context.getSharedPreferences("omi-cache",0).edit().putLong("mediaEpoch",mediaEpoch).apply();}
  private String epubCover(SeekableSource source)throws Exception{
    String opf=null;
    for(Tag tag:xml(NativeArchives.entry(source,"META-INF/container.xml",2*1024*1024)))if(tag.name.equals("rootfile")){opf=tag.get("full-path");break;}
    if(opf==null||opf.isEmpty())throw new IOException("EPUB 缺少书目。");
    List<Tag> tags=xml(NativeArchives.entry(source,opf,4*1024*1024));String coverId=null;
    for(Tag tag:tags)if(tag.name.equals("meta")&&tag.get("name").equals("cover"))coverId=tag.get("content");
    for(Tag tag:tags)if(tag.name.equals("item")&&image(tag.get("href"))&&(Arrays.asList(tag.get("properties").split("\\s+")).contains("cover-image")||tag.get("id").equals(coverId)))return resolveZip(opf,tag.get("href"));
    for(Tag tag:tags)if(tag.name.equals("item")&&image(tag.get("href"))&&tag.get("href").toLowerCase(Locale.ROOT).contains("cover"))return resolveZip(opf,tag.get("href"));
    throw new IOException("EPUB 未提供封面图片。");
  }
  private JSONObject change(JSONObject input)throws Exception{
    String path=input.getString("path"),action=input.getString("action");Entry e=resolve(path);
    if(e.directory&&path.equals(root(path)))throw new IOException("不能修改资源根目录，请选择目录中的具体漫画。");
    for(Doc d:documents.values())if(d.path.equals(path)||d.path.startsWith(path+"/"))throw new IOException("请先退出当前漫画的阅读器。");
    if(action.equals("rename")){
      String name=input.getString("name");
      if(name.trim().isEmpty()||!name.equals(name.trim())||name.length()>180||name.matches(".*[<>:\"/\\\\|?*\\p{Cntrl}].*")||name.endsWith(".")||name.equals(".."))throw new IOException("文件名无效。");
      if(!e.directory&&!extension(name).equals(extension(e.name)))throw new IOException("请保留原文件扩展名。");
      if(name.equals(e.name))throw new IOException("名称没有改变。");
      String root=root(path);boolean single=path.equals(root);
      if(!single){Entry parent=resolve(parent(path));for(Entry child:children(parent.uri,parent.path))if(child.name.equalsIgnoreCase(name))throw new IOException("同名文件或目录已存在。");}
      Uri changed=DocumentsContract.renameDocument(resolver,e.uri,name);if(changed==null)throw new IOException("文件提供程序不允许重命名。");
      String actualName=stat(changed,path).name;String next=parent(path)+"/"+actualName;
      if(single){JSONObject grant=new JSONObject().put("uri",changed.toString()).put("tree",false);if(!grants.edit().remove(root).putString(next,grant.toString()).commit())throw new IOException("文件已重命名，但授权保存失败，请重新打开文件。");}
      invalidate(path);return new JSONObject().put("newPath",next);
    }
    if(action.equals("trash")){
      if(!DocumentsContract.deleteDocument(resolver,e.uri))throw new IOException("文件提供程序不允许删除。");
      if(path.equals(root(path)))grants.edit().remove(path).commit();invalidate(path);return new JSONObject().put("newPath",JSONObject.NULL);
    }
    throw new IOException("未知文件操作。");
  }
  private void invalidate(String path){
    refreshMetadata(path);refreshThumbnails();nativeArchives.forget(path);previewArchives.forget(path);
    pageCounts.keySet().removeIf(key->key.startsWith(path+"\n")||key.startsWith(path+"/"));
    synchronized(media){media.entrySet().removeIf(e->e.getValue().path.equals(path)||e.getValue().path.startsWith(path+"/"));}
  }
  private static final class Tag {String name;Map<String,String> attributes=new HashMap<>();String get(String key){String value=attributes.get(key);return value==null?"":value;}}
  private List<Tag> xml(byte[] bytes)throws Exception{
    // Android's built-in DOM parser does not support desktop Xerces features.
    // Pull parsing keeps DTD processing disabled and rejects declarations/entities.
    XmlPullParser parser=android.util.Xml.newPullParser();
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES,true);
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_DOCDECL,false);
    parser.setInput(new ByteArrayInputStream(bytes),null);
    List<Tag> tags=new ArrayList<>();int token;
    while((token=parser.nextToken())!=XmlPullParser.END_DOCUMENT){
      if(token==XmlPullParser.DOCDECL||(token==XmlPullParser.ENTITY_REF&&parser.getText()==null))throw new IOException("EPUB 书目不允许文档类型或未定义实体。");
      if(token==XmlPullParser.START_TAG){
        if(parser.getDepth()>64||tags.size()>=30000)throw new IOException("EPUB 书目结构过大。");
        Tag tag=new Tag();tag.name=parser.getName();
        for(int i=0;i<parser.getAttributeCount();i++)tag.attributes.put(parser.getAttributeName(i),parser.getAttributeValue(i));
        tags.add(tag);
      }
    }
    return tags;
  }
  private String resolveZip(String base,String relative)throws Exception{
    String href=Uri.decode(relative.split("#",2)[0]);if(href.contains(":")||href.startsWith("/")||href.contains("\\"))throw new IOException("不支持外部电子书资源。");
    ArrayDeque<String> parts=new ArrayDeque<>();String combined=(base.contains("/")?base.substring(0,base.lastIndexOf('/')+1):"")+href;
    for(String part:combined.split("/")){if(part.equals("..")){if(parts.isEmpty())throw new IOException("电子书路径无效。");parts.removeLast();}else if(!part.equals(".")&&!part.isEmpty())parts.add(part);}
    return String.join("/",parts);
  }
  private JSONObject openDocument(JSONObject input)throws Exception{
    if(documents.size()>=6)throw new IOException("打开的文档过多，请先返回资源库。");
    Doc d=new Doc();d.path=input.getString("path");d.source=source(resolve(d.path),!input.optString("purpose").equals("thumbnail"));JSONArray chapters=new JSONArray();
    try {
    if(input.getString("type").equals("epub")){
      String opf=null;for(Tag tag:xml(NativeArchives.entry(d.source,"META-INF/container.xml",2*1024*1024)))if(tag.name.equals("rootfile")){opf=tag.get("full-path");break;}
      if(opf==null||opf.isEmpty())throw new IOException("EPUB 缺少书目。");
      List<Tag> packageDoc=xml(NativeArchives.entry(d.source,opf,4*1024*1024));Map<String,String> manifest=new HashMap<>();
      for(Tag item:packageDoc)if(item.name.equals("item"))manifest.put(item.get("id"),resolveZip(opf,item.get("href")));
      for(Tag item:packageDoc)if(item.name.equals("itemref")){
        if(d.chapters.size()>=5000)throw new IOException("EPUB 章节过多。");
        String entry=manifest.get(item.get("idref"));if(entry!=null){d.chapters.add(entry);chapters.put(new JSONObject().put("name","第 "+d.chapters.size()+" 章").put("index",d.chapters.size()-1));}
      }
      if(d.chapters.isEmpty())throw new IOException("EPUB 没有可阅读章节。");
    }
    String id=input.getString("id");closeDocument(id);documents.put(id,d);return new JSONObject().put("size",d.source.size()).put("chapters",chapters);
    }catch(Exception error){d.source.close();throw error;}
  }
  private String chapter(Doc d,int index)throws Exception{
    if(index<0||index>=d.chapters.size())throw new IOException("章节不存在。");String entry=d.chapters.get(index);String html=new String(NativeArchives.entry(d.source,entry,8*1024*1024),StandardCharsets.UTF_8);
    // Sanitization runs in the renderer's detached DOM, before the sandboxed chapter iframe.
    return new JSONObject().put("html",html).put("path",d.path).put("entry",entry).toString();
  }
  private void save(AtomicFile target,JSONObject data)throws Exception{
    FileOutputStream out=null;try{out=target.startWrite();out.write(data.toString().getBytes(StandardCharsets.UTF_8));target.finishWrite(out);}catch(Exception e){target.failWrite(out);throw e;}
  }
  Object call(String method,JSONObject input)throws Exception{
    awaitReaderCleanup();
    if(method.equals("loadData")||method.equals("saveData")||method.equals("backupData")){
      synchronized(dataLock){return dispatch(method,input);}
    }
    if(method.equals("getResourcePages")||method.equals("listDirectory")){
      fileAccess.readLock().lock();try{if(closed)throw new IOException("文件服务已关闭。");return dispatch(method,input);}finally{fileAccess.readLock().unlock();}
    }
    if(method.equals("getPageImage")){
      fileAccess.readLock().lock();try{if(closed)throw new IOException("文件服务已关闭。");return pageImage(input);}finally{fileAccess.readLock().unlock();}
    }
    if(method.equals("getThumbnail")){
      fileAccess.readLock().lock();try{if(closed)throw new IOException("文件服务已关闭。");return thumbnail(input);}finally{fileAccess.readLock().unlock();}
    }
    synchronized(this){return orderedCall(method,input);}
  }
  private Object orderedCall(String method,JSONObject input)throws Exception{
    java.util.concurrent.locks.Lock lock=method.equals("changeLocalResource")||method.equals("clearAndroidReadCache")?fileAccess.writeLock():fileAccess.readLock();
    lock.lock();try{return dispatch(method,input);}finally{lock.unlock();}
  }
  private Object dispatch(String method,JSONObject input)throws Exception{
    switch(method){
      case "loadData":{if(!dataFile.getBaseFile().exists())return null;JSONObject saved=new JSONObject(new String(dataFile.readFully(),StandardCharsets.UTF_8));configureCaches(saved.optJSONObject("settings"));return saved;}
      case "saveData":save(dataFile,input.getJSONObject("data"));configureCaches(input.getJSONObject("data").optJSONObject("settings"));return null;
      case "getAndroidCacheInfo":return cacheInfo();
      case "clearAndroidReadCache":readerPages.clear();readerRasters.clear();thumbnails.clear();nativeArchives.release();previewArchives.release();invalidateMedia();return cacheInfo();
      case "backupData":save(new AtomicFile(new File(context.getFilesDir(),"before-file-operation.json")),input.getJSONObject("data"));return null;
      case "listDirectory":return directory(input.getString("path"));
      case "getResourcePages":return pages(input.getString("path"));
      case "getPageImage":return pageImage(input);
      case "getThumbnail":return thumbnail(input);
      case "refreshThumbnails":refreshThumbnails();return null;
      case "getReadablePageCount":return pageCounts.get(identity(resolve(input.getString("path"))));
      case "checkResourcePath":{String p=input.getString("path");try{Entry e=resolve(p);return new JSONObject().put("path",p).put("exists",true).put("readable",true).put("isDirectory",e.directory);}catch(Exception e){return new JSONObject().put("path",p).put("exists",false).put("readable",false).put("reason","文件不存在或目录授权已失效。");}}
      case "getBookmarkPagePreview":{
        String path=input.getString("sourcePath"),type=input.optString("sourceType"),name=input.optString("pageName","");
        String inner=input.optString("archiveInnerPath",name);
        if(type.equals("archive")&&!inner.isEmpty())return new JSONObject().put("dataUrl",registerMedia(path,inner,true));
        if(type.equals("folder")&&!name.isEmpty()&&!name.contains("/")&&!name.contains("\\"))return new JSONObject().put("dataUrl",registerMedia(path+"/"+name,null,true));
        if(type.equals("image"))return new JSONObject().put("dataUrl",registerMedia(path,null,true));
        return new JSONObject().put("dataUrl","");
      }
      case "releaseReaderResource":nativeArchives.release();return null;
      case "changeLocalResource":return change(input);
      case "openDocument":return openDocument(input);
      case "closeDocument":closeDocument(input.getString("id"));return null;
      case "readDocumentRange":{Doc d=documents.get(input.getString("id"));if(d==null)throw new IOException("文档已关闭。");return Base64.encodeToString(d.source.range(input.getInt("begin"),input.getInt("end")),Base64.NO_WRAP);}
      case "readDocumentChapter":{Doc d=documents.get(input.getString("id"));if(d==null)throw new IOException("文档已关闭。");return chapter(d,input.getInt("index"));}
      case "epubImage":{String entry=resolveZip(input.getString("entry"),input.getString("href"));if(!image(entry))return null;return registerMedia(input.getString("path"),entry,true);}
      default:throw new IOException("未知本地操作："+method);
    }
  }
  private void closeDocument(String id)throws IOException {Doc doc=documents.remove(id);if(doc!=null)doc.source.close();}
  synchronized void close(){
    fileAccess.writeLock().lock();try{
      closed=true;
      nativeArchives.close();previewArchives.close();
      for(Doc doc:documents.values())try{doc.source.close();}catch(IOException ignored){}
      documents.clear();
      indexWrites.execute(directoryIndex::close);indexWrites.shutdown();readerCleanup.shutdown();
    }finally{fileAccess.writeLock().unlock();}
  }
  static String hash(String text)throws Exception{byte[] digest=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));char[] hex="0123456789abcdef".toCharArray(),result=new char[digest.length*2];for(int i=0;i<digest.length;i++){result[i*2]=hex[(digest[i]>>>4)&15];result[i*2+1]=hex[digest[i]&15];}return new String(result);}
}
