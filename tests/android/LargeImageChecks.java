package io.github.lorcinv.omicomic.test;

import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import org.json.*;
import java.io.*;
import java.lang.reflect.*;

/** Runs the packaged decoder on real Android codecs; synthetic inputs stay in the test APK. */
final class LargeImageChecks {
  private static void require(boolean value,String message)throws IOException{if(!value)throw new IOException(message);}
  static JSONObject run(Context assets)throws Exception{
    Class<?> type=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder"),check=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder$Check");
    Object noop=Proxy.newProxyInstance(check.getClassLoader(),new Class<?>[]{check},(p,m,a)->null);
    Method route=type.getDeclaredMethod("useNativeSampling",long.class,int.class,int.class);route.setAccessible(true);
    Method decode=type.getDeclaredMethod("decodeNative",byte[].class,int.class,check);decode.setAccessible(true);
    Method filteredUtility=type.getDeclaredMethod("decode",byte[].class,int.class,check);filteredUtility.setAccessible(true);
    Method legacy=type.getDeclaredMethod("png",byte[].class,int.class,check);legacy.setAccessible(true);
    Method region=type.getDeclaredMethod("region",BitmapRegionDecoder.class,Rect.class,int.class,boolean.class,check);region.setAccessible(true);
    require(!(Boolean)route.invoke(null,5242879L,4000,4000),"Ordinary image lost quality path");
    require((Boolean)route.invoke(null,5242880L,100,100),"5 MiB boundary");
    require((Boolean)route.invoke(null,100L,4001,4000),"Pixel boundary");
    require(!(Boolean)route.invoke(null,100L,8192,100),"Edge boundary");
    require((Boolean)route.invoke(null,100L,8193,100),"Long edge boundary");
    require((Boolean)route.invoke(null,100L,100000,100000),"Pixel multiplication overflow");
    JSONArray results=new JSONArray();
    for(String name:new String[]{"bytes","pixels","long","alpha"}){
      byte[] data;try(InputStream in=assets.getAssets().open("android-large-images/"+name+".png");ByteArrayOutputStream out=new ByteArrayOutputStream()){
        byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1)out.write(block,0,n);data=out.toByteArray();
      }
      BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,bounds);
      require((Boolean)route.invoke(null,(long)data.length,bounds.outWidth,bounds.outHeight),"Large input missed: "+name);
      int sample=8;long start=SystemClock.uptimeMillis();Bitmap actual=(Bitmap)decode.invoke(null,data,sample,noop);long elapsed=SystemClock.uptimeMillis()-start;
      BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=sample;options.inPreferredConfig=Bitmap.Config.ARGB_8888;
      Bitmap expected=BitmapFactory.decodeByteArray(data,0,data.length,options);
      require(actual.sameAs(expected),"Fast path differs from native pixels/alpha: "+name);
      require(actual.hasMipMap(),"Mipmap missing");
      require(actual.getAllocationByteCount()<=4L*((bounds.outWidth+7)/8)*((bounds.outHeight+7)/8),"Decoded allocation exceeds sample budget");
      JSONObject row=new JSONObject().put("name",name).put("encodedBytes",data.length).put("sourceWidth",bounds.outWidth).put("sourceHeight",bounds.outHeight).put("decodeMs",elapsed).put("bitmapBytes",actual.getAllocationByteCount()).put("nativePixelsEqual",true);
      actual.recycle();expected.recycle();
      // The unchanged private PNGJ path is the former implementation, measured
      // on identical bytes in this process. This is decoder time, not page-open time.
      start=SystemClock.uptimeMillis();Bitmap before=(Bitmap)legacy.invoke(null,data,sample,noop);
      row.put("legacyDecodeMs",SystemClock.uptimeMillis()-start);require(before!=null,"Missing comparison decode");before.recycle();
      BitmapRegionDecoder regional=BitmapRegionDecoder.newInstance(data,0,data.length,false);
      try{
        Rect area=new Rect(0,0,Math.min(512,bounds.outWidth),Math.min(512,bounds.outHeight));
        Bitmap tile=(Bitmap)region.invoke(null,regional,area,2,false,noop);options.inSampleSize=2;
        Bitmap nativeTile=regional.decodeRegion(area,options);require(tile.sameAs(nativeTile),"Native tile mismatch");row.put("nativeTilePixelsEqual",true);tile.recycle();nativeTile.recycle();
      }finally{regional.recycle();}
      final int[] calls={0};Object cancelled=Proxy.newProxyInstance(check.getClassLoader(),new Class<?>[]{check},(p,m,a)->{if(++calls[0]>=2)throw new IOException("cancelled");return null;});
      boolean aborted=false;try{decode.invoke(null,data,sample,cancelled);}catch(InvocationTargetException error){aborted=error.getCause() instanceof IOException;}
      require(aborted,"Cancelled decode published pixels");row.put("cancelled",true);results.put(row);
    }
    boolean rejected=false;try{decode.invoke(null,new byte[]{1,2,3,4},8,noop);}catch(InvocationTargetException error){rejected=error.getCause() instanceof IOException;}
    require(rejected,"Invalid image accepted");
    return new JSONObject().put("boundaryChecks",6).put("invalidRejected",true).put("cases",results).put("filterUtility",clarity(filteredUtility,legacy,check,noop)).put("readerOriginal",original(decode,noop));
  }
  private static JSONObject original(Method decode,Object noop)throws Exception{
    Bitmap source=Bitmap.createBitmap(2124,3000,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(source);canvas.drawColor(Color.WHITE);Paint ink=new Paint();ink.setColor(Color.BLACK);
    for(int x=1;x<source.getWidth();x+=7)canvas.drawRect(x,100,x+1,900,ink);
    ink.setTextSize(28);ink.setAntiAlias(true);canvas.drawText("清晰文字 Omi 原像素 123",80,1200,ink);
    ByteArrayOutputStream output=new ByteArrayOutputStream();source.compress(Bitmap.CompressFormat.PNG,100,output);
    Bitmap decoded=(Bitmap)decode.invoke(null,output.toByteArray(),1,noop);
    try{require(decoded.sameAs(source),"Reader changed ordinary source pixels");return new JSONObject().put("width",decoded.getWidth()).put("height",decoded.getHeight()).put("sourcePixelsEqual",true).put("bitmapBytes",decoded.getAllocationByteCount());}
    finally{source.recycle();decoded.recycle();}
  }
  private static JSONObject clarity(Method decode,Method png,Class<?> check,Object noop)throws Exception{
    Bitmap source=Bitmap.createBitmap(1200,1800,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(source);canvas.drawColor(Color.WHITE);
    Paint ink=new Paint();ink.setColor(Color.BLACK);
    for(int i=0;i<12;i++)for(int n=1;n<=3;n++)canvas.drawRect(80+i*90,100+n*120,80+i*90+n,180+n*120,ink);
    canvas.drawRect(600,600,1100,760,ink);ink.setTextSize(28);ink.setAntiAlias(true);canvas.drawText("清晰文字 Omi Comic 123 ABC",80,950,ink);
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();source.compress(Bitmap.CompressFormat.PNG,100,bytes);byte[] encoded=bytes.toByteArray();
    Class<?> sampler=Class.forName("io.github.lorcinv.omicomic.DisplayResampler");Method resize=sampler.getDeclaredMethod("resize",Bitmap.class,int.class,int.class,check);resize.setAccessible(true);
    JSONArray cases=new JSONArray();Bitmap decoded=null,reference=null;
    try{
      long start=SystemClock.uptimeMillis();decoded=(Bitmap)decode.invoke(null,encoded,2,noop);long decodeMs=SystemClock.uptimeMillis()-start;
      reference=(Bitmap)png.invoke(null,encoded,2,noop);require(reference!=null,"Missing line reference");
      long error=0;int count=decoded.getWidth()*decoded.getHeight();for(int y=0;y<decoded.getHeight();y++)for(int x=0;x<decoded.getWidth();x++)error+=Math.abs((decoded.getPixel(x,y)&255)-(reference.getPixel(x,y)&255));
      require(error/(double)count<.5,"Native-parser PNG softened the streaming reference");
      for(float ratio:new float[]{.5f,.8f,.95f}){
        Bitmap output=ratio==.5f?decoded:(Bitmap)resize.invoke(null,source,Math.round(1200*ratio),Math.round(1800*ratio),noop);JSONArray contrast=new JSONArray();
        for(int n=1;n<=3;n++){double sum=0;for(int i=0;i<12;i++){int minimum=255;for(int dx=-3;dx<=5;dx++)minimum=Math.min(minimum,output.getPixel((int)((80+i*90)*ratio)+dx,(int)((140+n*120)*ratio))&255);sum+=255-minimum;}contrast.put(sum/12);}
        require(contrast.getDouble(0)>(ratio==.5f?90:165),"One-pixel stroke blurred: "+contrast);
        require(contrast.getDouble(1)>(ratio==.5f?195:240),"Two-pixel stroke blurred: "+contrast);
        require((output.getPixel(20,0)&255)==255&&(output.getPixel(20,output.getHeight()-1)&255)==255,"Page margin changed");
        cases.put(new JSONObject().put("ratio",ratio).put("lineContrast",contrast));if(output!=decoded)output.recycle();
      }
      Bitmap nativeSize=(Bitmap)decode.invoke(null,encoded,1,noop);try{require(nativeSize.sameAs(source),"Native pixels changed at 100 percent");}finally{nativeSize.recycle();}
      return new JSONObject().put("decodeMs",decodeMs).put("meanErrorToStreaming",error/(double)count).put("sourcePixelsUnchanged",true).put("cases",cases);
    }finally{if(decoded!=null)decoded.recycle();if(reference!=null)reference.recycle();source.recycle();}
  }
  private static Object field(Object object,String name)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(object);}
  private static void set(Object object,String name,Object value)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);field.set(object,value);}
  static JSONObject warmCover(Object library,String url)throws Exception{
    Method media=library.getClass().getDeclaredMethod("media",String.class);media.setAccessible(true);String key=android.net.Uri.parse(url).getLastPathSegment();
    ((android.webkit.WebResourceResponse)media.invoke(library,key)).getData().close();
    java.util.concurrent.locks.ReentrantReadWriteLock lock=(java.util.concurrent.locks.ReentrantReadWriteLock)field(library,"fileAccess");
    java.util.concurrent.CountDownLatch locked=new java.util.concurrent.CountDownLatch(1),release=new java.util.concurrent.CountDownLatch(1);
    Thread cleanup=new Thread(()->{lock.writeLock().lock();try{locked.countDown();release.await(3,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}finally{lock.writeLock().unlock();}});
    java.util.concurrent.ScheduledExecutorService watchdog=java.util.concurrent.Executors.newSingleThreadScheduledExecutor();cleanup.start();
    try{
      require(locked.await(3,java.util.concurrent.TimeUnit.SECONDS),"Reader cleanup probe did not acquire its lock");watchdog.schedule(release::countDown,350,java.util.concurrent.TimeUnit.MILLISECONDS);
      long start=SystemClock.uptimeMillis();android.webkit.WebResourceResponse response=(android.webkit.WebResourceResponse)media.invoke(library,key);response.getData().close();long elapsed=SystemClock.uptimeMillis()-start;
      return new JSONObject().put("cachedCoverMs",elapsed).put("readerCleanupHoldMs",350).put("cachePaintIndependent",elapsed<150);
    }finally{release.countDown();cleanup.join(3000);watchdog.shutdownNow();}
  }
  static JSONObject scheduling(Object surface)throws Exception{
    Class<?> pendingType=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$PendingRaster"),replyType=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$RasterReply");
    Constructor<?> constructor=pendingType.getDeclaredConstructor(long.class,long.class);constructor.setAccessible(true);
    long generation=(Long)field(surface,"generation"),seek=(Long)field(surface,"seekGeneration");
    Object request=constructor.newInstance(generation,seek);String url="queue-policy://pending-body";
    java.util.Map pending=(java.util.Map)field(surface,"pending");Object guard=field(surface,"cacheLock");
    java.util.concurrent.CompletableFuture future=(java.util.concurrent.CompletableFuture)field(request,"future");
    final int[] replies={0};Object callback=Proxy.newProxyInstance(replyType.getClassLoader(),new Class<?>[]{replyType},(p,m,a)->{if(m.getName().equals("complete"))replies[0]++;return null;});
    Method async=surface.getClass().getDeclaredMethod("loadAsync",String.class,int.class,int.class,long.class,long.class,String.class,boolean.class,replyType);async.setAccessible(true);
    java.util.concurrent.ScheduledExecutorService watchdog=java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
    try{
      synchronized(guard){pending.put(url,request);}
      watchdog.schedule(()->future.completeExceptionally(new IOException("probe watchdog")),400,java.util.concurrent.TimeUnit.MILLISECONDS);
      long started=SystemClock.uptimeMillis();async.invoke(surface,url,10,10,generation,seek,"",true,callback);long elapsed=SystemClock.uptimeMillis()-started;
      require(elapsed<120&&replies[0]==0,"Foreground waited for a background body: "+elapsed);
      future.completeExceptionally(new IOException("probe cancelled"));require(replies[0]==1,"Joined body callback was not settled once");
      Object previous=field(surface,"current"),previews=field(surface,"previews"),next=field(surface,"pendingFrame");require(previous!=null,"Missing clear frame for loading retention probe");
      java.util.Set pinned=(java.util.Set)field(surface,"pinned"),savedPinned=new java.util.HashSet(pinned);
      RectF clip=(RectF)field(previous,"clip");Method apply=surface.getClass().getDeclaredMethod("applyFrame",JSONObject.class);apply.setAccessible(true);
      try{
        JSONObject loading=new JSONObject().put("viewportWidth",((android.view.View)surface).getWidth()).put("clip",new JSONArray(new float[]{clip.left,clip.top,clip.right,clip.bottom})).put("slots",new JSONArray()).put("nativeExpected",false).put("loading",true);
        apply.invoke(surface,loading);require(field(surface,"current")==previous,"A loading placeholder cleared the last sharp frame");
        Object first=((java.util.List)field(previous,"slots")).get(0);String source=(String)field(first,"url");
        JSONObject partial=new JSONObject().put("viewportWidth",((android.view.View)surface).getWidth()).put("panorama",true).put("clip",new JSONArray(new float[]{clip.left,clip.top,clip.right,clip.bottom})).put("expected",new JSONArray().put(new JSONArray(new float[]{clip.left,clip.top,clip.right,clip.bottom})))
          .put("slots",new JSONArray().put(new JSONObject().put("url",source).put("rect",new JSONArray(new float[]{clip.left,clip.top,clip.centerX(),clip.bottom})).put("alpha",1)));
        apply.invoke(surface,partial);require(field(surface,"current")==previous,"A partly ready strip replaced complete pixels with a blank edge");
      }finally{set(surface,"current",previous);set(surface,"pendingFrame",next);set(surface,"previews",previews);synchronized(guard){pinned.clear();pinned.addAll(savedPinned);}}
      return new JSONObject().put("joinedWithoutBlocking",true).put("joinReturnMs",elapsed).put("oneCompletion",true).put("loadingRetainsFrame",true).put("partialCoverageRetainsFrame",true);
    }finally{watchdog.shutdownNow();synchronized(guard){if(pending.get(url)==request)pending.remove(url);}future.completeExceptionally(new IOException("probe finished"));}
  }
  // Called on the app UI thread, using a synthetic slot. No user book or
  // current frame is changed; the real budget is restored before returning.
  static JSONObject tilePolicy(Object surface,Object library)throws Exception{
    long original=(Long)field(surface,"budget");Bitmap bitmap=Bitmap.createBitmap(16,16,Bitmap.Config.ARGB_8888);
    java.util.Map plans=(java.util.Map)field(surface,"plannedDetails"),savedPlans=new java.util.HashMap(plans);
    Class<?> rasterType=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$Raster"),slotType=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$Slot");
    Constructor<?> rasterConstructor=rasterType.getDeclaredConstructor(String.class,Bitmap.class,int.class,int.class,int.class,int.class);rasterConstructor.setAccessible(true);
    Constructor<?> slotConstructor=slotType.getDeclaredConstructor();slotConstructor.setAccessible(true);
    Object raster=rasterConstructor.newInstance("clarity-policy-fixture",bitmap,8000,6000,8,1),slot=slotConstructor.newInstance();set(slot,"raster",raster);
    Method plan=surface.getClass().getDeclaredMethod("tilePlan",slotType,RectF.class,long.class),budget=surface.getClass().getDeclaredMethod("tileBudget");plan.setAccessible(true);budget.setAccessible(true);
    JSONArray cases=new JSONArray();
    try{
      for(int[] spec:new int[][]{{64,1080,2400},{100,1440,3200}}){
        set(surface,"budget",spec[0]*1024L*1024);long allocation=(Long)budget.invoke(surface);set(slot,"rect",new RectF(0,0,8000,6000));
        RectF clip=new RectF(0,0,spec[1],spec[2]);Object first=plan.invoke(surface,slot,clip,allocation);
        require(first!=null&&(Integer)field(first,"sample")==1,"Viewport cannot reach source pixels: "+spec[1]+"x"+spec[2]);
        long bytes=(Long)field(first,"bytes");require(bytes*2<=allocation,"Sharp replacement cannot reserve the next complete region");
        set(slot,"rect",new RectF(-.5f,0,7999.5f,6000));Object panned=plan.invoke(surface,slot,clip,allocation);
        require(panned!=null&&field(first,"keys").equals(field(panned,"keys")),"Half-pixel pan restarted native region decoding");
        // A continuous zoom changes source coverage every frame. A prepared
        // source region must serve those frames without new reads/decodes.
        for(int step=1;step<=24;step++){
          float scale=1+step*.015f;set(slot,"rect",new RectF(-step*2,-step*2,8000*scale-step*2,6000*scale-step*2));
          Object zoomed=plan.invoke(surface,slot,clip,allocation);
          require(zoomed!=null&&field(first,"keys").equals(field(zoomed,"keys")),"Covered pinch frame restarted native decoding: "+step);
          require((Integer)field(zoomed,"sample")==1,"Cover reuse lost source detail");
        }
        set(slot,"rect",new RectF(-4000,-3000,4000,3000));Object beyond=plan.invoke(surface,slot,clip,allocation);
        require(beyond!=null&&!field(first,"keys").equals(field(beyond,"keys")),"Panning beyond coverage reused stale pixels");
        require((Long)field(beyond,"bytes")*2<=allocation,"Replacement apron exceeded the two-region budget");
        cases.put(new JSONObject().put("budgetMb",spec[0]).put("viewport",new JSONArray(new int[]{spec[1],spec[2]})).put("sample",1).put("regionBytes",bytes).put("tileBudget",allocation).put("subpixelPanReused",true).put("coveredZoomFramesReused",24).put("outsideCoverageReplaced",true));
      }
      set(slot,"rect",new RectF(0,0,1080,810));Object modestZoom=plan.invoke(surface,slot,new RectF(0,0,1080,810),(Long)budget.invoke(surface));
      require(modestZoom!=null,"Upscaled base did not request sharper detail");
      set(raster,"preview",true);set(slot,"rect",new RectF(0,0,8000,6000));
      Object previewDetail=plan.invoke(surface,slot,new RectF(0,0,1080,2400),(Long)budget.invoke(surface));
      require(previewDetail!=null&&(Integer)field(previewDetail,"sample")==1,"Preview blocked source detail until promotion");
      Method adjustmentKey=surface.getClass().getDeclaredMethod("rasterAdjustmentKey",rasterType);adjustmentKey.setAccessible(true);
      String previewKey=(String)adjustmentKey.invoke(null,raster);set(raster,"preview",false);
      require(!previewKey.equals(adjustmentKey.invoke(null,raster)),"Preview and body reused the same adjustment cache");
      Method key=library.getClass().getDeclaredMethod("readerRasterKey",String.class,int.class);key.setAccessible(true);
      require(((String)key.invoke(library,"https://appassets.androidplatform.net/media/clarity-fixture",2)).startsWith("native-source-raster-v6:"),"Old filtered cache still eligible");
      Method sample=surface.getClass().getDeclaredMethod("sampleFor",int.class,int.class,int.class,int.class);sample.setAccessible(true);
      set(surface,"budget",64L*1024*1024);require((Integer)sample.invoke(surface,2124,3000,1080,2400)==1,"Ordinary page was downsampled before zoom");
      require((Integer)sample.invoke(surface,2400,3200,1080,1920)==1,"Panorama photo was decoded for the smaller ordinary fit");
      require((Integer)sample.invoke(surface,2400,3200,1440,2560)==1,"Higher-density screen lost physical fit resolution");
      set(surface,"budget",96L*1024*1024);require((Integer)sample.invoke(surface,4800,6400,1080,1730)==2,"Physical panorama detail was reduced below its oversampling margin");
      int giant=(Integer)sample.invoke(surface,8000,10000,1080,2400);require(giant>1&&8000L/giant*(10000/giant)*4<=32L*1024*1024,"Giant source bypassed bitmap budget");
      return new JSONObject().put("cases",cases).put("upscaledBaseRefines",true).put("previewRefinesWithoutPromotion",true).put("qualityCacheSeparated",true).put("oldFilteredCacheExcluded",true).put("ordinarySample",1).put("photoPanoramaSample",1).put("higherDensitySample",1).put("giantSample",giant);
    }finally{plans.clear();plans.putAll(savedPlans);set(surface,"budget",original);bitmap.recycle();}
  }
}
