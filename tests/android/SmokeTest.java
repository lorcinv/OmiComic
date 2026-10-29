package io.github.lorcinv.omicomic.test;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Separate, same-signer instrumentation APK. The shipped app needs no debug bridge. */
public final class SmokeTest extends Instrumentation {
  private Bundle args;
  private WebView web;
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); args=arguments; start(); }
  private WebView find(View view) {
    if(view instanceof WebView)return (WebView)view;
    if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView w=find(((ViewGroup)view).getChildAt(i));if(w!=null)return w;}
    return null;
  }
  private String eval(String script)throws Exception {
    CountDownLatch done=new CountDownLatch(1);String[] result={null};
    runOnMainSync(()->web.evaluateJavascript(script,value->{result[0]=value;done.countDown();}));
    if(!done.await(10,TimeUnit.SECONDS))throw new IOException("WebView evaluation timed out");
    return result[0];
  }
  private Object field(Object object,String name)throws Exception {java.lang.reflect.Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(object);}
  private float launchProgress(Activity activity)throws Exception {
    try {Object reveal=field(activity,"launchReveal");java.lang.reflect.Method progress=reveal.getClass().getDeclaredMethod("progress");progress.setAccessible(true);return (Float)progress.invoke(reveal);}
    catch(NoSuchFieldException legacy){View cover=(View)field(activity,"launchCover");return cover==null?-1f:1f-cover.getAlpha();}
  }
  private final class DeferredWebView extends WebView {
    final java.util.List<VisualStateCallback> callbacks=new java.util.ArrayList<>();
    DeferredWebView(){super(getTargetContext());}
    @Override public void postVisualStateCallback(long id,VisualStateCallback callback){callbacks.add(callback);}
  }
  private void awaitSceneSettled(Activity activity)throws Exception {
    long deadline=SystemClock.uptimeMillis()+4000;
    while(true){boolean[] moving={false};runOnMainSync(()->{try{moving[0]=field(field(activity,"sceneTransition"),"snapshot")!=null;}catch(NoSuchFieldException legacy){}catch(Exception error){throw new RuntimeException(error);}});if(!moving[0])return;if(SystemClock.uptimeMillis()>deadline)throw new IOException("Native navigation did not settle");SystemClock.sleep(20);}
  }
  private JSONObject homeRevealCancellationTest(Activity activity)throws Exception {
    awaitSceneSettled(activity);
    Object scene=field(activity,"sceneTransition");View content=(View)field(scene,"content");Class<?> type=scene.getClass();
    java.lang.reflect.Method begin=type.getDeclaredMethod("begin",long.class,Runnable.class),commit=type.getDeclaredMethod("commit",long.class,String.class),cancel=type.getDeclaredMethod("cancel"),pause=type.getDeclaredMethod("pause"),resume=type.getDeclaredMethod("resume");
    for(java.lang.reflect.Method method:new java.lang.reflect.Method[]{begin,commit,cancel,pause,resume})method.setAccessible(true);
    JSONObject result=new JSONObject();int originalLayer=content.getLayerType();
    try{
      for(boolean duringReveal:new boolean[]{false,true}){
        long request=duringReveal?Long.MAX_VALUE-1:Long.MAX_VALUE;CountDownLatch captured=new CountDownLatch(1);boolean[] stopped={false};
        runOnMainSync(()->{try{begin.invoke(scene,request,(Runnable)captured::countDown);}catch(Exception error){throw new RuntimeException(error);}});
        if(!captured.await(5,TimeUnit.SECONDS))throw new IOException("Home cancellation capture timed out");
        runOnMainSync(()->{try{
          commit.invoke(scene,request,"home-expand");
          if(content.getLayerType()!=View.LAYER_TYPE_HARDWARE||field(scene,"revealLayer")!=content)throw new AssertionError("Home texture was not prepared");
          if(!duringReveal){cancel.invoke(scene);stopped[0]=true;}
        }catch(Exception error){throw new RuntimeException(error);}});
        long deadline=SystemClock.uptimeMillis()+4000;
        while(!stopped[0]){
          runOnMainSync(()->{try{if(field(scene,"reveal")!=null){pause.invoke(scene);stopped[0]=true;}}catch(Exception error){throw new RuntimeException(error);}});
          if(SystemClock.uptimeMillis()>deadline)throw new IOException("Did not reach active home reveal");
          if(!stopped[0])SystemClock.sleep(10);
        }
        // Let queued frame-commit/animation callbacks run after cancellation.
        SystemClock.sleep(400);
        runOnMainSync(()->{try{
          if(content.getLayerType()!=originalLayer||field(scene,"revealLayer")!=null||field(scene,"reveal")!=null||field(scene,"snapshot")!=null||field(scene,"bitmap")!=null)throw new AssertionError("Cancelled home reveal retained resources");
          resume.invoke(scene);
        }catch(Exception error){throw new RuntimeException(error);}});
        result.put(duringReveal?"pauseDuringRevealReleased":"cancelDuringPreparationReleased",true);
      }
      return result.put("originalLayerRestored",true).put("staleFrameCallbacksIgnored",true);
    }finally{runOnMainSync(()->{try{cancel.invoke(scene);resume.invoke(scene);}catch(Exception error){throw new RuntimeException(error);}});}
  }
  private JSONObject resumeGateTest(Activity activity)throws Exception {
    awaitSceneSettled(activity);
    long settledDeadline=SystemClock.uptimeMillis()+6000;
    while(!"true".equals(eval("!document.documentElement.dataset.mobileNavigation"))){if(SystemClock.uptimeMillis()>settledDeadline)throw new IOException("Web transition did not settle before cover comparison");SystemClock.sleep(30);}
    SystemClock.sleep(300);
    Object gate=field(activity,"resumeDrawGate");View root=(View)field(activity,"rootFrame");
    Class<?> type=gate.getClass();
    java.lang.reflect.Method pause=type.getDeclaredMethod("pause"),begin=type.getDeclaredMethod("begin"),ready=type.getDeclaredMethod("readyWhenWebIsReady"),cancel=type.getDeclaredMethod("cancel"),release=type.getDeclaredMethod("release",int.class);
    for(java.lang.reflect.Method m:new java.lang.reflect.Method[]{pause,begin,ready,cancel,release})m.setAccessible(true);
    JSONObject result=new JSONObject();android.graphics.Bitmap before=getUiAutomation().takeScreenshot();
    runOnMainSync(()->{try{pause.invoke(gate);}catch(Exception e){throw new RuntimeException(e);}});
    long deadline=SystemClock.uptimeMillis()+2000;
    while(field(gate,"snapshot")==null){if(SystemClock.uptimeMillis()>deadline)throw new IOException("No resume frame captured");SystemClock.sleep(20);}
    android.graphics.Bitmap capture=(android.graphics.Bitmap)field(gate,"bitmap");
    if(capture.getAllocationByteCount()>8_000_000)throw new IOException("Resume frame exceeds memory budget");
    result.put("captureBytes",capture.getAllocationByteCount());
    int background=((android.graphics.drawable.ColorDrawable)root.getBackground()).getColor();
    try{
      runOnMainSync(()->{try{begin.invoke(gate);web.setAlpha(0);root.setBackgroundColor(android.graphics.Color.WHITE);root.invalidate();if(root.getViewTreeObserver().dispatchOnPreDraw())throw new AssertionError("Resume blocked actual drawing");}catch(Exception e){throw new RuntimeException(e);}});
      SystemClock.sleep(220);android.graphics.Bitmap held=getUiAutomation().takeScreenshot();
      runOnMainSync(()->{try{web.setAlpha(1);root.setBackgroundColor(background);ready.invoke(gate);}catch(Exception e){throw new RuntimeException(e);}});
      long restoredAt=SystemClock.uptimeMillis();deadline=restoredAt+2300;
      while(field(gate,"snapshot")!=null){if(SystemClock.uptimeMillis()>deadline)throw new IOException("Resume frame never released");SystemClock.sleep(20);}
      SystemClock.sleep(120);android.graphics.Bitmap after=getUiAutomation().takeScreenshot();
      long heldError=0,afterError=0,count=0;
      for(int y=before.getHeight()/5;y<before.getHeight()*4/5;y+=8)for(int x=before.getWidth()/5;x<before.getWidth()*4/5;x+=8)for(int shift:new int[]{0,8,16}){int pixel=before.getPixel(x,y)>>>shift&255;heldError+=Math.abs(pixel-(held.getPixel(x,y)>>>shift&255));afterError+=Math.abs(pixel-(after.getPixel(x,y)>>>shift&255));count++;}
      result.put("heldDisplayMeanRgbDifference",(double)heldError/count).put("restoredDisplayMeanRgbDifference",(double)afterError/count).put("releaseMs",SystemClock.uptimeMillis()-restoredAt);
      android.graphics.Bitmap[] shots={before,held,after};String[] names={"before","held","after"};
      for(int i=0;i<shots.length;i++){try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"mobile1123-cover-"+names[i]+".png"))){shots[i].compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}shots[i].recycle();}
      if((double)heldError/count>1||(double)afterError/count>1)throw new IOException("Resume cover changed the display: "+result);
      runOnMainSync(()->{try{pause.invoke(gate);}catch(Exception e){throw new RuntimeException(e);}});
      deadline=SystemClock.uptimeMillis()+2000;while(field(gate,"snapshot")==null){if(SystemClock.uptimeMillis()>deadline)throw new IOException("Second capture failed");SystemClock.sleep(20);}
      runOnMainSync(()->{try{
        ready.invoke(gate);int old=(int)field(gate,"generation");Runnable stale=(Runnable)field(gate,"timeout");
        pause.invoke(gate);ready.invoke(gate);stale.run();release.invoke(gate,old);
        if(!(boolean)field(gate,"waiting")||field(gate,"snapshot")==null)throw new AssertionError("Stale completion removed the new cover");
        ((Runnable)field(gate,"timeout")).run();
        if((boolean)field(gate,"waiting")||field(gate,"snapshot")!=null||field(gate,"bitmap")!=null)throw new AssertionError("Timeout retained the cover");
        pause.invoke(gate);cancel.invoke(gate);
      }catch(Exception e){throw new RuntimeException(e);}});
      SystemClock.sleep(250);
      if(field(gate,"snapshot")!=null||field(gate,"bitmap")!=null||field(gate,"pending")!=null)throw new IOException("Late capture survived cancellation");
      result.put("drawingAllowedUnderCover",true).put("staleCompletionIgnored",true).put("timeoutReleased",true).put("cancelledCaptureReleased",true);
      return result;
    }finally{runOnMainSync(()->{try{web.setAlpha(1);root.setBackgroundColor(background);cancel.invoke(gate);}catch(Exception e){throw new RuntimeException(e);}});}
  }
  private void launchShot(Activity activity,int number){
    View decor=activity.getWindow().getDecorView();
    android.graphics.Bitmap image=android.graphics.Bitmap.createBitmap(decor.getWidth(),decor.getHeight(),android.graphics.Bitmap.Config.ARGB_8888);
    PixelCopy.request(activity.getWindow(),image,result->{
      if(result==PixelCopy.SUCCESS)try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"mobile1121-launch-"+number+".png"))){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}catch(IOException error){throw new RuntimeException(error);}
      image.recycle();
    },decor.getHandler());
  }
  private String shell(String command)throws IOException {
    try(ParcelFileDescriptor fd=getUiAutomation().executeShellCommand(command);InputStream input=new FileInputStream(fd.getFileDescriptor());ByteArrayOutputStream out=new ByteArrayOutputStream()){
      byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)out.write(buffer,0,n);return new String(out.toByteArray(),StandardCharsets.UTF_8);
    }
  }
  private JSONObject lifecycle(Activity activity,String route)throws Exception {
    String sentinel=eval("window.__omiResumeSentinel"),url=eval("location.href");
    if(route.equals("pending-capture")){
      CountDownLatch captured=new CountDownLatch(1);
      runOnMainSync(()->{try{Object scene=field(activity,"sceneTransition");java.lang.reflect.Method begin=scene.getClass().getDeclaredMethod("begin",long.class,Runnable.class);begin.setAccessible(true);begin.invoke(scene,Long.MAX_VALUE,(Runnable)captured::countDown);}catch(Exception error){throw new RuntimeException(error);}});
      if(!captured.await(5,TimeUnit.SECONDS))throw new IOException("Scene capture timed out");
    }
    boolean extended=route.matches("(icon|lock|trim)-[0-9]+");
    boolean locked=route.startsWith("lock-");long hold=extended?Long.parseLong(route.substring(route.lastIndexOf('-')+1)):550;
    Bundle progress=new Bundle();if(extended){progress.putString("resumeTest",route+" begin "+System.currentTimeMillis());sendStatus(0,progress);}
    String video="/sdcard/omi-resume-1123-"+args.getString("fixture","home")+"-"+route+".mp4";
    ParcelFileDescriptor recorder=null;
    if(extended&&locked){recorder=getUiAutomation().executeShellCommand("screenrecord --size 720x1280 --bit-rate 4000000 --time-limit 180 "+video);SystemClock.sleep(600);}
    if(locked)shell("input keyevent 223");else if(route.equals("other-app"))shell("am start -W -a android.settings.SETTINGS");else shell("input keyevent 3");
    SystemClock.sleep(hold);
    boolean asleep=locked&&shell("dumpsys power").contains("mWakefulness=Asleep");
    if(locked&&!asleep)throw new IOException("Lock test did not put display to sleep");
    Object gate=field(activity,"resumeDrawGate");android.graphics.Bitmap resumeBitmap=(android.graphics.Bitmap)field(gate,"bitmap");
    int retainedBytes=resumeBitmap==null?0:resumeBitmap.getAllocationByteCount();
    if(extended&&(retainedBytes<=0||retainedBytes>8_000_000))throw new IOException("Invalid background frame budget: "+retainedBytes);
    if(route.startsWith("trim-"))shell("am send-trim-memory io.github.lorcinv.omicomic COMPLETE");
    if(extended&&!locked){recorder=getUiAutomation().executeShellCommand("screenrecord --size 720x1280 --bit-rate 4000000 --time-limit 7 "+video);SystemClock.sleep(600);}
    String launched;
    if(locked){shell("input keyevent 224");launched=shell("wm dismiss-keyguard");}
    else launched=shell("am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10200000 -n io.github.lorcinv.omicomic/.MainActivity");
    long end=SystemClock.uptimeMillis()+6000;
    while(!activity.hasWindowFocus()){if(SystemClock.uptimeMillis()>end)throw new IOException("Launcher did not reuse the Activity: "+launched);SystemClock.sleep(20);}
    boolean[] staleAtResume={false};runOnMainSync(()->{try{staleAtResume[0]=field(field(activity,"sceneTransition"),"snapshot")!=null;}catch(Exception error){throw new RuntimeException(error);}});
    if(route.equals("pending-capture"))runOnMainSync(()->{try{Object scene=field(activity,"sceneTransition");java.lang.reflect.Method commit=scene.getClass().getDeclaredMethod("commit",long.class,String.class);commit.setAccessible(true);commit.invoke(scene,Long.MAX_VALUE,"forward");}catch(Exception error){throw new RuntimeException(error);}});
    long resumeAt=SystemClock.uptimeMillis();
    while((boolean)field(gate,"waiting")){if(SystemClock.uptimeMillis()-resumeAt>2300)throw new IOException("Resume cover did not settle");SystemClock.sleep(20);}
    SystemClock.sleep(100);
    boolean same=sentinel.equals(eval("window.__omiResumeSentinel"))&&url.equals(eval("location.href"));
    if(!same)throw new IOException("Launcher recreated the web page");
    JSONObject[] state={null};
    runOnMainSync(()->{try{Object scene=field(activity,"sceneTransition");View content=(View)field(scene,"content");
      state[0]=new JSONObject().put("route",route).put("sameActivityAndPage",same).put("staleSnapshotAtResume",staleAtResume[0]).put("launchProgress",launchProgress(activity)).put("snapshotRetained",field(scene,"snapshot")!=null).put("contentX",content.getTranslationX()).put("contentAlpha",content.getAlpha()).put("contentScale",content.getScaleX());
      if(args.getString("mode","").startsWith("mobile1122-")||args.getString("mode","").startsWith("mobile1123-")){
        boolean waiting=(boolean)field(field(activity,"resumeDrawGate"),"waiting"),stopped=(boolean)field(activity,"webStopped"),backdrop=field(field(activity,"launchReveal"),"backdrop")!=null;
        state[0].put("resumeDrawWaiting",waiting).put("webStopped",stopped).put("launchBackdropRetained",backdrop);
        if(waiting||stopped||backdrop)throw new IOException("Resume did not settle or release launch backdrop");
      }
    }catch(Exception error){throw new RuntimeException(error);}});
    if(staleAtResume[0]||state[0].getDouble("launchProgress")!=-1||state[0].getBoolean("snapshotRetained")||state[0].getDouble("contentX")!=0||state[0].getDouble("contentAlpha")!=1||state[0].getDouble("contentScale")!=1)throw new IOException("Resume retained a transition: "+state[0]);
    state[0].put("holdMillis",hold).put("screenWasAsleep",asleep).put("retainedFrameBytes",retainedBytes).put("resumeCoverReleaseMs",SystemClock.uptimeMillis()-resumeAt).put("resumeSnapshotReleased",field(gate,"snapshot")==null&&field(gate,"bitmap")==null);
    if(!state[0].getBoolean("resumeSnapshotReleased"))throw new IOException("Resume frame leaked");
    if(extended){SystemClock.sleep(6500);if(locked)shell("pkill -2 screenrecord");recorder.close();progress.putString("resumeTest",route+" done "+System.currentTimeMillis());sendStatus(0,progress);state[0].put("displayRecording",video);}
    return state[0];
  }
  private final class SceneFrames implements Choreographer.FrameCallback {
    final Activity activity;final JSONArray frames=new JSONArray();boolean stopped,inFlight;long start=SystemClock.uptimeMillis();
    SceneFrames(Activity activity){this.activity=activity;}
    public void doFrame(long time){
      if(stopped)return;
      if(!inFlight&&activity.hasWindowFocus()&&web.getWindowVisibility()==View.VISIBLE){
        inFlight=true;
        // The viewport is stationary. WebView coordinates move during a slide;
        // sampling that moving rectangle would read outside the app window.
        View frame;
        try{frame=(View)field(activity,"rootFrame");}catch(Exception error){throw new RuntimeException(error);}
        int[] origin=new int[2];frame.getLocationInWindow(origin);origin[0]+=frame.getPaddingLeft();origin[1]+=frame.getPaddingTop();
        android.graphics.Rect area=new android.graphics.Rect(origin[0],origin[1],origin[0]+web.getWidth(),origin[1]+web.getHeight());
        android.graphics.Bitmap image=android.graphics.Bitmap.createBitmap(72,120,android.graphics.Bitmap.Config.ARGB_8888);
        boolean homeProbe=args.getString("mode","").equals("mobile1138-entry");
        android.animation.Animator sceneReveal;
        try{sceneReveal=homeProbe?(android.animation.Animator)field(field(activity,"sceneTransition"),"reveal"):null;}catch(Exception error){throw new RuntimeException(error);}
        final boolean revealing=sceneReveal!=null&&sceneReveal.isRunning();final long revealDuration=sceneReveal==null?0:sceneReveal.getDuration();
        try{PixelCopy.request(activity.getWindow(),area,image,result->{
          if(result==PixelCopy.SUCCESS){
            java.util.Set<Integer> colors=new java.util.HashSet<>();long brightness=0;
            for(int y=0;y<image.getHeight();y++)for(int x=0;x<image.getWidth();x++){int pixel=image.getPixel(x,y);colors.add(pixel&0x00f8f8f8);brightness+=(pixel>>>16&255)+(pixel>>>8&255)+(pixel&255);}
            try{JSONObject sample=new JSONObject().put("ms",SystemClock.uptimeMillis()-start).put("colors",colors.size()).put("meanRgb",(double)brightness/(image.getWidth()*image.getHeight()*3));if(homeProbe)sample.put("nativeReveal",revealing).put("revealDuration",revealDuration);frames.put(sample);}catch(Exception error){throw new RuntimeException(error);}
          }
          image.recycle();inFlight=false;
        },web.getHandler());}catch(IllegalArgumentException error){image.recycle();inFlight=false;}
      }
      Choreographer.getInstance().postFrameCallback(this);
    }
    JSONObject result()throws Exception {
      stopped=true;int blanks=0,min=Integer.MAX_VALUE;
      for(int i=0;i<frames.length();i++){int colors=frames.getJSONObject(i).getInt("colors");min=Math.min(min,colors);if(colors<=3)blanks++;}
      JSONObject result=new JSONObject().put("frames",frames).put("count",frames.length()).put("uniformBlankFrames",blanks).put("minColors",min);
      if(args.getString("mode","").equals("mobile1138-entry")){Object scene=field(activity,"sceneTransition");result.put("contentLayerType",((View)field(scene,"content")).getLayerType()).put("snapshotRetained",field(scene,"snapshot")!=null).put("revealRetained",field(scene,"reveal")!=null);}
      return result;
    }
  }
  private JSONObject pngBench(Object library,String url)throws Exception {
    java.lang.reflect.Method image=library.getClass().getDeclaredMethod("readerImage",String.class);image.setAccessible(true);
    byte[] data=(byte[])image.invoke(library,url);
    Class<?> decoder=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder"),check=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder$Check");
    Object noop=java.lang.reflect.Proxy.newProxyInstance(check.getClassLoader(),new Class<?>[]{check},(proxy,method,arguments)->null);
    java.lang.reflect.Method decode=decoder.getDeclaredMethod("decode",byte[].class,int.class,check);decode.setAccessible(true);
    JSONObject result=new JSONObject().put("encodedBytes",data.length);long started=SystemClock.uptimeMillis();
    try{android.graphics.Bitmap bitmap=(android.graphics.Bitmap)decode.invoke(null,data,4,noop);result.put("decodeMs",SystemClock.uptimeMillis()-started).put("width",bitmap.getWidth()).put("height",bitmap.getHeight());bitmap.recycle();}
    catch(java.lang.reflect.InvocationTargetException error){result.put("error",error.getCause().toString());}
    JSONArray trials=new JSONArray();
    for(int mb:new int[]{8,32}){
      started=SystemClock.uptimeMillis();android.graphics.BitmapRegionDecoder regional=android.graphics.BitmapRegionDecoder.newInstance(data,0,data.length,false);
      int width=regional.getWidth(),height=regional.getHeight(),rows=Math.max(4,(mb*1024*1024/(width*4))/4*4);
      android.graphics.Bitmap output=android.graphics.Bitmap.createBitmap((width+3)/4,(height+3)/4,android.graphics.Bitmap.Config.ARGB_8888);
      android.graphics.Canvas canvas=new android.graphics.Canvas(output);
      java.lang.reflect.Method region=decoder.getDeclaredMethod("region",android.graphics.BitmapRegionDecoder.class,android.graphics.Rect.class,int.class,boolean.class);region.setAccessible(true);
      for(int y=0;y<height;y+=rows){android.graphics.Bitmap strip=(android.graphics.Bitmap)region.invoke(null,regional,new android.graphics.Rect(0,y,width,Math.min(height,y+rows)),4,true);canvas.drawBitmap(strip,0,y/4,null);strip.recycle();}
      trials.put(new JSONObject().put("workingMiB",mb).put("ms",SystemClock.uptimeMillis()-started));regional.recycle();output.recycle();
    }
    return result.put("nativeBands",trials);
  }
  private void stalePreview(Object surface)throws Exception {
    runOnMainSync(()->{try{
      Object current=field(surface,"current"),slot=((java.util.List<?>)field(current,"slots")).get(0),full=field(slot,"raster");
      JSONObject frame=nativeFrameMessage(surface,current);
      android.graphics.Bitmap bitmap=(android.graphics.Bitmap)field(full,"bitmap"),small=android.graphics.Bitmap.createScaledBitmap(bitmap,65,96,true);
      Class<?> type=full.getClass(),work=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$PendingRaster");
      java.lang.reflect.Constructor<?> ctor=type.getDeclaredConstructors()[0],request=work.getDeclaredConstructor(long.class,long.class);ctor.setAccessible(true);request.setAccessible(true);
      Object preview=ctor.newInstance(field(full,"url"),small,field(full,"width"),field(full,"height"),53,1);
      for(String name:new String[]{"preview","fullSample","request"}){java.lang.reflect.Field f=type.getDeclaredField(name);f.setAccessible(true);f.set(preview,name.equals("preview")?true:name.equals("fullSample")?field(full,"sample"):request.newInstance((Long)field(surface,"generation")-1,(Long)field(surface,"seekGeneration")-1));}
      synchronized(field(surface,"cacheLock")){
        @SuppressWarnings("unchecked") java.util.Map<String,Object> cache=(java.util.Map<String,Object>)field(surface,"cache");cache.put((String)field(full,"url"),preview);
        long bytes=0;for(Object r:cache.values())bytes+=((android.graphics.Bitmap)field(r,"bitmap")).getAllocationByteCount();
        java.lang.reflect.Field amount=surface.getClass().getDeclaredField("bytes");amount.setAccessible(true);amount.setLong(surface,bytes);
      }
      java.lang.reflect.Field image=slot.getClass().getDeclaredField("raster");image.setAccessible(true);image.set(slot,preview);
      java.lang.reflect.Method apply=surface.getClass().getDeclaredMethod("applyFrame",JSONObject.class);apply.setAccessible(true);apply.invoke(surface,frame);
    }catch(Exception error){throw new RuntimeException(error);}});
  }
  private JSONObject antialiasTest()throws Exception {
    Class<?> decoder=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder"),check=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder$Check");
    java.lang.reflect.Method decode=decoder.getDeclaredMethod("decode",byte[].class,int.class,check);decode.setAccessible(true);
    Object noop=java.lang.reflect.Proxy.newProxyInstance(check.getClassLoader(),new Class<?>[]{check},(proxy,method,arguments)->null);
    JSONArray cases=new JSONArray();
    for(String name:new String[]{"lines","dots","diagonal","variable","alpha","palette","palette-alpha","icc","interlaced","lines.jpg","dots.jpg","diagonal.jpg","variable.jpg"}){
      boolean jpeg=name.endsWith(".jpg");String file=jpeg?name:name+".png",expected=jpeg?name.replace(".jpg","-jpg-expected.png"):name+"-expected.png";
      byte[] data;try(InputStream input=getContext().getAssets().open("android-antialias/"+file);ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);data=output.toByteArray();}
      android.graphics.Bitmap reference;try(InputStream input=getContext().getAssets().open("android-antialias/"+expected)){reference=android.graphics.BitmapFactory.decodeStream(input);}
      android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inSampleSize=8;
      android.graphics.Bitmap old=android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,options);
      long started=SystemClock.uptimeMillis();android.graphics.Bitmap filtered=(android.graphics.Bitmap)decode.invoke(null,data,8,noop);long ms=SystemClock.uptimeMillis()-started;
      // PNG fixtures contain subpixel periodic tones. Their independent ideal
      // is the DC colour, not the aliases left by the old box-average golden.
      int[] dc=new int[4];for(int channel=0;channel<4;channel++){long sum=0;for(int y=0;y<reference.getHeight();y++)for(int x=0;x<reference.getWidth();x++)sum+=reference.getPixel(x,y)>>>(channel*8)&255;dc[channel]=(int)Math.round(sum/(double)(reference.getWidth()*reference.getHeight()));}
      int margin=jpeg?0:4;long error=0,oldError=0;int max=0,count=(reference.getWidth()-margin*2)*(reference.getHeight()-margin*2)*4;
      for(int y=margin;y<reference.getHeight()-margin;y++)for(int x=margin;x<reference.getWidth()-margin;x++)for(int channel=0;channel<4;channel++){
        int shift=channel*8,expectedValue=jpeg?(reference.getPixel(x,y)>>>shift&255):dc[channel],diff=Math.abs((filtered.getPixel(x,y)>>>shift&255)-expectedValue);error+=diff;max=Math.max(max,diff);oldError+=Math.abs((old.getPixel(x,y)>>>shift&255)-expectedValue);
      }
      double mean=(double)error/count;
      cases.put(new JSONObject().put("name",name).put("meanError",mean).put("maxError",max).put("oldMeanError",(double)oldError/count).put("decodeMs",ms).put("mipmaps",filtered.hasMipMap()));
      if(mean>(jpeg?2:1)||max>(jpeg?8:2))throw new IOException("Aliasing regression: "+cases);
      if(!jpeg){
        android.graphics.BitmapRegionDecoder regional=android.graphics.BitmapRegionDecoder.newInstance(data,0,data.length,false);
        java.lang.reflect.Method region=decoder.getDeclaredMethod("region",android.graphics.BitmapRegionDecoder.class,android.graphics.Rect.class,int.class,boolean.class);region.setAccessible(true);
        android.graphics.Bitmap tile=(android.graphics.Bitmap)region.invoke(null,regional,new android.graphics.Rect(0,0,512,512),8,true);
        long difference=0;int peak=0;for(int y=4;y<60;y++)for(int x=4;x<60;x++)for(int channel=0;channel<4;channel++){int d=Math.abs((tile.getPixel(x,y)>>>(channel*8)&255)-dc[channel]);difference+=d;peak=Math.max(peak,d);}
        if((double)difference/(56*56*4)>1||peak>2)throw new IOException("Zoom tile aliases: "+name+" "+difference+" "+peak);
        cases.getJSONObject(cases.length()-1).put("tileMeanError",(double)difference/(56*56*4)).put("tileMaxError",peak);tile.recycle();regional.recycle();
      }
      filtered.recycle();old.recycle();reference.recycle();
    }
    return new JSONObject().put("patterns",cases);
  }
  private JSONObject displaySamplingTest()throws Exception {
    Class<?> sampler=Class.forName("io.github.lorcinv.omicomic.DisplayResampler"),check=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder$Check");
    java.lang.reflect.Method resize=sampler.getDeclaredMethod("resize",android.graphics.Bitmap.class,int.class,int.class,check);resize.setAccessible(true);
    Object noop=java.lang.reflect.Proxy.newProxyInstance(check.getClassLoader(),new Class<?>[]{check},(proxy,method,arguments)->null);
    int width=1062,height=1500;int[] row=new int[width];android.graphics.Bitmap source=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888);
    for(int y=0;y<height;y++){for(int x=0;x<width;x++)row[x]=(x+y)%2==0?0xff000000:0xffffffff;source.setPixels(row,0,width,0,y,width,1);}
    JSONArray results=new JSONArray();
    try{
      for(int h:new int[]{900,1256}){
        int w=Math.round(width*h/(float)height);long start=SystemClock.uptimeMillis();
        android.graphics.Bitmap output=(android.graphics.Bitmap)resize.invoke(null,source,w,h,noop);long elapsed=SystemClock.uptimeMillis()-start;
        android.graphics.Bitmap old=android.graphics.Bitmap.createScaledBitmap(source,w,h,true);
        double sum=0,squares=0,oldSum=0,oldSquares=0;int count=0;
        for(int y=10;y<h-10;y+=3)for(int x=10;x<w-10;x+=3){int value=output.getPixel(x,y)&255,previous=old.getPixel(x,y)&255;sum+=value;squares+=value*value;oldSum+=previous;oldSquares+=previous*previous;count++;}
        double mean=sum/count,deviation=Math.sqrt(Math.max(0,squares/count-mean*mean)),oldMean=oldSum/count,oldDeviation=Math.sqrt(Math.max(0,oldSquares/count-oldMean*oldMean));
        if(Math.abs(mean-127.5)>3||deviation>5||deviation>=oldDeviation/2)throw new IOException("Halftone sampling still aliases: "+deviation+" vs "+oldDeviation);
        results.put(new JSONObject().put("width",w).put("height",h).put("mean",mean).put("deviation",deviation).put("oldDeviation",oldDeviation).put("filterMs",elapsed));output.recycle();old.recycle();
      }
      android.graphics.Canvas canvas=new android.graphics.Canvas(source);canvas.drawColor(0xffffffff);android.graphics.Paint ink=new android.graphics.Paint();ink.setColor(0xff000000);canvas.drawRect(80,300,900,315,ink);
      android.graphics.Bitmap text=(android.graphics.Bitmap)resize.invoke(null,source,638,900,noop);int darkest=255;
      for(int y=175;y<195;y++)darkest=Math.min(darkest,text.getPixel(100,y)&255);text.recycle();if(darkest>8)throw new IOException("Filtered text stroke lost contrast");
      return new JSONObject().put("toneCases",results).put("textBlack",darkest).put("boundedSourceRows",true).put("denseDecode",denseDecodeSampling(resize,check,noop)).put("formats",antialiasTest());
    }finally{source.recycle();}
  }
  private JSONArray denseDecodeSampling(java.lang.reflect.Method resize,Class<?> check,Object noop)throws Exception {
    Class<?> decoder=Class.forName("io.github.lorcinv.omicomic.ReaderBitmapDecoder");
    java.lang.reflect.Method decode=decoder.getDeclaredMethod("decode",byte[].class,int.class,check);decode.setAccessible(true);
    int width=3200,height=4000;android.graphics.Bitmap source=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888);int[] row=new int[width];JSONArray results=new JSONArray();
    try{
      for(int pitch:new int[]{3,5,10,12,13}){
        int period=pitch==13?10:pitch;
        for(int y=0;y<height;y++){for(int x=0;x<width;x++)row[x]=((x%period<period/2)==(y%period<period/2))?0xff000000:0xffffffff;if(pitch==13)row[y%width]=0xff7f7f7f;source.setPixels(row,0,width,0,y,width,1);}
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();source.compress(android.graphics.Bitmap.CompressFormat.PNG,100,bytes);
        long start=SystemClock.uptimeMillis();android.graphics.Bitmap reduced=(android.graphics.Bitmap)decode.invoke(null,bytes.toByteArray(),8,noop);
        android.graphics.Bitmap output=(android.graphics.Bitmap)resize.invoke(null,reduced,264,330,noop);
        double sum=0,sq=0;int count=0;
        for(int y=50;y<280;y++)for(int x=40;x<224;x++){int value=output.getPixel(x,y)&255;sum+=value;sq+=value*value;count++;}
        double mean=sum/count,deviation=Math.sqrt(Math.max(0,sq/count-mean*mean));
        results.put(new JSONObject().put("pitch",period).put("nonrepeating",pitch==13).put("mean",mean).put("deviation",deviation).put("filterMs",SystemClock.uptimeMillis()-start));
        reduced.recycle();output.recycle();
        if(deviation>2.5)throw new IOException("PNG decode baked in dense tone aliasing at pitch "+pitch+": "+deviation);
      }
      return results;
    }finally{source.recycle();}
  }
  private JSONObject nativeFrameMessage(Object surface,Object frame)throws Exception {
    android.graphics.RectF clip=(android.graphics.RectF)field(frame,"clip");JSONArray slots=new JSONArray();
    for(Object slot:(java.util.List<?>)field(frame,"slots")){
      android.graphics.RectF r=(android.graphics.RectF)field(slot,"rect");
      slots.put(new JSONObject().put("url",field(slot,"url")).put("alpha",field(slot,"alpha")).put("rect",new JSONArray(new float[]{r.left,r.top,r.right,r.bottom})));
    }
    return new JSONObject().put("session",field(surface,"session")).put("viewportWidth",((View)surface).getWidth()).put("clip",new JSONArray(new float[]{clip.left,clip.top,clip.right,clip.bottom})).put("slots",slots).put("nativeExpected",true);
  }
  private void nativePendingFrameTest(Object surface,Object library,String url)throws Exception {
    // Exercise pending decode independently of the live bridge sequence. Injecting
    // synthetic sequence numbers here would make later real UI frames look stale.
    java.lang.reflect.Method load=surface.getClass().getDeclaredMethod("load",String.class,int.class,int.class,long.class),frame=surface.getClass().getDeclaredMethod("applyFrame",JSONObject.class);
    load.setAccessible(true);frame.setAccessible(true);
    JSONObject[] original={null};runOnMainSync(()->{try{original[0]=nativeFrameMessage(surface,field(surface,"current"));}catch(Exception e){throw new RuntimeException(e);}});
    JSONObject target=new JSONObject(original[0].toString());target.getJSONArray("slots").getJSONObject(0).put("url",url);
    ExecutorService worker=Executors.newSingleThreadExecutor();Future<?> request=null;
    java.util.concurrent.locks.Lock write=((java.util.concurrent.locks.ReentrantReadWriteLock)field(library,"fileAccess")).writeLock();
    try {
      write.lock();
      try {
        synchronized(field(surface,"cacheLock")){if(((java.util.Map<?,?>)field(surface,"cache")).containsKey(url))throw new IOException("Race fixture was already decoded");}
        long generation=(Long)field(surface,"generation");
        request=worker.submit(()->{try{load.invoke(surface,url,1080,1920,generation);}catch(Exception e){throw new RuntimeException(e);}});
        long deadline=SystemClock.uptimeMillis()+2000;
        while(true){boolean pending;synchronized(field(surface,"cacheLock")){pending=((java.util.Map<?,?>)field(surface,"pending")).containsKey(url);}if(pending)break;if(SystemClock.uptimeMillis()>deadline)throw new IOException("Decode did not enter pending state");Thread.sleep(10);}
        runOnMainSync(()->{try{frame.invoke(surface,target);}catch(Exception e){throw new RuntimeException(e);}});
        deadline=SystemClock.uptimeMillis()+2000;
        while(true){boolean[] retained={false};runOnMainSync(()->{try{retained[0]=field(surface,"pendingFrame")!=null;Object current=field(surface,"current");if(url.equals(field(((java.util.List<?>)field(current,"slots")).get(0),"url")))throw new IOException("Old frame cleared before decode completed");}catch(Exception e){throw new RuntimeException(e);}});if(retained[0])break;if(SystemClock.uptimeMillis()>deadline)throw new IOException("Pending frame was not retained");Thread.sleep(20);}
      }finally{write.unlock();}
      request.get(10,TimeUnit.SECONDS);
      long deadline=SystemClock.uptimeMillis()+3000;
      while(true){boolean[] ready={false};runOnMainSync(()->{try{Object current=field(surface,"current");ready[0]=field(surface,"pendingFrame")==null&&url.equals(field(((java.util.List<?>)field(current,"slots")).get(0),"url"));}catch(Exception e){throw new RuntimeException(e);}});if(ready[0])break;if(SystemClock.uptimeMillis()>deadline)throw new IOException("Completed decode did not wake the pending frame");Thread.sleep(20);}
    }finally{worker.shutdownNow();runOnMainSync(()->{try{frame.invoke(surface,original[0]);}catch(Exception e){throw new RuntimeException(e);}});}
  }
  private JSONObject nativePreviewTest(Object surface,Object library,JSONObject page)throws Exception {
    Object cache=field(library,"thumbnails");java.lang.reflect.Method clear=cache.getClass().getDeclaredMethod("clear");clear.setAccessible(true);clear.invoke(cache);
    java.lang.reflect.Method call=library.getClass().getDeclaredMethod("call",String.class,JSONObject.class),media=library.getClass().getDeclaredMethod("media",String.class);
    call.setAccessible(true);media.setAccessible(true);
    JSONObject result=(JSONObject)call.invoke(library,"getPageImage",page.put("preview",true));String key=android.net.Uri.parse(result.getString("url")).getLastPathSegment();
    long before=(Long)field(surface,"previewHits"),started=SystemClock.uptimeMillis();ExecutorService worker=Executors.newSingleThreadExecutor();
    try{synchronized(field(library,"previewLock")){
      Future<Integer> image=worker.submit(()->{try(InputStream input=((android.webkit.WebResourceResponse)media.invoke(library,key)).getData()){android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeStream(input);if(bitmap==null)throw new IOException("Native preview could not decode");int width=bitmap.getWidth();bitmap.recycle();return width;}});
      int width=image.get(2,TimeUnit.SECONDS);if(width<=0||width>480)throw new IOException("Native preview dimensions wrong");
    }}finally{worker.shutdownNow();}
    long hits=(Long)field(surface,"previewHits")-before;if(hits<1)throw new IOException("Preview did not reuse reader bitmap");
    return new JSONObject().put("ms",SystemClock.uptimeMillis()-started).put("bitmapReuseHits",hits).put("bypassedBlockedDecoder",true);
  }
  private JSONObject stablePixels(JSONObject region)throws Exception {
    int[] origin=new int[2],viewWidth=new int[1];runOnMainSync(()->{web.getLocationOnScreen(origin);viewWidth[0]=web.getWidth();});
    float scale=(float)(viewWidth[0]/region.getDouble("viewport"));int changed=0,samples=8;int[] first=null;
    for(int i=0;i<samples;i++){
      android.graphics.Bitmap bitmap=getUiAutomation().takeScreenshot();if(bitmap==null)throw new IOException("Screenshot unavailable");
      int left=Math.max(0,origin[0]+Math.round((float)region.getDouble("left")*scale)),top=Math.max(0,origin[1]+Math.round((float)region.getDouble("top")*scale));
      int width=Math.min(bitmap.getWidth()-left,Math.round((float)region.getDouble("width")*scale)),height=Math.min(bitmap.getHeight()-top,Math.round((float)region.getDouble("height")*scale));
      int[] pixels=new int[width*height];bitmap.getPixels(pixels,0,width,left,top,width,height);bitmap.recycle();
      if(first==null)first=pixels;else if(!java.util.Arrays.equals(first,pixels))changed++;SystemClock.sleep(120);
    }
    return new JSONObject().put("samples",samples).put("changedSamples",changed).put("pixelsPerSample",first.length);
  }
  private JSONObject tonePixels(JSONObject region)throws Exception {
    int[] origin=new int[2],viewWidth=new int[1];runOnMainSync(()->{web.getLocationOnScreen(origin);viewWidth[0]=web.getWidth();});
    float scale=(float)(viewWidth[0]/region.getDouble("viewport"));android.graphics.Bitmap image=getUiAutomation().takeScreenshot();
    if(image==null)throw new IOException("Tone screenshot unavailable");
    try{
      int left=Math.max(0,origin[0]+Math.round((float)region.getDouble("left")*scale)),top=Math.max(0,origin[1]+Math.round((float)region.getDouble("top")*scale));
      int width=Math.min(image.getWidth()-left,Math.round((float)region.getDouble("width")*scale)),height=Math.min(image.getHeight()-top,Math.round((float)region.getDouble("height")*scale));
      double sum=0,squares=0;int count=0;
      for(int y=0;y<height;y+=2)for(int x=0;x<width;x+=2){int pixel=image.getPixel(left+x,top+y),r=pixel>>>16&255,g=pixel>>>8&255,b=pixel&255;double value=(r+g+b)/3.;sum+=value;squares+=value*value;count++;}
      double mean=sum/count;return new JSONObject().put("mean",mean).put("deviation",Math.sqrt(Math.max(0,squares/count-mean*mean))).put("samples",count);
    }finally{image.recycle();}
  }
  private JSONObject cachePerformanceTest(Object library)throws Exception {
    Class<?> type=Class.forName("io.github.lorcinv.omicomic.DiskCache");
    java.lang.reflect.Constructor<?> ctor=type.getDeclaredConstructor(File.class,long.class);ctor.setAccessible(true);
    File scratch=new File(getTargetContext().getCacheDir(),"budget-test-119");
    Object cache=ctor.newInstance(scratch,100L*1024);
    java.lang.reflect.Method clear=type.getDeclaredMethod("clear"),put=type.getDeclaredMethod("put",String.class,byte[].class),size=type.getDeclaredMethod("size"),limit=type.getDeclaredMethod("setLimit",long.class);
    for(java.lang.reflect.Method method:new java.lang.reflect.Method[]{clear,put,size,limit})method.setAccessible(true);
    clear.invoke(cache);byte[] bytes=new byte[4096];for(int i=0;i<180;i++)put.invoke(cache,"page-"+i,bytes);
    long scans=(Long)field(cache,"scans"),retained=(Long)size.invoke(cache);
    if(scans>=60||retained>100*1024)throw new IOException("Cache eviction rescanned too often or exceeded budget");
    limit.invoke(cache,32L*1024);if((Long)size.invoke(cache)>32*1024)throw new IOException("Lower cache setting not applied");clear.invoke(cache);scratch.delete();
    String key=(String)new JSONTokener(eval("window.__omiWarmPreviewKey")).nextValue();
    java.lang.reflect.Method media=library.getClass().getDeclaredMethod("media",String.class);media.setAccessible(true);
    ExecutorService worker=Executors.newSingleThreadExecutor();long started=SystemClock.uptimeMillis();
    try { synchronized(field(library,"previewLock")) {
      Future<?> warm=worker.submit(()->{try{((android.webkit.WebResourceResponse)media.invoke(library,key)).getData().close();}catch(Exception e){throw new RuntimeException(e);}});
      warm.get(2,TimeUnit.SECONDS);
    }}finally{worker.shutdownNow();}
    long warmMs=SystemClock.uptimeMillis()-started;
    synchronized(library) {
      eval("window.__omiPageRequestDone=false;window.omicomic.getPageImage(window.__omiPage).then(r=>window.__omiPageRequestDone=r.ok)");
      long deadline=SystemClock.uptimeMillis()+2000;
      while(!"true".equals(eval("window.__omiPageRequestDone"))){if(SystemClock.uptimeMillis()>deadline)throw new IOException("Page URL blocked by data writer");Thread.sleep(20);}
    }
    synchronized(field(library,"dataLock")){
      eval("window.__omiSaveDone=false;window.__omiOpenDone=false;window.omicomic.updateSettings({readerPreloadPages:3}).then(r=>window.__omiSaveDone=r.ok);Promise.all([window.omicomic.getResourcePages({path:window.__omiPage.sourcePath}),window.omicomic.getAppData()]).then(r=>window.__omiOpenDone=r.every(v=>v.ok))");
      long deadline=SystemClock.uptimeMillis()+2000;while(!"true".equals(eval("window.__omiOpenDone"))){if(SystemClock.uptimeMillis()>deadline)throw new IOException("Opening blocked by pending save");Thread.sleep(20);}
      if(!"false".equals(eval("window.__omiSaveDone")))throw new IOException("Save gate was not held");
    }
    long deadline=SystemClock.uptimeMillis()+2000;while(!"true".equals(eval("window.__omiSaveDone"))){if(SystemClock.uptimeMillis()>deadline)throw new IOException("Save did not complete after release");Thread.sleep(20);}
    return new JSONObject().put("writes",180).put("evictionScans",scans).put("retainedBytes",retained).put("lowerBudgetApplied",true).put("warmPreviewBypassesDecoderMs",warmMs).put("pageRequestBypassesDataWriter",true).put("openingBypassesPendingSave",true);
  }
  private JSONObject storageTest(Object library)throws Exception {
    Class<?> type=library.getClass();
    java.lang.reflect.Method grant=type.getDeclaredMethod("addGrant",android.net.Uri.class,boolean.class);grant.setAccessible(true);
    java.lang.reflect.Method call=type.getDeclaredMethod("call",String.class,JSONObject.class);call.setAccessible(true);
    String path=(String)grant.invoke(library,android.net.Uri.parse("content://io.github.lorcinv.omicomic.test.pipe/document/stream"),false);
    String largePath=(String)grant.invoke(library,android.net.Uri.parse("content://io.github.lorcinv.omicomic.test.pipe/document/large"),false);
    try {
      long before=(long)field(library,"copiedBytes");
      try {call.invoke(library,"getResourcePages",new JSONObject().put("path",largePath));throw new IOException("Oversized streaming source was accepted");}
      catch(java.lang.reflect.InvocationTargetException expected){if(!(expected.getCause() instanceof IOException)||!expected.getCause().getMessage().contains("1 GB"))throw expected;}
      if((long)field(library,"copiedBytes")!=before)throw new IOException("Oversized streaming source was copied");
      JSONObject cover=(JSONObject)call.invoke(library,"getThumbnail",new JSONObject().put("path",path));
      if((long)field(library,"copiedBytes")!=before)throw new IOException("Cover metadata copied the streaming archive");
      java.lang.reflect.Method media=type.getDeclaredMethod("media",String.class);media.setAccessible(true);
      try {media.invoke(library,android.net.Uri.parse(cover.getString("url")).getLastPathSegment());throw new IOException("Background preview consumed a streaming document");}
      catch(java.lang.reflect.InvocationTargetException expected){if(!(expected.getCause() instanceof IOException))throw expected;}
      try {call.invoke(library,"openDocument",new JSONObject().put("path",path).put("type","pdf").put("id","stream-cover").put("purpose","thumbnail"));throw new IOException("Document cover copied a streaming source");}
      catch(java.lang.reflect.InvocationTargetException expected){if(!(expected.getCause() instanceof IOException))throw expected;}
      if((long)field(library,"copiedBytes")!=before)throw new IOException("Document cover copied a streaming source");
      JSONObject pages=(JSONObject)call.invoke(library,"getResourcePages",new JSONObject().put("path",path));
      if(pages.getInt("total")!=3)throw new IOException("Streaming fallback lost pages");
      long copied=(long)field(library,"copiedBytes");if(copied<=before)throw new IOException("Streaming archive was not cached");
      call.invoke(library,"releaseReaderResource",new JSONObject().put("path",path));
      call.invoke(library,"getResourcePages",new JSONObject().put("path",path));
      if((long)field(library,"copiedBytes")!=copied)throw new IOException("Streaming archive was copied twice");
      JSONObject page=pages.getJSONArray("pages").getJSONObject(1);
      JSONObject image=(JSONObject)call.invoke(library,"getPageImage",page);
      android.webkit.WebResourceResponse response=(android.webkit.WebResourceResponse)media.invoke(library,android.net.Uri.parse(image.getString("url")).getLastPathSegment());
      try(InputStream input=response.getData()){
        android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeStream(input);
        if(bitmap==null||bitmap.getWidth()!=800)throw new IOException("Cached streaming page failed to decode");bitmap.recycle();
      }
      return new JSONObject().put("backgroundDidNotCopy",true).put("copiedOnce",true).put("pageDecodedAfterReopen",true).put("copiedBytes",copied-before).put("oversizedReportedStreamRejectedBeforeCopy",true);
    }finally{getTargetContext().getSharedPreferences("omi-grants",0).edit().remove(path).remove(largePath).commit();}
  }
  private void clearCache(File directory)throws IOException {
    File base=getTargetContext().getCacheDir().getCanonicalFile();
    if(!directory.getCanonicalPath().startsWith(base.getPath()+File.separator))throw new IOException("Refusing non-cache deletion");
    File[] files=directory.listFiles();if(files!=null)for(File file:files){if(file.isDirectory())clearCache(file);else file.delete();}
    directory.delete();
  }
  @Override public void onStart() {
    Bundle output=new Bundle();
    try {
      java.util.List<Float> launchFrames=java.util.Collections.synchronizedList(new java.util.ArrayList<>());
      java.util.List<Long> launchTimes=java.util.Collections.synchronizedList(new java.util.ArrayList<>());
      if(args.getString("mode","").startsWith("mobile1120-")||(args.getString("mode","").startsWith("mobile1121-")||args.getString("mode","").startsWith("mobile1122-"))) {
        Application application=(Application)getTargetContext().getApplicationContext();
        runOnMainSync(()->application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks(){
          public void onActivityCreated(Activity activity,Bundle state){
            if(!activity.getClass().getName().endsWith(".MainActivity"))return;
            application.unregisterActivityLifecycleCallbacks(this);
            long end=SystemClock.uptimeMillis()+10000;
            Choreographer.getInstance().postFrameCallback(new Choreographer.FrameCallback(){int shot;public void doFrame(long time){
              try{float progress=launchProgress(activity);launchTimes.add(SystemClock.uptimeMillis()-(end-10000));launchFrames.add(progress);if((args.getString("mode","").startsWith("mobile1121-")||args.getString("mode","").startsWith("mobile1122-"))&&progress>=.2f+shot*.25f&&shot<3)launchShot(activity,++shot);if(progress>=0&&SystemClock.uptimeMillis()<end)Choreographer.getInstance().postFrameCallback(this);}catch(Exception error){throw new RuntimeException(error);}
            }});
          }
          public void onActivityStarted(Activity a){} public void onActivityResumed(Activity a){} public void onActivityPaused(Activity a){} public void onActivityStopped(Activity a){} public void onActivitySaveInstanceState(Activity a,Bundle b){} public void onActivityDestroyed(Activity a){}
        }));
      }
      if("cold".equals(args.getString("cache")))for(String name:new String[]{"reader","covers","archive-indexes","folder-covers","reader-pages","reader-rasters"})clearCache(new File(getTargetContext().getCacheDir(),name));
      Intent entry=new Intent().setClassName("io.github.lorcinv.omicomic","io.github.lorcinv.omicomic.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      if("launcher".equals(args.getString("fixture")))entry.setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
      long launchStarted=SystemClock.uptimeMillis();
      Activity activity=startActivitySync(entry);
      runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
      if(web==null)throw new IOException("WebView missing");
      long deadline=System.currentTimeMillis()+30000;
      String startupSelector=("launch1145".equals(args.getString("mode"))||"display-sampling1149".equals(args.getString("mode")))?".library-layout":".omi-home";
      while(!"true".equals(eval("!!window.omicomic && !!document.querySelector('"+startupSelector+"')"))){if(System.currentTimeMillis()>deadline)throw new IOException("App startup failed: "+eval("document.body.innerText"));Thread.sleep(100);}
      // DOM existence precedes the first composed frame. Do not inject taps
      // through the launch cover while observing its initial reveal.
      long launchDeadline=SystemClock.uptimeMillis()+6000;
      while(true){boolean[] covered={false};runOnMainSync(()->{try{covered[0]=launchProgress(activity)>=0;}catch(NoSuchFieldException legacy){}catch(Exception error){throw new RuntimeException(error);}});if(!covered[0])break;if(SystemClock.uptimeMillis()>launchDeadline)throw new IOException("Launch cover did not close");Thread.sleep(20);}
      long launchReadyMs=SystemClock.uptimeMillis()-launchStarted;
      String mode=args.getString("mode","smoke");
      java.util.Map<String,Integer> mainSamples=new java.util.concurrent.ConcurrentHashMap<>();
      java.util.concurrent.atomic.AtomicBoolean sampling=new java.util.concurrent.atomic.AtomicBoolean(mode.equals("native-speed"));
      if(sampling.get()){Thread sampler=new Thread(()->{while(sampling.get()){
        StackTraceElement[] stack=Looper.getMainLooper().getThread().getStackTrace();StringBuilder key=new StringBuilder();
        for(int i=0;i<Math.min(9,stack.length);i++)key.append(stack[i]).append('\n');mainSamples.merge(key.toString(),1,Integer::sum);
        SystemClock.sleep(20);
      }},"test-main-sampler");sampler.setDaemon(true);sampler.start();}
      android.content.pm.PackageInfo packageInfo=getTargetContext().getPackageManager().getPackageInfo("io.github.lorcinv.omicomic",0);
      String expectedVersion=args.getString("expectedVersion",packageInfo.versionName);
      if(!expectedVersion.equals(packageInfo.versionName))throw new IOException("Installed APK version mismatch: "+packageInfo.versionName);
      org.json.JSONObject externalLink=new org.json.JSONObject();
      android.app.Instrumentation.ActivityMonitor externalMonitor=new android.app.Instrumentation.ActivityMonitor(){
        @Override public android.app.Instrumentation.ActivityResult onStartActivity(android.content.Intent intent){
          if("about".equals(args.getString("mode"))&&android.content.Intent.ACTION_VIEW.equals(intent.getAction())){
            try{externalLink.put("action",intent.getAction()).put("url",intent.getDataString());}catch(org.json.JSONException error){throw new RuntimeException(error);}
            return new android.app.Instrumentation.ActivityResult(android.app.Activity.RESULT_CANCELED,null);
          }
          return null;
        }
      };
      if("about".equals(args.getString("mode")))addMonitor(externalMonitor);
      byte[] script;
      try(InputStream input=getContext().getAssets().open(mode+".js");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)bytes.write(buffer,0,n);script=bytes.toByteArray();}
      eval("window.__omiFixture="+JSONObject.quote(args.getString("fixture",""))+";window.__omiResult=null; (async()=>{const info=await window.omicomic.getAppInfo();if(info.version!=="+JSONObject.quote(expectedVersion)+")throw new Error('Displayed version mismatch: '+info.version);"+new String(script,StandardCharsets.UTF_8)+"})().then(result=>window.__omiResult={ok:true,result},error=>window.__omiResult={ok:false,error:String(error.stack||error),body:document.body.innerText.slice(-2500)});");
      deadline=System.currentTimeMillis()+((mode.startsWith("mobile1123-"))?1200000:(mode.startsWith("mobile1117"))?600000:(mode.startsWith("mobile1116")||mode.equals("formats1142")||mode.startsWith("mobile-fixes")||mode.equals("interface-polish")||mode.equals("theme-polish")||mode.equals("loading"))?240000:150000);
      String result;
      if(mode.equals("authorize1141")){
        // A background WebView pauses JavaScript callbacks while SAF owns the window.
        // Wait on the native picker lifecycle instead of evaluating that WebView.
        boolean opened=false;
        while(true){
          int[] picker={-1};runOnMainSync(()->{try{picker[0]=(Integer)field(activity,"pickerId");}catch(Exception error){throw new RuntimeException(error);}});
          if(picker[0]>=0)opened=true;
          if(opened&&picker[0]<0)break;
          if(System.currentTimeMillis()>deadline)throw new IOException("Directory authorization timed out");
          Thread.sleep(100);
        }
        Thread.sleep(500);
      }
      long continuousTouchDown=0;
      SceneFrames[] sceneFrames={null};
      while("null".equals(result=eval("JSON.stringify(window.__omiResult)"))||"\"null\"".equals(result)){
        if(System.currentTimeMillis()>deadline)throw new IOException("Smoke timed out: "+eval("document.body.innerText"));
        if("true".equals(eval("window.__omiDisplaySamplingCheck===true"))){JSONObject sampled=displaySamplingTest();eval("window.__omiDisplaySamplingResult="+sampled+";window.__omiDisplaySamplingCheck=false");}
        String toneRequest=(String)new JSONTokener(eval("JSON.stringify(window.__omiToneRegion||null)")).nextValue();
        if(toneRequest!=null&&!"null".equals(toneRequest)){JSONObject pixels=tonePixels(new JSONObject(toneRequest));eval("window.__omiTonePixels="+pixels+";window.__omiToneRegion=null");}
        if("true".equals(eval("window.__omiCatalogProviderTest===true"))){
          JSONObject checks=new CatalogChecks(field(activity,"library"),getTargetContext()).run();
          eval("window.__omiCatalogProviderResult="+checks+";window.__omiCatalogProviderTest=false");
        }
        String libraryProbe=eval("JSON.stringify(window.__omiLibraryProbe||null)");
        if(!"null".equals(libraryProbe)&&!"\"null\"".equals(libraryProbe)){
          JSONObject request=new JSONObject((String)new JSONTokener(libraryProbe).nextValue());
          Object library=field(activity,"library");
          if(request.optString("action").equals("clear-hot")){
            ((java.util.concurrent.ExecutorService)field(library,"indexWrites")).submit(()->{}).get(5,TimeUnit.SECONDS);
            synchronized(field(library,"metadataLock")){
              ((java.util.Map<?,?>)field(library,"entries")).clear();
              ((java.util.Map<?,?>)field(library,"directories")).clear();
              ((java.util.Map<?,?>)field(library,"directoryTimes")).clear();
            }
          }
          JSONObject metrics=new JSONObject();
          for(String metric:new String[]{"directoryQueries","scannerQueries","scannerIndexHits","scannerBatches","scannerBytes","scannerLockWaitNanos","scannerLockNanos","resolveQueries","directoryIndexHits","uriIndexHits"})metrics.put(metric,field(library,metric));
          metrics.put("javaUsedBytes",Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory()).put("nativeHeapBytes",android.os.Debug.getNativeHeapAllocatedSize());
          metrics.put("previewIndexBuilds",field(field(library,"previewArchives"),"indexBuilds"));
          metrics.put("directoryDbVersion",((android.database.sqlite.SQLiteOpenHelper)field(library,"directoryIndex")).getReadableDatabase().getVersion());
          metrics.put("catalogPaused",field(library,"catalogPaused"));
          eval("window.__omiLibraryMetrics="+metrics+";window.__omiLibraryProbe=null");
        }
        if("true".equals(eval("window.__omiShortLifecycle===true"))){
          JSONObject resumed=lifecycle(activity,"icon");
          eval("window.__omiShortLifecycleResult="+resumed+";window.__omiShortLifecycle=false");
        }
        if("true".equals(eval("window.__omiQuickLock===true"))){
          JSONObject resumed=lifecycle(activity,"lock-1500");
          eval("window.__omiQuickLockResult="+resumed+";window.__omiQuickLock=false");
        }
        if((mode.startsWith("mobile1121-")||mode.startsWith("mobile1122-")||mode.startsWith("mobile1123-")||mode.equals("mobile1138-entry"))){
        if("true".equals(eval("window.__omiFrameProbe===true"))){runOnMainSync(()->{sceneFrames[0]=new SceneFrames(activity);Choreographer.getInstance().postFrameCallback(sceneFrames[0]);});eval("window.__omiFrameProbe=false");}
        if("true".equals(eval("window.__omiFrameProbeStop===true"))){if(mode.equals("mobile1138-entry"))awaitSceneSettled(activity);JSONObject[] captured={null};runOnMainSync(()->{try{captured[0]=sceneFrames[0].result();}catch(Exception error){throw new RuntimeException(error);}});eval("window.__omiFrameProbeResult="+captured[0]+";window.__omiFrameProbeStop=false");}
        String lifecycleRoute=(String)new JSONTokener(eval("JSON.stringify(window.__omiLifecycle||null)")).nextValue();
        if(lifecycleRoute!=null&&!"null".equals(lifecycleRoute)){String route=(String)new JSONTokener(lifecycleRoute).nextValue();JSONObject resumed=lifecycle(activity,route);eval("window.__omiLifecycleResult="+resumed+";window.__omiLifecycle=null");}
        }
        if("true".equals(eval("window.__omiStalePreview===true"))){stalePreview(field(activity,"readerSurface"));eval("window.__omiStalePreview=false");}
        if("true".equals(eval("window.__omiTransientRefinement===true"))){
          Object surface=field(activity,"readerSurface"),library=field(activity,"library");Object[] raster={null};
          runOnMainSync(()->{try{raster[0]=field(((java.util.List<?>)field(field(surface,"current"),"slots")).get(0),"raster");}catch(Exception e){throw new RuntimeException(e);}});
          String mediaKey=android.net.Uri.parse((String)field(raster[0],"url")).getLastPathSegment();
          @SuppressWarnings("unchecked") java.util.Map<String,Object> media=(java.util.Map<String,Object>)field(library,"media");Object saved;
          synchronized(media){saved=media.remove(mediaKey);}
          try{stalePreview(surface);Thread.sleep(350);}finally{synchronized(media){media.put(mediaKey,saved);}}
          eval("window.__omiTransientRefinement=false");
        }
        if("true".equals(eval("window.__omiSessionScratch===true"))){
          Object library=field(activity,"library");
          if(!((java.util.concurrent.atomic.AtomicBoolean)field(library,"readerSessionActive")).get())throw new AssertionError("Document reader session must be active");
          File scratch=new File((File)field(library,"cache"),"document-session-117");
          try(java.io.FileOutputStream scratchOutput=new java.io.FileOutputStream(scratch)){scratchOutput.write(new byte[128*1024]);}
          Object pages=field(library,"readerPages");java.lang.reflect.Method put=pages.getClass().getDeclaredMethod("put",String.class,byte[].class);put.setAccessible(true);put.invoke(pages,"document-session-117",new byte[128*1024]);
          eval("window.__omiSessionScratch=false");
        }
        if("true".equals(eval("window.__omiSessionScratchCheck===true"))){
          Object library=field(activity,"library");
          if(((java.util.concurrent.atomic.AtomicBoolean)field(library,"readerSessionActive")).get())throw new AssertionError("Document reader session must be closed");
          boolean removed=!new File((File)field(library,"cache"),"document-session-117").exists();
          eval("window.__omiSessionScratchRemoved="+removed+";window.__omiSessionScratchCheck=false");
        }
        String pngUrl=eval("window.__omiPngBench||null");
        if(!"null".equals(pngUrl)){JSONObject report=pngBench(field(activity,"library"),(String)new JSONTokener(pngUrl).nextValue());eval("window.__omiPngBenchResult="+report+";window.__omiPngBench=null");}
        String previewPage=(String)new JSONTokener(eval("JSON.stringify(window.__omiPreviewPage||null)")).nextValue();
        if("true".equals(eval("window.__omiEvictNeighborRasters===true"))){
          Object surface=field(activity,"readerSurface");
          synchronized(field(surface,"cacheLock")){
            java.util.Map<?,?> cache=(java.util.Map<?,?>)field(surface,"cache");java.util.Set<?> pinned=(java.util.Set<?>)field(surface,"pinned");
            cache.keySet().removeIf(key->!pinned.contains(key));long bytes=0;
            for(Object raster:cache.values())bytes+=((android.graphics.Bitmap)field(raster,"bitmap")).getAllocationByteCount();
            java.lang.reflect.Field size=surface.getClass().getDeclaredField("bytes");size.setAccessible(true);size.setLong(surface,bytes);
            if((Long)field(surface,"previewBytes")>4L*1024*1024)throw new IOException("Preview fallback exceeded its budget");
          }
          runOnMainSync(()->((View)surface).invalidate());eval("window.__omiEvictNeighborRasters=false");
        }
        if("true".equals(eval("window.__omiAliasProbe===true"))){JSONObject alias=antialiasTest();eval("window.__omiAliasResult="+alias+";window.__omiAliasProbe=false");}
        if("true".equals(eval("window.__omiRasterCacheProbe===true"))){
          Object surface=field(activity,"readerSurface"),library=field(activity,"library");Object raster=field(((java.util.List<?>)field(field(surface,"current"),"slots")).get(0),"raster");
          java.lang.reflect.Method cached=library.getClass().getDeclaredMethod("readerRaster",String.class,int.class);cached.setAccessible(true);
          byte[] bytes=(byte[])cached.invoke(library,(String)field(raster,"url"),(Integer)field(raster,"sample"));
          eval("window.__omiRasterCacheResult="+(bytes==null?0:bytes.length)+";window.__omiRasterCacheProbe=false");
        }
        if(previewPage!=null&&!"null".equals(previewPage)){JSONObject preview=nativePreviewTest(field(activity,"readerSurface"),field(activity,"library"),new JSONObject(previewPage));eval("window.__omiPreviewResult="+preview+";window.__omiPreviewPage=null");}
        String pixelRegion=(String)new JSONTokener(eval("JSON.stringify(window.__omiPixelRegion||null)")).nextValue();
        if(pixelRegion!=null&&!"null".equals(pixelRegion)){JSONObject pixels=stablePixels(new JSONObject(pixelRegion));eval("window.__omiPixelResult="+pixels+";window.__omiPixelRegion=null");}
        String pendingFrameUrl=eval("window.__omiNativePendingUrl||null");
        if(!"null".equals(pendingFrameUrl)){nativePendingFrameTest(field(activity,"readerSurface"),field(activity,"library"),(String)new JSONTokener(pendingFrameUrl).nextValue());eval("window.__omiNativePendingPassed=true;window.__omiNativePendingUrl=null");}
        if("true".equals(eval("window.__omiNativeProbe===true"))){
          Object surface=field(activity,"readerSurface");java.lang.reflect.Method stats=surface.getClass().getDeclaredMethod("stats");stats.setAccessible(true);
          Object library=field(activity,"library");java.lang.reflect.Method stored=null;
          try{stored=library.getClass().getDeclaredMethod("hasReaderRaster",String.class,int.class);stored.setAccessible(true);}catch(NoSuchMethodException legacy){}
          final java.lang.reflect.Method hasRaster=stored;
          String[] snapshot={null};runOnMainSync(()->{try{
            JSONObject state=(JSONObject)stats.invoke(surface);Object current=field(surface,"current");JSONArray rasters=new JSONArray();
            if(current!=null)for(Object slot:(java.util.List<?>)field(current,"slots")){Object raster=field(slot,"raster");android.graphics.Bitmap bitmap=(android.graphics.Bitmap)field(raster,"bitmap"),adjusted=(android.graphics.Bitmap)((java.util.Map<?,?>)field(surface,"adjusted")).get((String)field(raster,"url")+":"+field(raster,"sample")+(String)field(surface,"effectsKey"));rasters.put(new JSONObject().put("url",field(raster,"url")).put("width",field(raster,"width")).put("height",field(raster,"height")).put("sample",field(raster,"sample")).put("orientation",field(raster,"orientation")).put("preview",field(raster,"preview")).put("bitmapWidth",bitmap.getWidth()).put("bitmapHeight",bitmap.getHeight()).put("color",bitmap.getPixel(bitmap.getWidth()/4,bitmap.getHeight()/4)).put("adjustedColor",adjusted==null?JSONObject.NULL:adjusted.getPixel(adjusted.getWidth()/4,adjusted.getHeight()/4)));}
            state.put("rasters",rasters).put("adjustedCount",((java.util.Map<?,?>)field(surface,"adjusted")).size());
            if(hasRaster!=null){JSONArray saved=new JSONArray();for(int i=0;i<rasters.length();i++){JSONObject raster=rasters.getJSONObject(i);if(!raster.getBoolean("preview")&&(Boolean)hasRaster.invoke(library,raster.getString("url"),raster.getInt("sample")))saved.put(raster.getString("url"));}state.put("persistedVisibleUrls",saved);}
            synchronized(field(surface,"cacheLock")){
              java.util.Map<?,?> cache=(java.util.Map<?,?>)field(surface,"cache");JSONArray clear=new JSONArray();
              for(Object raster:cache.values())if(!(Boolean)field(raster,"preview"))clear.put(field(raster,"url"));
              state.put("cachedUrls",new JSONArray(cache.keySet())).put("clearCachedUrls",clear).put("previewCachedUrls",new JSONArray(((java.util.Map<?,?>)field(surface,"previewCache")).keySet())).put("previewBytes",field(surface,"previewBytes"));
            }
            snapshot[0]=state.toString();
          }catch(Exception error){throw new RuntimeException(error);}});
          eval("window.__omiNativeStats="+snapshot[0]+";window.__omiNativeProbe=false");
        }
        String keyRequest=eval("window.__omiKey||null");
        if(!"null".equals(keyRequest)){
          int keyCode=Integer.parseInt(keyRequest);
          android.media.AudioManager audio=(android.media.AudioManager)getTargetContext().getSystemService(Context.AUDIO_SERVICE);
          int music=audio.getStreamVolume(3),ring=audio.getStreamVolume(2);
          long time=SystemClock.uptimeMillis();
          getUiAutomation().injectInputEvent(new KeyEvent(time,time,KeyEvent.ACTION_DOWN,keyCode,0),true);
          getUiAutomation().injectInputEvent(new KeyEvent(time,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,keyCode,0),true);
          SystemClock.sleep(150);
          JSONObject report=new JSONObject().put("musicBefore",music).put("musicAfter",audio.getStreamVolume(3)).put("ringBefore",ring).put("ringAfter",audio.getStreamVolume(2)).put("capturing",field(activity,"readerVolumeKeys"));
          eval("window.__omiKeyResult="+report+";window.__omiKey=null;");
        }
        String rotation=eval("window.__omiRotation??null");
        if(!"null".equals(rotation)){runOnMainSync(()->activity.setRequestedOrientation(Integer.parseInt(rotation)));eval("window.__omiRotation=null");}
        String shot=(String)new JSONTokener(eval("JSON.stringify(window.__omiShot||null)")).nextValue();
        if(!"null".equals(shot)){
          String name=(String)new JSONTokener(shot).nextValue();
          if(!name.matches("[a-z0-9-]+"))throw new IOException("Invalid screenshot name");
          android.graphics.Bitmap capture=getUiAutomation().takeScreenshot();
          if(capture!=null){try(FileOutputStream file=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name+".png"))){capture.compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);}capture.recycle();}
          eval("window.__omiShot=null");
        }
        String tap=(String)new JSONTokener(eval("JSON.stringify(window.__omiTap||null)")).nextValue();
        if(!"null".equals(tap)){
          JSONObject point=new JSONObject(tap);int[] origin=new int[2],width=new int[1];
          // Logical DOM coordinates are stable before the native slide ends.
          // Do not inject a 60 ms press into a still-moving physical target.
          awaitSceneSettled(activity);
          runOnMainSync(()->{web.getLocationOnScreen(origin);width[0]=web.getWidth();});
          float scale=(float)(width[0]/point.getDouble("viewport"));
          float x=origin[0]+(float)point.getDouble("x")*scale,y=origin[1]+(float)point.getDouble("y")*scale;
          long down=SystemClock.uptimeMillis();
          MotionEvent.PointerProperties finger=new MotionEvent.PointerProperties();finger.id=0;finger.toolType=MotionEvent.TOOL_TYPE_FINGER;
          MotionEvent.PointerCoords position=new MotionEvent.PointerCoords();position.x=x;position.y=y;position.pressure=1;position.size=1;
          MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,1,new MotionEvent.PointerProperties[]{finger},new MotionEvent.PointerCoords[]{position},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
          getUiAutomation().injectInputEvent(press,true);press.recycle();SystemClock.sleep(60);
          MotionEvent release=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,1,new MotionEvent.PointerProperties[]{finger},new MotionEvent.PointerCoords[]{position},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
          getUiAutomation().injectInputEvent(release,true);release.recycle();eval("window.__omiTap=null");
        }
        String touch=(String)new JSONTokener(eval("JSON.stringify(window.__omiTouch||null)")).nextValue();
        if(!"null".equals(touch)){
          JSONObject request=new JSONObject(touch);int[] origin=new int[2],width=new int[1];
          runOnMainSync(()->{web.getLocationOnScreen(origin);width[0]=web.getWidth();});
          String action=request.getString("action");long now=SystemClock.uptimeMillis();
          if("down".equals(action))continuousTouchDown=now;
          int kind="down".equals(action)?MotionEvent.ACTION_DOWN:"up".equals(action)?MotionEvent.ACTION_UP:"cancel".equals(action)?MotionEvent.ACTION_CANCEL:MotionEvent.ACTION_MOVE;
          float scale=(float)(width[0]/request.getDouble("viewport"));
          MotionEvent.PointerProperties finger=new MotionEvent.PointerProperties();finger.id=0;finger.toolType=MotionEvent.TOOL_TYPE_FINGER;
          MotionEvent.PointerCoords point=new MotionEvent.PointerCoords();point.pressure=1;point.size=1;
          point.x=origin[0]+(float)request.getDouble("x")*scale;point.y=origin[1]+(float)request.getDouble("y")*scale;
          MotionEvent event=MotionEvent.obtain(continuousTouchDown,now,kind,1,new MotionEvent.PointerProperties[]{finger},new MotionEvent.PointerCoords[]{point},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
          getUiAutomation().injectInputEvent(event,true);event.recycle();eval("window.__omiTouch=null");
        }
        String drag=(String)new JSONTokener(eval("JSON.stringify(window.__omiDrag||null)")).nextValue();
        if(!"null".equals(drag)){
          JSONObject request=new JSONObject(drag),from=request.getJSONObject("from"),to=request.getJSONObject("to");int[] origin=new int[2],width=new int[1];
          runOnMainSync(()->{web.getLocationOnScreen(origin);width[0]=web.getWidth();});
          float scale=(float)(width[0]/request.getDouble("viewport"));long down=SystemClock.uptimeMillis();
          MotionEvent.PointerProperties finger=new MotionEvent.PointerProperties();finger.id=0;finger.toolType=MotionEvent.TOOL_TYPE_FINGER;
          for(int step=0;step<=12;step++){
            float fraction=Math.min(1,step/11f);
            MotionEvent.PointerCoords position=new MotionEvent.PointerCoords();position.pressure=1;position.size=1;
            position.x=origin[0]+(float)(from.getDouble("x")+(to.getDouble("x")-from.getDouble("x"))*fraction)*scale;
            position.y=origin[1]+(float)(from.getDouble("y")+(to.getDouble("y")-from.getDouble("y"))*fraction)*scale;
            MotionEvent motion=MotionEvent.obtain(down,SystemClock.uptimeMillis(),step==0?MotionEvent.ACTION_DOWN:step==12?MotionEvent.ACTION_UP:MotionEvent.ACTION_MOVE,1,new MotionEvent.PointerProperties[]{finger},new MotionEvent.PointerCoords[]{position},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
            getUiAutomation().injectInputEvent(motion,true);motion.recycle();SystemClock.sleep(step==0?request.optInt("holdMs",80):Math.max(1,request.optInt("stepMs",24)));
          }
          eval("window.__omiDrag=null");
        }
        String pinch=(String)new JSONTokener(eval("JSON.stringify(window.__omiPinch||null)")).nextValue();
        if(!"null".equals(pinch)){
          JSONObject request=new JSONObject(pinch);int[] origin=new int[2],width=new int[1];runOnMainSync(()->{web.getLocationOnScreen(origin);width[0]=web.getWidth();});
          float scale=(float)(width[0]/request.getDouble("viewport"));long down=SystemClock.uptimeMillis();
          MotionEvent.PointerProperties[] fingers=new MotionEvent.PointerProperties[2];MotionEvent.PointerCoords[] points=new MotionEvent.PointerCoords[2];
          for(int i=0;i<2;i++){fingers[i]=new MotionEvent.PointerProperties();fingers[i].id=i;fingers[i].toolType=MotionEvent.TOOL_TYPE_FINGER;points[i]=new MotionEvent.PointerCoords();points[i].pressure=1;points[i].size=1;}
          for(int step=0;step<=23;step++){
            float radius=(float)(request.getDouble("from")+(request.getDouble("to")-request.getDouble("from"))*Math.max(0,Math.min(1,(step-1)/20f)));
            for(int i=0;i<2;i++){points[i].x=origin[0]+((float)request.getDouble("x")+(i==0?-radius:radius))*scale;points[i].y=origin[1]+(float)request.getDouble("y")*scale;}
            int action=step==0?MotionEvent.ACTION_DOWN:step==1?MotionEvent.ACTION_POINTER_DOWN|256:step==22?MotionEvent.ACTION_POINTER_UP|256:step==23?MotionEvent.ACTION_UP:MotionEvent.ACTION_MOVE;
            MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,step==0||step==23?1:2,fingers,points,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);getUiAutomation().injectInputEvent(event,true);event.recycle();SystemClock.sleep(18);
          }
          eval("window.__omiPinch=null");
        }
        Thread.sleep(100);
      }
      String json=(String)new JSONTokener(result).nextValue();
      JSONObject resultObject=new JSONObject(json);
      if(mode.equals("launch1145")||mode.equals("search1145"))resultObject.put("launchReadyMs",launchReadyMs);
      if(mode.equals("mobile1138-entry")){String trace=(String)new JSONTokener(eval("JSON.stringify(window.__omiEntryTrace||[])")).nextValue();resultObject.put("entryTrace",new JSONArray(trace));}
      if(!resultObject.optBoolean("ok")){String snapshot=(String)new JSONTokener(eval("JSON.stringify(window.__omiNativeStats||null)")).nextValue();if(snapshot!=null&&!snapshot.equals("null"))resultObject.put("lastReaderStats",new JSONObject(snapshot));}
      if(mode.equals("about")){
        removeMonitor(externalMonitor);
        if(!"https://github.com/lorcinv/OmiComic".equals(externalLink.optString("url")))throw new IOException("GitHub browser intent was not dispatched: "+externalLink);
        resultObject.put("externalBrowserIntent",externalLink);
      }
      if(mode.equals("native-codecs")){
        Object library=field(activity,"library");java.lang.reflect.Method image=library.getClass().getDeclaredMethod("readerImage",String.class);image.setAccessible(true);
        String url=(String)new JSONTokener(eval("window.__omiCodecUrl")).nextValue();byte[] data=(byte[])image.invoke(library,url);JSONArray measures=new JSONArray();
        for(int trial=0;trial<2;trial++)for(int codec=0;codec<4;codec++){
          long started=SystemClock.uptimeMillis();android.graphics.Bitmap bitmap;
          if(codec==0){android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();opts.inSampleSize=8;bitmap=android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,opts);}
          else if(codec<3){final int allocator=codec==1?android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE:android.graphics.ImageDecoder.ALLOCATOR_HARDWARE;bitmap=android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data)),(decoder,info,source)->{decoder.setAllocator(allocator);decoder.setTargetSampleSize(8);});}
          else {android.graphics.BitmapRegionDecoder decoder=android.graphics.BitmapRegionDecoder.newInstance(data,0,data.length,false);android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();opts.inSampleSize=8;bitmap=decoder.decodeRegion(new android.graphics.Rect(0,0,decoder.getWidth(),decoder.getHeight()),opts);decoder.recycle();}
          measures.put(new JSONObject().put("codec",codec).put("ms",SystemClock.uptimeMillis()-started).put("width",bitmap.getWidth()).put("height",bitmap.getHeight()));bitmap.recycle();
        }resultObject.put("codecs",measures);
      }
      if(mode.equals("native-reader")){
        Object surface=field(activity,"readerSurface");java.lang.reflect.Method stats=surface.getClass().getDeclaredMethod("stats");stats.setAccessible(true);
        JSONObject[] snapshot={null};runOnMainSync(()->{try{snapshot[0]=(JSONObject)stats.invoke(surface);}catch(Exception error){throw new RuntimeException(error);}});resultObject.put("nativeReader",snapshot[0]);
      }
      if(mode.equals("loading")&&packageInfo.versionCode>=10109&&resultObject.optBoolean("ok"))resultObject.put("cacheChecks",cachePerformanceTest(field(activity,"library")));
      if(mode.equals("storage"))resultObject.put("storage",storageTest(field(activity,"library")));
      android.graphics.drawable.Drawable icon=getTargetContext().getApplicationInfo().loadIcon(getTargetContext().getPackageManager());
      boolean adaptive=icon instanceof android.graphics.drawable.AdaptiveIconDrawable;
      boolean monochrome=Build.VERSION.SDK_INT>=33&&adaptive&&((android.graphics.drawable.AdaptiveIconDrawable)icon).getMonochrome()!=null;
      String archiveVersion=new String((byte[])Class.forName("me.zhanghai.android.libarchive.Archive").getMethod("versionDetails").invoke(null),StandardCharsets.UTF_8);
      JSONObject appearance=new JSONObject().put("version",packageInfo.versionName).put("versionCode",packageInfo.versionCode).put("displayedVersionMatches",true).put("adaptiveIcon",adaptive).put("monochromeIcon",monochrome).put("archiveVersion",archiveVersion);
      if((mode.equals("theme-polish")||mode.equals("system-bars"))&&resultObject.optBoolean("ok")) {
        android.graphics.drawable.ColorDrawable background=(android.graphics.drawable.ColorDrawable)((View)field(activity,"rootFrame")).getBackground();
        appearance.put("insetBackground",String.format("#%08x",background.getColor()));
        appearance.put("statusBarColor",String.format("#%08x",activity.getWindow().getStatusBarColor()));
        if(Build.VERSION.SDK_INT>=30)appearance.put("systemBarAppearance",activity.getWindow().getInsetsController().getSystemBarsAppearance());
        if(background.getColor()!=0xff2e3440)throw new IOException("Native night inset background did not follow theme");
        if(Build.VERSION.SDK_INT>=30&&(activity.getWindow().getInsetsController().getSystemBarsAppearance()&24)!=0)throw new IOException("Night system bar icons are not light");
      }
      resultObject.put("native",appearance);
      if(mode.equals("mobile1138-entry")&&resultObject.optBoolean("ok")&&!args.getString("fixture","").equals("observe"))resultObject.put("homeRevealCancellation",homeRevealCancellationTest(activity));
      if(mode.startsWith("mobile1123-")){Bundle progress=new Bundle();progress.putString("runtimeResult",resultObject.toString());sendStatus(0,progress);}
      if(mode.startsWith("mobile1122-")||mode.startsWith("mobile1123-"))resultObject.put("resumeDrawGate",resumeGateTest(activity));
      if(mode.startsWith("mobile1120-")||(mode.startsWith("mobile1121-")||mode.startsWith("mobile1122-"))){
        boolean animated=android.animation.ValueAnimator.areAnimatorsEnabled();
        if(!launchFrames.contains(-1f)||(animated&&(!launchFrames.contains(0f)||!launchFrames.stream().anyMatch(progress->progress>0&&progress<1))))throw new IOException("Startup did not show a complete reveal: "+launchFrames+"; ms="+launchTimes+"; animator="+animated);
        resultObject.put("systemAnimationsEnabled",animated);
        resultObject.put("launchRadiusProgress",new JSONArray(launchFrames));
        resultObject.put("launchFrameMs",new JSONArray(launchTimes));
      }
      sampling.set(false);
      if(mode.equals("native-speed")){JSONArray samples=new JSONArray();java.util.List<java.util.Map.Entry<String,Integer>> entries=new java.util.ArrayList<>(mainSamples.entrySet());entries.sort((a,b)->Integer.compare(b.getValue(),a.getValue()));for(int i=0;i<Math.min(12,entries.size());i++)samples.put(new JSONObject().put("count",entries.get(i).getValue()).put("stack",entries.get(i).getKey()));resultObject.put("mainSamples",samples);}
      try {
        Object library=field(activity,"library");
        JSONObject io=new JSONObject().put("directoryQueries",field(library,"directoryQueries")).put("wholeArchiveCopiedBytes",field(library,"copiedBytes"));
        try{for(String metric:new String[]{"scannerQueries","scannerIndexHits","scannerBatches","scannerBytes","scannerLockWaitNanos","scannerLockNanos","resolveQueries","directoryIndexHits","uriIndexHits"})io.put(metric,field(library,metric));io.put("javaUsedBytes",Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory()).put("nativeHeapBytes",android.os.Debug.getNativeHeapAllocatedSize());}catch(NoSuchFieldException legacy){}
        io.put("readerIndexBuilds",field(field(library,"nativeArchives"),"indexBuilds"));
        io.put("previewIndexBuilds",field(field(library,"previewArchives"),"indexBuilds"));
        try{io.put("readerPageDecodes",field(field(library,"nativeArchives"),"pageDecodes")).put("readerPageDiskHits",field(field(library,"nativeArchives"),"pageDiskHits"));}catch(NoSuchFieldException legacy){}
        try{io.put("folderCoverHits",field(library,"folderCoverHits")).put("folderCoverSteps",field(library,"folderCoverSteps"));}catch(NoSuchFieldException legacy){}
        try{io.put("zipRandomReads",field(field(library,"nativeArchives"),"zipRandomReads")).put("uriIndexHits",field(library,"uriIndexHits")).put("directoryIndexHits",field(library,"directoryIndexHits"));}catch(NoSuchFieldException legacy){}
        resultObject.put("io",io);
        if(mode.equals("loading-restore")){
          if(io.optLong("readerIndexBuilds")!=0)throw new IOException("Restart rebuilt persistent indexes");
          if(packageInfo.versionCode<10117&&(io.optLong("readerPageDecodes")!=0||io.optLong("readerPageDiskHits")<9))throw new IOException("Restart reread archive pages instead of retained cache");
          if(packageInfo.versionCode>=10117&&io.optLong("readerPageDecodes")<9)throw new IOException("Raw session pages survived process restart");
        }
      }catch(NoSuchFieldException legacy){} // The same workload can measure the published 1.0.0 baseline.
      output.putString("result",resultObject.toString());
      File shots=getTargetContext().getExternalFilesDir(null);
      android.graphics.Bitmap iconBitmap=android.graphics.Bitmap.createBitmap(432,432,android.graphics.Bitmap.Config.ARGB_8888);
      icon.setBounds(0,0,432,432);icon.draw(new android.graphics.Canvas(iconBitmap));
      try(FileOutputStream file=new FileOutputStream(new File(shots,"android-icon.png"))){iconBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);}iconBitmap.recycle();
      android.graphics.Bitmap screenshot=getUiAutomation().takeScreenshot();
      if(screenshot!=null){try(FileOutputStream file=new FileOutputStream(new File(shots,"android-"+mode+".png"))){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);}screenshot.recycle();}
      finish(new JSONObject(json).getBoolean("ok")?Activity.RESULT_OK:Activity.RESULT_CANCELED,output);
    }catch(Throwable error){output.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,output);}
  }
}
