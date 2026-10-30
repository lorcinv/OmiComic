package io.github.lorcinv.omicomic;

import android.app.ActivityManager;
import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import android.view.View;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Android owns decoded pixels and drawing; the existing Omi UI owns layout and input.
 * Geometry messages contain no image bytes. The last complete frame survives cache misses. */
final class NativeReaderSurface extends View {
  interface Reply {void complete(JSONObject value,Exception error);}
  private final LocalLibrary library;
  private final ReaderWorkQueue foreground=new ReaderWorkQueue(),prefetch=new ReaderWorkQueue();
  private final ScheduledThreadPoolExecutor rasterWrites=new ScheduledThreadPoolExecutor(1,work->new Thread(()->{android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);work.run();},"Omi-raster-cache"));
  private final Object cacheLock=new Object();
  private final LinkedHashMap<String,Integer> workingKeys=new LinkedHashMap<>();
  private final LinkedHashMap<String,String> pageKeys=new LinkedHashMap<>(16,.75f,true);
  private final LinkedHashMap<String,RasterWrite> pendingWrites=new LinkedHashMap<>();
  private boolean writeScheduled;
  private long lastNavigation,retainedLoads,clearPrefetches,rasterWriteCount,deferredRasterWrites;
  private final LinkedHashMap<String,Raster> cache=new LinkedHashMap<>(16,.75f,true);
  private final LinkedHashMap<String,Raster> previewCache=new LinkedHashMap<>(16,.75f,true);
  private long previewBytes;
  private final Map<String,PendingRaster> previewRestoring=new HashMap<>();
  private final Set<String> previewRestoreFailed=new HashSet<>();
  private long previewRestores;
  private final Map<String,PendingRaster> pending=new HashMap<>();
  private final Set<String> pinned=new HashSet<>();
  private final Set<String> visibleTiles=new HashSet<>();
  private final Set<String> visibleAdjustments=new HashSet<>();
  private final Map<String,Long> tilesPending=new HashMap<>();
  private final LinkedHashMap<String,Tile> tiles=new LinkedHashMap<>(16,.75f,true);
  private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
  private final long deviceBudget;
  private volatile long budget,session,generation,warmGeneration,seekGeneration;
  private long bytes,tileBytes,drawnFrames,retainedFrames,bitmapDecodes,bitmapHits,tileDecodes,emptyFrames,decodeMs,readMs;
  private int concurrency=2;
  private volatile boolean stopped;
  private Frame current,pendingFrame;
  private boolean active,readerOpen;
  private int background=0xffefefed;
  private String effectsKey="";
  private JSONObject effects=new JSONObject();
  private final Map<String,Bitmap> adjusted=new LinkedHashMap<>(8,.75f,true);
  private final Map<String,Long> adjusting=new HashMap<>();
  private final Set<String> failedTiles=new HashSet<>();
  private long adjustedBytes;
  private long cancelledLoads,retiredBytes,previewHits,coalescedFrames,frameSequence,movingRetainedFrames;
  private JSONObject queuedGeometry;
  private boolean frameScheduled;
  private final View previewOverlay;
  private List<Slot> previews=new ArrayList<>();
  private long sharedPreviewDraws;
  private long rasterDiskHits;
  private long rasterSourceSkips;
  private long refinements,refinementFailures,refinementCancellations;
  // Retain compatible diagnostics; fit-size pages use decoded mipmaps directly.
  private long displayBytes,displayBuilds,displayHits,displayBuildMs,tileFilterBuilds;
  private List<String> previewRasterUrls=new ArrayList<>();
  private Map<String,TilePlan> completeTilePlans=new HashMap<>(),restoreTilePlans=new HashMap<>();
  private boolean wasRestoring;
  private long restoreFadeStart,restoreQualityFrames,restoreFadeFrames;
  private static final long ZOOM_QUIET_MS=320,QUALITY_FADE_MS=180;
  private final Map<String,TilePresentation> tilePresentations=new HashMap<>();
  private float lastQualityZoom=1;
  private long lastZoomTime,qualityBlendFrames;

  private static final class Raster {
    final String url;final Bitmap bitmap;final int width,height,sample,orientation;final Matrix toOriginal;final long created=SystemClock.uptimeMillis();boolean preview;
    PendingRaster request;int fullSample,refinementAttempts;boolean promoting,persistable;long retryAfter,persistedEpoch=-1;CompletableFuture<Raster> clearFuture;
    Raster(String url,Bitmap bitmap,int w,int h,int sample,int orientation){this.url=url;this.bitmap=bitmap;this.orientation=orientation;width=orientation>=5?h:w;height=orientation>=5?w:h;this.sample=sample;Matrix transform=orientationMatrix(orientation);RectF area=new RectF(0,0,w,h);transform.mapRect(area);transform.postTranslate(-area.left,-area.top);toOriginal=new Matrix();transform.invert(toOriginal);}
  }
  private static final class Slot {String url;RectF rect,clip;float alpha;Raster raster;}
  private static final class Frame {RectF clip;boolean panorama,restoring;float zoom=1;List<Slot> slots=new ArrayList<>();}
  private static final class Tile {Bitmap bitmap;Rect source;}
  private static final class TilePlan {Slot slot;int sample,filterBucket;List<Rect> regions=new ArrayList<>();List<String> keys=new ArrayList<>();long bytes;}
  private static final class TilePresentation {TilePlan current,previous;long started;}
  private static final class PendingRaster {
    volatile long generation,seek;volatile String key="";final CompletableFuture<Raster> future=new CompletableFuture<>();
    PendingRaster(long generation,long seek){this.generation=generation;this.seek=seek;}
  }
  private static final class RasterWrite {
    final String url;String key="";boolean oriented;final java.lang.ref.WeakReference<Bitmap> bitmap;final int sample,width,height,orientation;final long epoch;
    RasterWrite(String url,Bitmap bitmap,int sample,int width,int height,int orientation,long epoch){this.url=url;this.bitmap=new java.lang.ref.WeakReference<>(bitmap);this.sample=sample;this.width=width;this.height=height;this.orientation=orientation;this.epoch=epoch;}
  }

  NativeReaderSurface(Context context,LocalLibrary library){
    super(context);this.library=library;setWillNotDraw(false);
    ActivityManager manager=(ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
    deviceBudget=Math.max(24L*1024*1024,Math.min(192L*1024*1024,(long)manager.getMemoryClass()*1024*1024/3));
    budget=Math.min(100L*1024*1024,deviceBudget);
    prefetch.setThreadFactory(work->new Thread(()->{android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);work.run();},"Omi-reader-prefetch"));
    rasterWrites.setRemoveOnCancelPolicy(true);
    previewOverlay=new View(context){@Override protected void onDraw(Canvas canvas){drawPreviews(canvas);}};
    previewOverlay.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    library.setReaderPreviewSource(this::preview);
  }
  View previewOverlay(){return previewOverlay;}
  @Override public void invalidate(){super.invalidate();if(previewOverlay!=null)previewOverlay.invalidate();}
  boolean isActive(){return active;}
  void configure(JSONObject args){
    long next=args.optLong("session",session);
    if(next!=session){
      current=null;pendingFrame=null;queuedGeometry=null;frameSequence=0;completeTilePlans.clear();restoreTilePlans.clear();tilePresentations.clear();lastQualityZoom=1;lastZoomTime=0;wasRestoring=false;restoreFadeStart=0;
      synchronized(cacheLock){
        session=next;generation++;seekGeneration=0;workingKeys.clear();pageKeys.clear();pinned.clear();visibleTiles.clear();failedTiles.clear();tilesPending.clear();tiles.clear();tileBytes=0;previewRestoring.clear();previewRestoreFailed.clear();
        // Keep a small recent working set (including the just-warmed first
        // page), not the previous book's whole decoded cache. Disk caches keep
        // the cheap reopen path without forcing a GC during the next opening.
        Iterator<Raster> old=cache.values().iterator();
        while(bytes>budget/4&&cache.size()>2&&old.hasNext()){
          long size=old.next().bitmap.getAllocationByteCount();bytes-=size;retiredBytes+=size;old.remove();
        }
      }
      adjusted.clear();adjusting.clear();adjustedBytes=0;
    }
    if(args.has("memoryMb"))budget=Math.min(deviceBudget,Math.max(0,args.optLong("memoryMb",100))*1024*1024);
    if(args.has("concurrency"))concurrency=Math.max(1,Math.min(4,args.optInt("concurrency",2)));
    int workers=Math.max(1,concurrency-1);prefetch.setCorePoolSize(Math.min(prefetch.getCorePoolSize(),workers));prefetch.setMaximumPoolSize(workers);prefetch.setCorePoolSize(workers);
    try{background=Color.parseColor(args.optString("background","#efefed"));}catch(Exception ignored){}
    JSONObject value=args.optJSONObject("effects");String key=value==null?"":value.toString();
    if(!key.equals(effectsKey)){effectsKey=key;effects=value==null?new JSONObject():value;adjusted.clear();adjustedBytes=0;tilePresentations.clear();}
    boolean wasActive=active;active=args.optBoolean("active");
    boolean wasReading=readerOpen;readerOpen=args.optBoolean("reading",active);
    synchronized(cacheLock){if(readerOpen&&!wasReading)library.beginReaderSession();else if(!readerOpen&&wasReading)library.endReaderSession();}
    if(!active){current=null;pendingFrame=null;queuedGeometry=null;previews.clear();completeTilePlans.clear();restoreTilePlans.clear();tilePresentations.clear();lastQualityZoom=1;lastZoomTime=0;wasRestoring=false;restoreFadeStart=0;synchronized(cacheLock){if(wasActive){generation++;warmGeneration++;cache.clear();previewCache.clear();tiles.clear();bytes=0;previewBytes=0;tileBytes=0;adjusted.clear();adjusting.clear();adjustedBytes=0;}workingKeys.clear();pinned.clear();visibleTiles.clear();previewRestoring.clear();previewRestoreFailed.clear();}}
    synchronized(cacheLock){trim();}invalidate();
  }
  void seek(JSONObject args){
    synchronized(cacheLock){
      if(args.optLong("session",-1)!=session)return;
      if(args.optBoolean("prioritizeOnly")){
        // Panorama keeps a continuous load generation. Only rank its near pages
        // for eviction/writes; do not cancel the already decoding neighbours.
        workingKeys.clear();JSONArray keep=args.optJSONArray("keep");
        if(keep!=null)for(int i=0;i<keep.length()&&i<48;i++)workingKeys.put(keep.optString(i),i);
        lastNavigation=SystemClock.uptimeMillis();return;
      }
      long next=Math.max(seekGeneration,args.optLong("seek",0));if(next==seekGeneration)return;
      seekGeneration=next;lastNavigation=SystemClock.uptimeMillis();workingKeys.clear();
      JSONArray keep=args.optJSONArray("keep");if(keep!=null)for(int i=0;i<keep.length()&&i<48;i++)workingKeys.put(keep.optString(i),i);
      // Atomically transfer useful work to the new window. Frame sequence and
      // session checks still prevent an old request from displaying old pages.
      for(PendingRaster work:pending.values())if(work.generation==generation&&workingKeys.containsKey(work.key)){work.seek=next;retainedLoads++;}
      for(Raster raster:cache.values())if(raster.preview&&raster.request.generation==generation&&workingKeys.containsKey(raster.request.key)){raster.request.seek=next;retainedLoads++;}
      previewRestoring.clear();previewRestoreFailed.clear();
    }
  }
  private void checkSeek(long seek)throws IOException{if(seek>=0&&seek!=seekGeneration){synchronized(cacheLock){cancelledLoads++;}throw new IOException("阅读请求已取消。");}}
  private void checkWork(PendingRaster work)throws IOException{synchronized(cacheLock){checkGeneration(work.generation);checkSeek(work.seek);}}
  private long requestSeek(long expected,long seek,String key)throws IOException{
    synchronized(cacheLock){checkGeneration(expected);if(seek>=0&&workingKeys.containsKey(key))return seekGeneration;checkSeek(seek);return seek;}
  }
  private void prepared(Reply reply,Raster raster,long expected,long seek,String key,boolean speculative){
    try{requestSeek(expected,seek,key);if(speculative)synchronized(cacheLock){clearPrefetches++;}
      reply.complete(new JSONObject().put("url",raster.url).put("width",raster.width).put("height",raster.height).put("decodedBytes",raster.bitmap.getAllocationByteCount()).put("native",true),null);
    }catch(Exception error){reply.complete(null,error);}
  }
  void prepare(JSONObject args,Reply reply){
    final long requestSession=args.optLong("session",-1);
    final int targetW=Math.max(1,args.optInt("width",getResources().getDisplayMetrics().widthPixels));
    final int targetH=Math.max(1,args.optInt("height",getResources().getDisplayMetrics().heightPixels));
    final boolean speculative=args.optBoolean("prefetch");
    final long expectedSeek=args.optLong("seek",-1);
    final String key=args.optString("workKey");
    final long expected;synchronized(cacheLock){expected=requestSession==-1?-2-(++warmGeneration):generation;}
    (speculative&&concurrency>1?prefetch:foreground).execute(speculative?1:0,()->{
      try{
        if(stopped||(requestSession!=-1&&requestSession!=session))throw new IOException("阅读请求已取消。");
        requestSeek(expected,expectedSeek,key);
        String url=args.optString("url");
        if(url.isEmpty())url=((JSONObject)library.call("getPageImage",args)).getString("url");
        synchronized(cacheLock){requestSeek(expected,expectedSeek,key);library.beginReaderSession();if(!key.isEmpty()){pageKeys.put(url,key);while(pageKeys.size()>512)pageKeys.remove(pageKeys.keySet().iterator().next());}}
        Raster raster=load(url,targetW,targetH,expected,requestSeek(expected,expectedSeek,key),key,speculative);
        if(raster.preview){
          // A prepared reply means clear pixels are ready. Never block the
          // foreground executor waiting for a refinement queued on itself.
          CompletableFuture<Raster> ready;synchronized(cacheLock){
            Raster latest=cache.get(raster.url);if(latest!=null&&!latest.preview){prepared(reply,latest,expected,expectedSeek,key,speculative);return;}
            promote(raster,null,raster.orientation>=5?raster.height:raster.width,raster.orientation>=5?raster.width:raster.height,raster.fullSample);ready=raster.clearFuture;
          }
          if(ready==null)throw new IOException("清晰图预读暂未完成。");
          ready.whenComplete((full,error)->{if(error!=null)reply.complete(null,new IOException("清晰图预读已取消或失败。",error));else prepared(reply,full,expected,expectedSeek,key,speculative);});
        }else prepared(reply,raster,expected,expectedSeek,key,speculative);
      }catch(Exception error){reply.complete(null,error);}catch(OutOfMemoryError memory){reply.complete(null,new IOException("图片过大，请降低阅读图片缓存后重试。"));}
    });
  }
  private boolean validGeneration(long expected){return !stopped&&(expected==-1||(expected>=0?expected==generation:-expected-2==warmGeneration));}
  private void checkGeneration(long expected)throws IOException{
    if(!validGeneration(expected)){synchronized(cacheLock){cancelledLoads++;}throw new IOException("阅读请求已取消。");}
  }
  private Raster load(String url,int targetW,int targetH,long expected)throws Exception{
    return load(url,targetW,targetH,expected,expected>=0?seekGeneration:-1);
  }
  private Raster load(String url,int targetW,int targetH,long expected,long seek)throws Exception{
    String key;synchronized(cacheLock){key=pageKeys.getOrDefault(url,"");}
    return load(url,targetW,targetH,expected,seek,key,false);
  }
  private Raster load(String url,int targetW,int targetH,long expected,long seek,String key,boolean clear)throws Exception{
    checkGeneration(expected);
    PendingRaster work;boolean owner=false;
    synchronized(cacheLock){
      seek=requestSeek(expected,seek,key);
      Raster cached=cache.get(url);if(cached!=null){
        bitmapHits++;
        if(!key.isEmpty()&&cached.request!=null){
          cached.request.key=key;RasterWrite write=pendingWrites.get(url);if(write!=null)write.key=key;
        }
        if(cached.preview){
          if(expected>=0||cached.request.generation<0||!validGeneration(cached.request.generation))cached.request.generation=expected;
          if(seek>=0)cached.request.seek=seek;
          promote(cached,null,cached.orientation>=5?cached.height:cached.width,cached.orientation>=5?cached.width:cached.height,cached.fullSample);
        }
        return cached;
      }
      work=pending.get(url);if(work==null||!validGeneration(work.generation)){work=new PendingRaster(expected,seek);pending.put(url,work);owner=true;}
      // The real reader adopts its first-page warm-up. A later speculative
      // book must not cancel work now needed by the visible reader.
      else if(expected>=0&&work.generation<-1)work.generation=expected;
      if(seek>=0)work.seek=seek;
      if(!key.isEmpty())work.key=key;
    }
    if(!owner)return work.future.get();
    try{
      long restoreStart=SystemClock.uptimeMillis();
      Raster restored=restoreRaster(url,targetW,targetH,work);
      if(restored!=null){
        synchronized(cacheLock){rasterSourceSkips++;}
        publishRaster(url,restored,work,0,SystemClock.uptimeMillis()-restoreStart);
        return restored;
      }
      long start=SystemClock.uptimeMillis();byte[] data=library.readerImage(url);long readTime=SystemClock.uptimeMillis()-start;start=SystemClock.uptimeMillis();
      checkWork(work);
      BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,bounds);
      if(bounds.outWidth<=0||bounds.outHeight<=0||(long)bounds.outWidth*bounds.outHeight>100000000L)throw new IOException("图片尺寸超出上限。");
      int orientation=1;try{orientation=new android.media.ExifInterface(new ByteArrayInputStream(data)).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,1);}catch(IOException ignored){}
      if(orientation<1||orientation>8)orientation=1;
      int displayWidth=orientation>=5?bounds.outHeight:bounds.outWidth,displayHeight=orientation>=5?bounds.outWidth:bounds.outHeight;
      int sample=sampleFor(displayWidth,displayHeight,targetW,targetH);
      byte[] filtered=sample>1?library.readerRaster(url,sample):null;
      LocalLibrary.ReaderPreview thumbnail=!clear&&filtered==null&&(long)bounds.outWidth*bounds.outHeight>16000000L?library.readerPreview(url):null;
      Bitmap bitmap=thumbnail==null?null:BitmapFactory.decodeByteArray(thumbnail.bytes,0,thumbnail.bytes.length);
      boolean preview=bitmap!=null;int fullSample=sample;
      if(preview)sample=Math.max(1,Math.round((float)(thumbnail.oriented?displayWidth:bounds.outWidth)/bitmap.getWidth()));
      else {final PendingRaster request=work;bitmap=decodeRaster(url,data,sample,filtered,()->checkWork(request),bounds.outWidth,bounds.outHeight,orientation);}
      if(!preview||!thumbnail.oriented)bitmap=orient(bitmap,orientation);
      Raster raster=new Raster(url,bitmap,bounds.outWidth,bounds.outHeight,sample,orientation);bitmap.setHasMipMap(true);bitmap.prepareToDraw();
      raster.preview=preview;raster.request=work;raster.fullSample=fullSample;
      raster.persistable=fullSample>1&&data.length>8&&data[0]==(byte)137&&data[1]==80;
      if(filtered!=null&&!preview)raster.persistedEpoch=library.readerRasterEpoch();
      publishRaster(url,raster,work,readTime,SystemClock.uptimeMillis()-start);
      if(preview)promote(raster,data,bounds.outWidth,bounds.outHeight,fullSample);
      return raster;
    }catch(Throwable error){synchronized(cacheLock){if(pending.get(url)==work)pending.remove(url);}work.future.completeExceptionally(error);if(error instanceof OutOfMemoryError)throw (OutOfMemoryError)error;throw error instanceof Exception?(Exception)error:new IOException(error);}
  }
  private int sampleFor(int width,int height,int targetW,int targetH){
    int sample=1;long pixels=Math.min(4000000L,Math.max(1000000L,(long)(targetW*1.5)*targetH));
    while((long)(width/sample)*(height/sample)>pixels||width/sample>targetW*2||height/sample>targetH*2)sample*=2;
    return sample;
  }
  private Raster restoreRaster(String url,int targetW,int targetH,PendingRaster work)throws IOException{
    JSONObject info=library.readerRasterInfo(url);if(info==null)return null;
    int w=info.optInt("width"),h=info.optInt("height"),orientation=info.optInt("orientation",1);
    if(w<=0||h<=0||(long)w*h>100000000L||orientation<1||orientation>8)return null;
    int sample=sampleFor(orientation>=5?h:w,orientation>=5?w:h,targetW,targetH);
    byte[] saved=library.readerRaster(url,sample);if(saved==null)return null;
    Bitmap bitmap=BitmapFactory.decodeByteArray(saved,0,saved.length);if(bitmap==null)return null;
    checkWork(work);bitmap=orient(bitmap,orientation);bitmap.setHasMipMap(true);bitmap.prepareToDraw();
    Raster raster=new Raster(url,bitmap,w,h,sample,orientation);raster.request=work;raster.fullSample=sample;
    raster.persistable=true;raster.persistedEpoch=library.readerRasterEpoch();
    synchronized(cacheLock){rasterDiskHits++;}return raster;
  }
  private void publishRaster(String url,Raster raster,PendingRaster work,long readTime,long decodeTime)throws IOException{
    // Keep only a tiny derived image if the full neighbour is later evicted.
    // Scaling runs on the decode worker, never during a UI draw or cache trim.
    if(work.seek>=0)rememberPreview(raster,work);
    synchronized(cacheLock){checkWork(work);bitmapDecodes++;readMs+=readTime;decodeMs+=decodeTime;Raster old=cache.put(url,raster);bytes+=raster.bitmap.getAllocationByteCount()-(old==null?0:old.bitmap.getAllocationByteCount());if(pending.get(url)==work)pending.remove(url);trim();}
    work.future.complete(raster);
    // A cached neighbour can complete without changing the body geometry.
    // Wake both native surfaces so it appears in the filmstrip immediately.
    post(()->{if(!stopped&&active){if(pendingFrame!=null)commitFrame();invalidate();}});
  }
  private void rememberPreview(Raster raster,PendingRaster work)throws IOException{
    checkWork(work);
    try{
      float factor=Math.min(1f,320f/Math.max(raster.bitmap.getWidth(),raster.bitmap.getHeight()));
      Bitmap small=Bitmap.createScaledBitmap(raster.bitmap,Math.max(1,Math.round(raster.bitmap.getWidth()*factor)),Math.max(1,Math.round(raster.bitmap.getHeight()*factor)),true);
      Raster preview=new Raster(raster.url,small,raster.orientation>=5?raster.height:raster.width,raster.orientation>=5?raster.width:raster.height,raster.sample,raster.orientation);
      synchronized(cacheLock){
        checkWork(work);Raster old=previewCache.put(raster.url,preview);previewBytes+=small.getAllocationByteCount()-(old==null?0:old.bitmap.getAllocationByteCount());
        Iterator<Raster> it=previewCache.values().iterator();while(previewBytes>4L*1024*1024&&it.hasNext()){previewBytes-=it.next().bitmap.getAllocationByteCount();it.remove();}
      }
    }catch(OutOfMemoryError ignored){/* Optional thumbnail; the body remains usable. */}
  }
  private Bitmap decodeRaster(String url,byte[] data,int sample,byte[] saved,ReaderBitmapDecoder.Check check,int width,int height,int orientation)throws IOException {
    long diskEpoch=library.readerRasterEpoch();
    if(saved!=null){Bitmap bitmap=BitmapFactory.decodeByteArray(saved,0,saved.length);if(bitmap!=null){check.run();synchronized(cacheLock){rasterDiskHits++;}prefetch.execute(3,()->library.saveReaderRasterInfo(url,width,height,orientation));return bitmap;}}
    Bitmap result=ReaderBitmapDecoder.decode(data,sample,check);
    if(sample>1&&data.length>8&&data[0]==(byte)137&&data[1]==80){
      enqueueRasterWrite(new RasterWrite(url,result,sample,width,height,orientation,diskEpoch));
    }
    return result;
  }
  private void enqueueRasterWrite(RasterWrite write){
    synchronized(cacheLock){
      if(stopped)return;
      PendingRaster work=pending.get(write.url);Raster cached=cache.get(write.url);
      if(work!=null)write.key=work.key;else if(cached!=null&&cached.request!=null)write.key=cached.request.key;
      pendingWrites.remove(write.url);pendingWrites.put(write.url,write);
      while(pendingWrites.size()>2){RasterWrite worst=null;for(RasterWrite item:pendingWrites.values())if(worst==null||writeRank(item)>=writeRank(worst))worst=item;pendingWrites.remove(worst.url);}
      scheduleRasterWrite(600);
    }
  }
  private void rememberVisibleRaster(Raster raster){
    synchronized(cacheLock){
      long epoch=library.readerRasterEpoch();
      if(!raster.persistable||raster.preview||raster.persistedEpoch==epoch)return;
      RasterWrite write=new RasterWrite(raster.url,raster.bitmap,raster.sample,raster.orientation>=5?raster.height:raster.width,raster.orientation>=5?raster.width:raster.height,raster.orientation,epoch);
      write.oriented=true;enqueueRasterWrite(write);
    }
  }
  private int writeRank(RasterWrite write){return pinned.contains(write.url)?-1:workingKeys.getOrDefault(write.key,Integer.MAX_VALUE);}
  private void scheduleRasterWrite(long delay){
    if(writeScheduled||stopped||pendingWrites.isEmpty())return;
    writeScheduled=true;rasterWrites.schedule(this::writeRasterWhenIdle,delay,TimeUnit.MILLISECONDS);
  }
  private void writeRasterWhenIdle(){
    RasterWrite write;
    synchronized(cacheLock){
      writeScheduled=false;if(stopped||pendingWrites.isEmpty())return;
      if(SystemClock.uptimeMillis()-lastNavigation<600||foreground.getActiveCount()>0||prefetch.getActiveCount()>0||!foreground.getQueue().isEmpty()||!prefetch.getQueue().isEmpty()){
        deferredRasterWrites++;scheduleRasterWrite(200);return;
      }
      write=null;for(RasterWrite candidate:pendingWrites.values())if(write==null||writeRank(candidate)<writeRank(write))write=candidate;
      pendingWrites.remove(write.url);
    }
    // Weak references prevent deferred encoding from pinning evicted pages or
    // retaining a whole book after exit. One running encoding is bounded.
    Bitmap bitmap=write.bitmap.get(),unoriented=null;
    try{
      boolean saved=library.hasReaderRaster(write.url,write.sample);
      if(!saved&&bitmap!=null){
        if(write.oriented&&write.orientation!=1){Matrix inverse=new Matrix();orientationMatrix(write.orientation).invert(inverse);unoriented=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),inverse,true);}
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        if((unoriented==null?bitmap:unoriented).compress(Bitmap.CompressFormat.PNG,100,out)){
          library.persistReaderRaster(write.url,write.sample,out.toByteArray(),write.width,write.height,write.orientation,write.epoch);
          saved=library.hasReaderRaster(write.url,write.sample);if(saved)synchronized(cacheLock){rasterWriteCount++;}
        }
      }
      if(saved)synchronized(cacheLock){Raster cached=cache.get(write.url);if(cached!=null&&cached.sample==write.sample)cached.persistedEpoch=write.epoch;}
    }catch(Exception|OutOfMemoryError ignored){}
    finally{if(unoriented!=null&&unoriented!=bitmap)unoriented.recycle();}
    synchronized(cacheLock){scheduleRasterWrite(200);}
  }
  private void promote(Raster preview,byte[] data,int width,int height,int sample){
    // Queued/cancelled previews must not pin a 10-60 MB encoded PNG each.
    final java.lang.ref.WeakReference<byte[]> encodedHint=new java.lang.ref.WeakReference<>(data);
    final int priority;final CompletableFuture<Raster> completion;
    synchronized(cacheLock){if(preview.promoting||preview.refinementAttempts>=3||SystemClock.uptimeMillis()<preview.retryAfter)return;preview.promoting=true;preview.clearFuture=completion=new CompletableFuture<>();priority=pinned.contains(preview.url)?0:1;}
    // A visible page's clear bitmap must not wait behind neighbour decoding.
    foreground.execute(priority,()->{
      try{
        checkWork(preview.request);synchronized(cacheLock){if(cache.get(preview.url)!=preview)throw new IOException("阅读请求已取消。");}
        byte[] encoded=encodedHint.get();if(encoded==null)encoded=library.readerImage(preview.url);
        checkWork(preview.request);
        long started=SystemClock.uptimeMillis();Bitmap bitmap=orient(decodeRaster(preview.url,encoded,sample,library.readerRaster(preview.url,sample),()->checkWork(preview.request),width,height,preview.orientation),preview.orientation);
        Raster full=new Raster(preview.url,bitmap,width,height,sample,preview.orientation);full.request=preview.request;full.persistable=preview.persistable;bitmap.setHasMipMap(true);bitmap.prepareToDraw();
        synchronized(cacheLock){checkWork(preview.request);if(cache.get(preview.url)!=preview)throw new IOException("阅读请求已取消。");cache.put(preview.url,full);bytes+=bitmap.getAllocationByteCount()-preview.bitmap.getAllocationByteCount();bitmapDecodes++;refinements++;decodeMs+=SystemClock.uptimeMillis()-started;trim();}
        completion.complete(full);
        post(()->{if(current!=null)for(Slot slot:current.slots)if(slot.raster==preview){slot.raster=full;rememberVisibleRaster(full);}if(pendingFrame!=null)for(Slot slot:pendingFrame.slots)if(slot.raster==preview)slot.raster=full;invalidate();});
      }catch(Exception|OutOfMemoryError error){
        completion.completeExceptionally(error);
        synchronized(cacheLock){
          boolean cancelled=!validGeneration(preview.request.generation)||(preview.request.seek>=0&&preview.request.seek!=seekGeneration)||error.getMessage()!=null&&error.getMessage().contains("已取消");
          if(cancelled)refinementCancellations++;
          else{refinementFailures++;preview.refinementAttempts++;preview.retryAfter=SystemClock.uptimeMillis()+250L*preview.refinementAttempts;android.util.Log.w("OmiComic","Clear page refinement failed (attempt "+preview.refinementAttempts+")",error);
            if(preview.refinementAttempts==3)post(()->{if(active&&current!=null)for(Slot slot:current.slots)if(slot.raster==preview){android.widget.Toast.makeText(getContext(),"此页清晰图加载失败，请重新打开漫画重试。",android.widget.Toast.LENGTH_LONG).show();break;}});
          }
        }
      }finally{
        synchronized(cacheLock){preview.promoting=false;}
        postDelayed(this::refineVisiblePages,Math.max(0,preview.retryAfter-SystemClock.uptimeMillis()));
      }
    });
  }
  private void refineVisiblePages(){
    if(stopped||!active||current==null||pendingFrame!=null)return;
    for(Slot slot:current.slots){Raster raster=slot.raster;if(raster==null||!raster.preview)continue;
      synchronized(cacheLock){
        if(cache.get(raster.url)!=raster)continue;
        if(raster.request.generation!=generation||raster.request.seek!=seekGeneration){raster.refinementAttempts=0;raster.retryAfter=0;}
        raster.request.generation=generation;raster.request.seek=seekGeneration;
      }
      promote(raster,null,raster.orientation>=5?raster.height:raster.width,raster.orientation>=5?raster.width:raster.height,raster.fullSample);
    }
  }
  private static Matrix orientationMatrix(int orientation){Matrix matrix=new Matrix();switch(orientation){case 2:matrix.setScale(-1,1);break;case 3:matrix.setRotate(180);break;case 4:matrix.setScale(1,-1);break;case 5:matrix.setRotate(90);matrix.postScale(-1,1);break;case 6:matrix.setRotate(90);break;case 7:matrix.setRotate(-90);matrix.postScale(-1,1);break;case 8:matrix.setRotate(-90);break;}return matrix;}
  private static Bitmap orient(Bitmap source,int orientation){if(orientation==1)return source;Bitmap rotated=Bitmap.createBitmap(source,0,0,source.getWidth(),source.getHeight(),orientationMatrix(orientation),true);return rotated;}
  private byte[] preview(String url)throws IOException{
    Raster raster;synchronized(cacheLock){raster=cache.get(url);}if(raster==null||stopped)return null;
    // This runs on WebView's media worker, never the Android UI thread. The
    // reader owns the source bitmap; only the small temporary bitmap is freed.
    Bitmap source=raster.bitmap;float factor=Math.min(1f,480f/Math.max(source.getWidth(),source.getHeight()));
    Bitmap small=Bitmap.createScaledBitmap(source,Math.max(1,Math.round(source.getWidth()*factor)),Math.max(1,Math.round(source.getHeight()*factor)),true);
    try{
      ByteArrayOutputStream output=new ByteArrayOutputStream();
      if(!small.compress(Bitmap.CompressFormat.JPEG,80,output))throw new IOException("预览生成失败。");
      synchronized(cacheLock){previewHits++;}return output.toByteArray();
    }finally{if(small!=source)small.recycle();}
  }
  private void trim(){
    // Visible pages stay pinned even with caching disabled. Do not recycle a
    // bitmap still referenced by a queued hardware display list.
    // Evict outside the moving window first, then its farthest/lowest-priority
    // neighbour. Loading a distant page must not evict the very next page.
    List<Raster> candidates=new ArrayList<>(cache.values());
    candidates.sort((a,b)->Integer.compare(workingKeys.getOrDefault(b.request==null?"":b.request.key,Integer.MAX_VALUE),workingKeys.getOrDefault(a.request==null?"":a.request.key,Integer.MAX_VALUE)));
    long now=SystemClock.uptimeMillis();
    for(Raster raster:candidates){if(bytes+displayBytes<=budget)break;if(pinned.contains(raster.url)||(cache.size()<=2&&now-raster.created<1500))continue;cache.remove(raster.url);bytes-=raster.bitmap.getAllocationByteCount();}
    Iterator<Map.Entry<String,Tile>> ti=tiles.entrySet().iterator();while(tileBytes>tileBudget()&&ti.hasNext()){Map.Entry<String,Tile> tile=ti.next();if(visibleTiles.contains(tile.getKey()))continue;tileBytes-=tile.getValue().bitmap.getAllocationByteCount();ti.remove();}
  }
  private long tileBudget(){return Math.min(24L*1024*1024,Math.max(4L*1024*1024,budget/4));}
  void frame(JSONObject args){
    if(!active||args.optLong("session")!=session||getWidth()==0)return;
    long sequence=args.optLong("sequence",frameSequence+1);if(sequence<=frameSequence)return;frameSequence=sequence;
    if(queuedGeometry!=null)coalescedFrames++;queuedGeometry=args;
    if(frameScheduled)return;frameScheduled=true;
    // WebView may send several geometry updates before the next display frame.
    // Draw only the latest one, rather than visibly replaying stale positions.
    postOnAnimation(()->{frameScheduled=false;JSONObject next=queuedGeometry;queuedGeometry=null;if(next!=null&&active&&next.optLong("session")==session)applyFrame(next);});
  }
  private void applyFrame(JSONObject args){
    try{
      float factor=getWidth()/(float)args.getDouble("viewportWidth");
      Frame next=new Frame();next.clip=rect(args.getJSONArray("clip"),factor);next.panorama=args.optBoolean("panorama");next.restoring=args.optBoolean("restoring");next.zoom=(float)Math.max(.5,Math.min(6,args.optDouble("zoom",1)));
      List<Slot> nextPreviews=new ArrayList<>();JSONArray previewRects=args.optJSONArray("previews");
      if(previewRects!=null)for(int i=0;i<previewRects.length()&&i<12;i++){JSONObject item=previewRects.getJSONObject(i);Slot p=new Slot();p.url=item.getString("url");p.rect=rect(item.getJSONArray("rect"),factor);p.clip=rect(item.getJSONArray("clip"),factor);nextPreviews.add(p);}
      previews=nextPreviews;previewOverlay.invalidate();
      JSONArray slots=args.getJSONArray("slots");
      if(slots.length()==0&&args.optBoolean("nativeExpected")&&current!=null)return;
      synchronized(cacheLock){
        pinned.clear();if(current!=null)for(Slot slot:current.slots)pinned.add(slot.url);
        for(int i=0;i<slots.length()&&i<48;i++){JSONObject item=slots.getJSONObject(i);Slot slot=new Slot();slot.url=item.getString("url");slot.rect=rasterRect(item.getJSONArray("rect"),factor);slot.alpha=(float)item.optDouble("alpha",1);slot.raster=cache.get(slot.url);next.slots.add(slot);pinned.add(slot.url);}
      }
      pendingFrame=next;commitFrame();
    }catch(Exception invalid){android.util.Log.w("OmiComic","Invalid reader geometry",invalid);}
  }
  private static RectF rect(JSONArray a,float scale)throws JSONException{return new RectF((float)a.getDouble(0)*scale,(float)a.getDouble(1)*scale,(float)a.getDouble(2)*scale,(float)a.getDouble(3)*scale);}
  private static RectF rasterRect(JSONArray a,float scale)throws JSONException{RectF r=rect(a,scale);float left=Math.round(r.left),top=Math.round(r.top);return new RectF(left,top,left+Math.round(r.width()),top+Math.round(r.height()));}
  private void followPendingPanorama(){
    if(current==null||pendingFrame==null||!pendingFrame.panorama)return;
    Map<String,Slot> latest=new HashMap<>();for(Slot slot:pendingFrame.slots)latest.put(slot.url,slot);
    Slot before=null,after=null;
    for(Slot slot:current.slots){Slot next=latest.get(slot.url);if(next!=null&&slot.raster!=null){before=slot;after=next;break;}}
    if(before==null)return;
    float dx=after.rect.left-before.rect.left,dy=after.rect.top-before.rect.top;
    Frame following=new Frame();following.clip=pendingFrame.clip;following.panorama=true;following.zoom=pendingFrame.zoom;following.restoring=pendingFrame.restoring;Set<String> drawn=new HashSet<>();
    // Retain decoded pixels while following the latest finger position. Waiting
    // for a new neighbour must never freeze or replay the whole strip's pose.
    for(Slot old:current.slots){
      Slot next=latest.get(old.url),slot=new Slot();slot.url=old.url;slot.raster=next!=null&&next.raster!=null?next.raster:old.raster;
      slot.rect=next==null?new RectF(old.rect):new RectF(next.rect);if(next==null)slot.rect.offset(dx,dy);slot.alpha=next==null?old.alpha:next.alpha;
      if(slot.raster!=null&&RectF.intersects(slot.rect,following.clip)){following.slots.add(slot);drawn.add(slot.url);}
    }
    for(Slot slot:pendingFrame.slots)if(slot.raster!=null&&!drawn.contains(slot.url))following.slots.add(slot);
    if(!following.slots.isEmpty()){current=following;movingRetainedFrames++;}
  }
  private void commitFrame(){
    if(pendingFrame==null)return;
    boolean complete=true;
    for(Slot slot:pendingFrame.slots){
      if(slot.raster==null){synchronized(cacheLock){slot.raster=cache.get(slot.url);}}
      if(slot.raster==null){complete=false;final long expected=generation,seek=seekGeneration;final String url=slot.url;
        synchronized(cacheLock){if(pending.containsKey(url))continue;}
        foreground.execute(0,()->{try{load(url,getWidth(),getHeight(),expected,seek);post(()->{if(expected==generation){commitFrame();invalidate();}});}catch(Exception|OutOfMemoryError ignored){}});
      }
    }
    if(complete){current=pendingFrame;pendingFrame=null;synchronized(cacheLock){pinned.clear();for(Slot slot:current.slots){pinned.add(slot.url);rememberVisibleRaster(slot.raster);}trim();}refineVisiblePages();}
    else {retainedFrames++;followPendingPanorama();}
    invalidate();
  }
  @Override protected void onDraw(Canvas canvas){
    super.onDraw(canvas);if(!active)return;canvas.drawColor(background);
    Frame frame=current;if(frame==null||frame.slots.isEmpty()){emptyFrames++;return;}drawnFrames++;
    long now=SystemClock.uptimeMillis();
    if(Math.abs(frame.zoom-lastQualityZoom)>.0001f){lastQualityZoom=frame.zoom;lastZoomTime=now;}
    // Geometry continues every frame, but quality work belongs to a completed
    // zoom gesture. Keep the last complete level through pauses and restore.
    boolean holdQuality=frame.restoring||now-lastZoomTime<ZOOM_QUIET_MS;
    if(holdQuality)postInvalidateDelayed(ZOOM_QUIET_MS);
    if(frame.restoring&&!wasRestoring)restoreTilePlans=new HashMap<>(completeTilePlans);
    if(frame.restoring&&!restoreTilePlans.isEmpty())restoreQualityFrames++;
    wasRestoring=frame.restoring;
    List<TilePlan> plans=new ArrayList<>();Set<String> wanted=new HashSet<>();visibleAdjustments.clear();
    Set<String> pageUrls=new HashSet<>();
    for(Slot slot:frame.slots){
      pageUrls.add(slot.url);
      TilePresentation shown=tilePresentations.get(slot.url);
      if(shown==null){shown=new TilePresentation();tilePresentations.put(slot.url,shown);}
      if(shown.started>0&&now-shown.started>=QUALITY_FADE_MS){shown.previous=null;shown.started=0;}
      // Both quality levels share the existing tile budget. Do not prepare a
      // third level while the preceding blend is still on screen.
      TilePlan plan=holdQuality?null:shown.started>0?shown.current:frame.zoom>1.01f?tilePlan(slot,frame.clip,tileBudget()/Math.max(1,frame.slots.size())):null;
      if(!holdQuality&&plan==null&&frame.zoom>1.01f)plan=shown.current;
      plans.add(plan);if(plan!=null)wanted.addAll(plan.keys);if(slot.raster!=null)visibleAdjustments.add(slot.raster.url+":"+slot.raster.sample+effectsKey);
      if(shown.current!=null)wanted.addAll(shown.current.keys);
      if(shown.previous!=null)wanted.addAll(shown.previous.keys);
    }
    tilePresentations.keySet().retainAll(pageUrls);completeTilePlans.keySet().retainAll(pageUrls);
    for(String key:wanted)visibleAdjustments.add(key+effectsKey);
    synchronized(cacheLock){visibleTiles.clear();visibleTiles.addAll(wanted);trim();}
    canvas.save();canvas.clipRect(frame.clip);
    for(int i=0;i<frame.slots.size();i++){Slot slot=frame.slots.get(i);
      Raster raster=slot.raster;if(raster==null)continue;
      paint.setAlpha(Math.round(slot.alpha*255));
      // Decode-time low-pass plus mipmaps is the final fit-size presentation.
      // Never replace a visible page with a second, asynchronously filtered copy.
      Bitmap base=adjust(raster.url+":"+raster.sample,raster.bitmap);canvas.drawBitmap(base,null,slot.rect,paint);
      TilePresentation shown=tilePresentations.get(slot.url);TilePlan target=plans.get(i);
      if(!holdQuality&&shown.started==0&&!sameTiles(shown.current,target)&&tilesReady(target,true)){
        shown.previous=shown.current;shown.current=target;shown.started=now;
      }
      float mix=shown.started==0?1:Math.min(1,(now-shown.started)/(float)QUALITY_FADE_MS);mix=mix*mix*(3-2*mix);
      if(shown.started>0){qualityBlendFrames++;if(Math.abs(frame.zoom-1)<.001f)restoreFadeFrames++;postInvalidateOnAnimation();}
      if(shown.previous!=null){paint.setAlpha(Math.round(slot.alpha*(shown.current==null?1-mix:1)*255));drawTiles(canvas,atSlot(shown.previous,slot),false);}
      if(shown.current!=null){paint.setAlpha(Math.round(slot.alpha*mix*255));drawTiles(canvas,atSlot(shown.current,slot),false);completeTilePlans.put(slot.url,shown.current);}
      else completeTilePlans.remove(slot.url);
    }
    canvas.restore();
    if(!holdQuality)restoreTilePlans.clear();
  }
  private static boolean sameTiles(TilePlan left,TilePlan right){return left==right||left!=null&&right!=null&&left.keys.equals(right.keys);}
  private TilePlan atSlot(TilePlan old,Slot slot){
    TilePlan plan=new TilePlan();plan.slot=slot;plan.sample=old.sample;plan.filterBucket=old.filterBucket;plan.regions=old.regions;plan.keys=old.keys;plan.bytes=old.bytes;return plan;
  }
  private boolean tilesReady(TilePlan plan,boolean requestMissing){return plan==null||drawTiles(null,plan,requestMissing);}
  private TilePlan tilePlan(Slot slot,RectF clip,long allocation){
    Raster raster=slot.raster;
    if(raster==null||raster.preview||raster.sample<=1||slot.rect.width()<=0||slot.rect.height()<=0)return null;
    float scale=Math.max(slot.rect.width()/raster.width,slot.rect.height()/raster.height);
    // At fit size the filtered base already supplies the screen's detail. Never
    // force a sharper level merely because the source was sampled at decode.
    if(raster.sample*scale<=1.25f)return null;
    int sample=1;while(sample*2<=raster.sample&&sample*2*scale<=1)sample*=2;
    RectF visible=new RectF(slot.rect);if(!visible.intersect(clip))return null;
    while(sample<raster.sample){
    TilePlan plan=new TilePlan();plan.slot=slot;plan.sample=sample;
    float tileRatio=Math.min(slot.rect.width()/raster.width,slot.rect.height()/raster.height)*sample;
    plan.filterBucket=tileRatio>=.98f?16:Math.max(8,(int)Math.floor(tileRatio*16));
    int unit=512*sample;
    int left=Math.max(0,(int)((visible.left-slot.rect.left)/slot.rect.width()*raster.width)/unit*unit);
    int top=Math.max(0,(int)((visible.top-slot.rect.top)/slot.rect.height()*raster.height)/unit*unit);
    int right=Math.min(raster.width,(int)Math.ceil((visible.right-slot.rect.left)/slot.rect.width()*raster.width));
    int bottom=Math.min(raster.height,(int)Math.ceil((visible.bottom-slot.rect.top)/slot.rect.height()*raster.height));
    for(int y=top;y<bottom;y+=unit)for(int x=left;x<right;x+=unit){
      Rect region=new Rect(x,y,Math.min(raster.width,x+unit),Math.min(raster.height,y+unit));plan.regions.add(region);plan.keys.add(raster.url+":"+sample+":"+x+":"+y+":"+plan.filterBucket);
      plan.bytes+=(long)((region.width()+sample-1)/sample)*((region.height()+sample-1)/sample)*4;
    }
    long retained=0;TilePresentation shown=tilePresentations.get(slot.url);
    if(shown!=null&&shown.current!=null)for(int i=0;i<shown.current.keys.size();i++){
      if(plan.keys.contains(shown.current.keys.get(i)))continue;
      Rect region=shown.current.regions.get(i);int previousSample=shown.current.sample;
      retained+=(long)((region.width()+previousSample-1)/previousSample)*((region.height()+previousSample-1)/previousSample)*4;
    }
    if(plan.bytes+retained<=allocation)return plan;
    sample*=2;
    }
    return null;
  }
  private boolean drawTiles(Canvas canvas,TilePlan plan,boolean requestMissing){
    if(plan==null)return false;Slot slot=plan.slot;Raster raster=slot.raster;
    List<Rect> missing=new ArrayList<>();List<String> keys=new ArrayList<>();List<Tile> ready=new ArrayList<>();boolean complete=true;
    synchronized(cacheLock){for(int i=0;i<plan.keys.size();i++){String key=plan.keys.get(i);Tile tile=tiles.get(key);ready.add(tile);if(tile==null){complete=false;if(requestMissing&&!tilesPending.containsKey(key)&&!failedTiles.contains(key)){tilesPending.put(key,generation);missing.add(plan.regions.get(i));keys.add(key);}}}}
    List<Bitmap> processed=new ArrayList<>();
    if(complete)for(int i=0;i<ready.size();i++){String key=plan.keys.get(i);processed.add(adjust(key,ready.get(i).bitmap));if(NativeImageAdjustments.changed(effects)&&!adjusted.containsKey(key+effectsKey))complete=false;}
    // Replace the visible region as one complete quality level, never a mosaic
    // of old/new tiles. The filtered base stays intact while any tile is missing.
    if(complete&&canvas!=null)for(int i=0;i<ready.size();i++){
      Rect region=plan.regions.get(i);RectF dst=new RectF(slot.rect.left+(float)region.left/raster.width*slot.rect.width(),slot.rect.top+(float)region.top/raster.height*slot.rect.height(),slot.rect.left+(float)region.right/raster.width*slot.rect.width(),slot.rect.top+(float)region.bottom/raster.height*slot.rect.height());canvas.drawBitmap(processed.get(i),null,dst,paint);
    }
    if(missing.isEmpty()||!requestMissing)return complete;
    final int resolution=plan.sample,filterBucket=plan.filterBucket;final long expected=generation;
    prefetch.execute(2,()->{
      BitmapRegionDecoder decoder=null;
      List<Tile> decoded=new ArrayList<>();List<String> decodedKeys=new ArrayList<>();
      try{
        if(stopped||expected!=generation)return;
        byte[] data=library.readerImage(raster.url);decoder=BitmapRegionDecoder.newInstance(data,0,data.length,false);
        boolean png=data.length>8&&data[0]==(byte)137&&data[1]==80;
        for(int i=0;i<missing.size();i++){
          synchronized(cacheLock){if(stopped||expected!=generation||!visibleTiles.contains(keys.get(i)))break;}
          Rect content=missing.get(i),coverage=new Rect(content);
          if(filterBucket<16){int halo=8*resolution;coverage.inset(-halo,-halo);coverage.intersect(0,0,raster.width,raster.height);}
          RectF raw=new RectF(coverage);raster.toOriginal.mapRect(raw);Rect region=new Rect();raw.roundOut(region);region.intersect(0,0,decoder.getWidth(),decoder.getHeight());
          Bitmap bitmap=ReaderBitmapDecoder.region(decoder,region,resolution,png,()->checkGeneration(expected));if(bitmap==null)continue;bitmap=orient(bitmap,raster.orientation);
          if(filterBucket<16){
            Bitmap filtered=DisplayResampler.prefilter(bitmap,filterBucket/16.,()->checkGeneration(expected));bitmap.recycle();
            int left=Math.round((content.left-coverage.left)/(float)resolution),top=Math.round((content.top-coverage.top)/(float)resolution);
            Bitmap cropped=Bitmap.createBitmap(filtered,left,top,Math.min((content.width()+resolution-1)/resolution,filtered.getWidth()-left),Math.min((content.height()+resolution-1)/resolution,filtered.getHeight()-top));
            if(cropped!=filtered)filtered.recycle();bitmap=cropped;
          }
          bitmap.setHasMipMap(true);bitmap.prepareToDraw();Tile tile=new Tile();tile.bitmap=bitmap;tile.source=content;
          decoded.add(tile);decodedKeys.add(keys.get(i));
        }
        // Publish a visible region together. Publishing each tile separately
        // made the upper part repeatedly sharpen while the rest was unchanged.
        synchronized(cacheLock){
          if(stopped||expected!=generation)return;
          for(int i=0;i<decoded.size();i++){if(!visibleTiles.contains(decodedKeys.get(i)))continue;Tile tile=decoded.get(i),old=tiles.put(decodedKeys.get(i),tile);tileBytes+=tile.bitmap.getAllocationByteCount()-(old==null?0:old.bitmap.getAllocationByteCount());tileDecodes++;if(filterBucket<16)tileFilterBuilds++;}
          trim();
        }
        postInvalidateOnAnimation();
      }catch(Exception|OutOfMemoryError ignored){synchronized(cacheLock){if(expected==generation){if(failedTiles.size()>1024)failedTiles.clear();failedTiles.addAll(keys);}}/* Keep the base without retrying unsupported tiles every frame. */}
      finally{if(decoder!=null)decoder.recycle();synchronized(cacheLock){for(String key:keys)if(Objects.equals(tilesPending.get(key),expected))tilesPending.remove(key);}}
    });
    return complete;
  }
  private void drawPreviews(Canvas canvas){
    previewRasterUrls.clear();
    if(!active||current==null)return;
    boolean missing=false;
    for(Slot preview:previews){
      Raster raster=null;for(Slot body:current.slots)if(body.url.equals(preview.url)){raster=body.raster;break;}
      if(raster==null)synchronized(cacheLock){raster=cache.get(preview.url);}
      if(raster==null)synchronized(cacheLock){raster=previewCache.get(preview.url);}
      if(raster==null){missing=true;continue;}
      RectF dst=new RectF(preview.rect);float fit=Math.min(dst.width()/raster.width,dst.height()/raster.height),w=raster.width*fit,h=raster.height*fit;
      float x=dst.centerX(),y=dst.centerY();dst.set(x-w/2,y-h/2,x+w/2,y+h/2);
      canvas.save();canvas.clipRect(preview.clip);Path rounded=new Path();rounded.addRoundRect(preview.rect,4*getResources().getDisplayMetrics().density,4*getResources().getDisplayMetrics().density,Path.Direction.CW);canvas.clipPath(rounded);
      paint.setAlpha(255);Bitmap bitmap=adjusted.get(raster.url+":"+raster.sample+effectsKey);canvas.drawBitmap(bitmap==null?raster.bitmap:bitmap,null,dst,paint);canvas.restore();sharedPreviewDraws++;previewRasterUrls.add(raster.url);
    }
    if(missing)restoreVisiblePreviews();
  }
  private void restoreVisiblePreviews(){
    // A frontend URL can outlive both native caches. Recover only genuinely
    // missing visible previews, behind foreground and neighbouring-page work.
    // Reuse the existing decode queue, cancellation tokens and memory budgets.
    Set<String> wanted=new HashSet<>();for(Slot slot:previews)wanted.add(slot.url);
    synchronized(cacheLock){previewRestoring.keySet().retainAll(wanted);previewRestoreFailed.retainAll(wanted);}
    final int width=getWidth(),height=getHeight();
    for(String url:wanted){
      final PendingRaster request;
      synchronized(cacheLock){
        if(cache.containsKey(url)||previewCache.containsKey(url)||previewRestoring.containsKey(url)||previewRestoreFailed.contains(url))continue;
        request=new PendingRaster(generation,seekGeneration);previewRestoring.put(url,request);
      }
      prefetch.execute(2,()->{
        try{
          checkWork(request);
          synchronized(cacheLock){if(previewRestoring.get(url)!=request||cache.containsKey(url)||previewCache.containsKey(url))return;}
          load(url,width,height,request.generation,request.seek);
          synchronized(cacheLock){previewRestores++;}
        }catch(Exception|OutOfMemoryError error){
          synchronized(cacheLock){if(validGeneration(request.generation)&&request.seek==seekGeneration&&previewRestoring.get(url)==request)previewRestoreFailed.add(url);}
        }finally{
          synchronized(cacheLock){if(previewRestoring.get(url)==request)previewRestoring.remove(url);}
          post(()->{if(active&&!stopped)invalidate();});
        }
      });
    }
  }
  private Bitmap adjust(String key,Bitmap source){
    if(!NativeImageAdjustments.changed(effects))return source;
    String cacheKey=key+effectsKey;Bitmap ready=adjusted.get(cacheKey);if(ready!=null)return ready;
    if(!adjusting.containsKey(cacheKey)){
      final String settingsKey=effectsKey;final JSONObject settings=effects;final long expected=generation;
      adjusting.put(cacheKey,expected);
      prefetch.execute(2,()->{
        Bitmap processed=null;try{if(expected==generation)processed=NativeImageAdjustments.apply(source,settings);}catch(OutOfMemoryError ignored){}
        final Bitmap result=processed;
        post(()->{if(Objects.equals(adjusting.get(cacheKey),expected))adjusting.remove(cacheKey);if(result==null||expected!=generation||!settingsKey.equals(effectsKey))return;adjusted.put(cacheKey,result);adjustedBytes+=result.getAllocationByteCount();Iterator<Map.Entry<String,Bitmap>> it=adjusted.entrySet().iterator();while(adjustedBytes>Math.max(8L*1024*1024,budget/3)&&it.hasNext()){Map.Entry<String,Bitmap> entry=it.next();if(visibleAdjustments.contains(entry.getKey()))continue;adjustedBytes-=entry.getValue().getAllocationByteCount();it.remove();}invalidate();});
      });
    }
    return source;
  }
  void trimMemory(){synchronized(cacheLock){Iterator<Map.Entry<String,Raster>> it=cache.entrySet().iterator();while(it.hasNext()){Map.Entry<String,Raster> e=it.next();if(!pinned.contains(e.getKey())){bytes-=e.getValue().bitmap.getAllocationByteCount();it.remove();}}tiles.clear();tileBytes=0;}tilePresentations.clear();completeTilePlans.clear();restoreTilePlans.clear();adjusted.clear();adjustedBytes=0;}
  JSONObject stats()throws JSONException{synchronized(cacheLock){return new JSONObject().put("active",active).put("drawnFrames",drawnFrames).put("emptyFrames",emptyFrames).put("retainedFrames",retainedFrames).put("bitmapDecodes",bitmapDecodes).put("bitmapHits",bitmapHits).put("tileDecodes",tileDecodes).put("decodeMs",decodeMs).put("readMs",readMs).put("bitmapBytes",bytes).put("tileBytes",tileBytes).put("displayRasterBytes",displayBytes).put("displayRasterBuilds",displayBuilds).put("displayRasterHits",displayHits).put("displayRasterBuildMs",displayBuildMs).put("tileFilterBuilds",tileFilterBuilds).put("budget",budget).put("visiblePages",current==null?0:current.slots.size()).put("previewHits",previewHits).put("sharedPreviewDraws",sharedPreviewDraws).put("rasterDiskHits",rasterDiskHits).put("rasterSourceSkips",rasterSourceSkips).put("refinements",refinements).put("refinementFailures",refinementFailures).put("refinementCancellations",refinementCancellations).put("previewRestores",previewRestores).put("previewSlots",previews.size()).put("previewRasterUrls",new JSONArray(previewRasterUrls)).put("tileBudget",tileBudget()).put("cancelledLoads",cancelledLoads).put("retiredBytes",retiredBytes).put("coalescedFrames",coalescedFrames).put("retainedLoads",retainedLoads).put("clearPrefetches",clearPrefetches).put("rasterWriteCount",rasterWriteCount).put("deferredRasterWrites",deferredRasterWrites).put("pendingRasterWrites",pendingWrites.size());}}
  void close(){synchronized(cacheLock){stopped=true;generation++;warmGeneration++;pendingWrites.clear();workingKeys.clear();pageKeys.clear();}library.setReaderPreviewSource(null);foreground.getQueue().clear();prefetch.getQueue().clear();foreground.shutdownNow();prefetch.shutdownNow();rasterWrites.shutdownNow();current=null;pendingFrame=null;queuedGeometry=null;synchronized(cacheLock){cache.clear();previewCache.clear();previewRestoring.clear();previewRestoreFailed.clear();tiles.clear();bytes=0;previewBytes=0;tileBytes=0;}adjusted.clear();}
}
