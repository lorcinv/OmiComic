package io.github.lorcinv.omicomic;

import android.graphics.*;
import android.view.*;
import android.view.animation.LinearInterpolator;
import android.widget.*;

/** A single snapshot covers both native pixels and web UI during Android navigation. */
final class SceneTransition {
  private final FrameLayout root,content;
  private final Window window;
  private ImageView snapshot;
  private Bitmap bitmap;
  private long id;
  private int generation;
  private boolean suspended;
  private android.animation.Animator reveal;
  private View revealLayer;
  private int previousLayerType;
  static final long READER_ENTER_MS=200;
  private boolean readerPending,readerCapturing;
  private String readerKey;
  private int snapshotLeft,snapshotTop;
  private boolean readerRevealed;
  private Runnable readerBarsReady;
  private final java.util.ArrayList<Runnable> readerCaptureReady=new java.util.ArrayList<>();
  SceneTransition(Window window,FrameLayout root,FrameLayout content){this.window=window;this.root=root;this.content=content;}
  void begin(long request,Runnable ready){
    begin(request,false,ready);
  }
  void begin(long request,boolean coverRoot,Runnable ready){
    if(readerPending&&!suspended){id=request;if(readerCapturing)readerCaptureReady.add(ready);else if(snapshot!=null)FrameCommit.after(snapshot,ready);else ready.run();return;}
    boolean interrupted=snapshot!=null;
    cancel();id=request;
    if(suspended||content.getWidth()==0||content.getHeight()==0){ready.run();return;}
    final int expected=generation;
    // Rapid back/forward must capture the settled page, not the previous
    // transition's translated or half-faded buffer.
    if(interrupted)FrameCommit.after(content,()->capture(expected,coverRoot,ready));
    else capture(expected,coverRoot,ready);
  }
  void readerIntent(String key){
    if(suspended||content.getWidth()==0||content.getHeight()==0)return;
    if(readerPending&&key.equals(readerKey))return;
    cancel();readerKey=key;readerPending=true;readerCapturing=true;final int expected=generation;
    // Hold the outgoing frame at its original size while the saved page loads.
    // Scaling this snapshot makes the whole interface visibly pulse before entry.
    capture(expected,()->{
      if(expected!=generation)return;
      if(snapshot!=null)snapshot.setClickable(true);
      readerCapturing=false;java.util.ArrayList<Runnable> ready=new java.util.ArrayList<>(readerCaptureReady);readerCaptureReady.clear();for(Runnable callback:ready)callback.run();
    });
  }
  void cancelReaderIntent(String key){if(readerPending&&key.equals(readerKey))cancel();}
  void cancel(long request){if(request==id)cancel();}
  void afterReaderCapture(String key,java.util.function.Consumer<Boolean> ready){
    Runnable check=()->ready.accept(readerPending&&!suspended&&key.equals(readerKey)&&snapshot!=null);
    if(readerPending&&!suspended&&key.equals(readerKey)&&readerCapturing)readerCaptureReady.add(check);else check.run();
  }
  boolean deferReaderBars(Runnable ready){
    if(!readerPending||readerRevealed)return false;
    readerBarsReady=ready;return true;
  }
  private void revealReaderBars(){
    readerRevealed=true;
    Runnable ready=readerBarsReady;readerBarsReady=null;if(ready!=null)ready.run();
  }
  private void capture(int expected,Runnable ready){
    capture(expected,readerPending,ready);
  }
  private void capture(int expected,boolean coverRoot,Runnable ready){
    if(expected!=generation||suspended){ready.run();return;}
    try{
      // Reader entry also covers the background behind the time bar. Otherwise
      // the new full-height page peeks through this strip before the slide starts.
      View captured=coverRoot?root:content;
      Bitmap capture=Bitmap.createBitmap(captured.getWidth(),captured.getHeight(),Bitmap.Config.ARGB_8888);
      int[] origin=new int[2];captured.getLocationInWindow(origin);
      Rect area=new Rect(origin[0],origin[1],origin[0]+captured.getWidth(),origin[1]+captured.getHeight());
      // Copy the already composed frame asynchronously; WebView.draw(Canvas)
      // forces a software repaint of the entire scene on the UI thread.
      PixelCopy.request(window,area,capture,result->{
        if(expected==generation&&result==PixelCopy.SUCCESS){
          // Showing/hiding system bars changes the available height during a
          // transition. Keep the outgoing scene at its captured pixel size.
          bitmap=capture;bitmap.setDensity(Bitmap.DENSITY_NONE);
          snapshot=new ImageView(root.getContext());snapshot.setImageBitmap(bitmap);snapshot.setScaleType(ImageView.ScaleType.MATRIX);
          if(root.getBackground() instanceof android.graphics.drawable.ColorDrawable)snapshot.setBackgroundColor(((android.graphics.drawable.ColorDrawable)root.getBackground()).getColor());
          int[] rootOrigin=new int[2];root.getLocationInWindow(rootOrigin);
          snapshotLeft=origin[0]-rootOrigin[0];snapshotTop=origin[1]-rootOrigin[1];
          root.addView(snapshot,snapshotLayout());
          // Do not clear the native reader until its replacement snapshot has
          // actually been submitted to the window compositor.
          FrameCommit.after(snapshot,ready);
        }else{capture.recycle();ready.run();}
      },content.getHandler());
    }catch(IllegalArgumentException|OutOfMemoryError ignored){ready.run();}
  }
  private FrameLayout.LayoutParams snapshotLayout(){
    FrameLayout.LayoutParams layout=new FrameLayout.LayoutParams(bitmap.getWidth(),bitmap.getHeight(),Gravity.TOP|Gravity.LEFT);
    layout.leftMargin=snapshotLeft-root.getPaddingLeft();layout.topMargin=snapshotTop-root.getPaddingTop();return layout;
  }
  void insetsChanged(){
    // FrameLayout padding applies to every child. Anchor the old scene to its
    // captured window coordinates instead of moving it with the new reader.
    if(snapshot!=null&&bitmap!=null)snapshot.setLayoutParams(snapshotLayout());
  }
  void commit(long request,String direction){
    commit(request,direction,36,40);
  }
  void commit(long request,String direction,float x,float y){
    if(suspended||request!=id)return;
    // A failed PixelCopy still has to release the deferred bar policy.
    if(readerPending)revealReaderBars();
    if(snapshot==null)return;
    // A reader layout replacement is already fully composed behind the old
    // frame. Reveal it once, without sliding or rescaling either canvas.
    if(direction.equals("reader-layout")){cancel();return;}
    ImageView old=snapshot;
    old.animate().cancel();
    long duration=readerPending&&direction.equals("forward")?READER_ENTER_MS:direction.equals("replace")?140:240;
    // Slide opaque scenes. Alpha on the WebView group creates a full-screen
    // intermediate render target and can stall the first composited frame.
    if(direction.startsWith("home-")){
      boolean opening=direction.equals("home-expand");
      if(opening&&content.isHardwareAccelerated()&&(long)content.getWidth()*content.getHeight()<=4_000_000){
        // Prepare the first WebView texture while the old page still covers it.
        // Starting the clock before this work makes a cold reveal jump to its end.
        revealLayer=content;previousLayerType=content.getLayerType();
        try{content.setLayerType(View.LAYER_TYPE_HARDWARE,null);content.buildLayer();}
        catch(IllegalStateException|OutOfMemoryError ignored){restoreRevealLayer();}
        FrameCommit.after(content,()->startHomeReveal(request,old,opening,x,y));
      }else startHomeReveal(request,old,opening,x,y);
    }else if(direction.startsWith("tab-")){
      float sign=direction.equals("tab-next")?1:-1;
      content.bringToFront();content.setTranslationX(content.getWidth()*sign);
      old.animate().translationX(-content.getWidth()*sign).alpha(0).setDuration(210).setInterpolator(new LinearInterpolator()).start();
      content.animate().translationX(0).setDuration(210).setInterpolator(new LinearInterpolator()).withEndAction(()->{if(id==request&&snapshot==old)cancel();}).start();
    }else if(direction.equals("folder")){
      old.animate().alpha(0).setDuration(180).setInterpolator(new LinearInterpolator()).withEndAction(()->{if(id==request&&snapshot==old)cancel();}).start();
    }else if(direction.startsWith("detail")){
      content.setPivotX(content.getWidth()/2f);content.setPivotY(content.getHeight()/2f);content.setScaleX(.978f);content.setScaleY(.978f);
      content.animate().scaleX(1).scaleY(1).setDuration(180).setInterpolator(new LinearInterpolator()).start();
      old.animate().alpha(0).setDuration(180).setInterpolator(new LinearInterpolator()).withEndAction(()->{if(id==request&&snapshot==old)cancel();}).start();
    }else if(direction.equals("back")){
      old.animate().translationX(content.getWidth()).setDuration(duration).setInterpolator(new LinearInterpolator()).withEndAction(()->{if(id==request&&snapshot==old)cancel();}).start();
    }else{
      content.bringToFront();content.setTranslationX(direction.equals("replace")?content.getWidth()*.08f:content.getWidth());
      content.animate().translationX(0).setDuration(duration).setInterpolator(new LinearInterpolator()).withEndAction(()->{if(id==request&&snapshot==old)cancel();}).start();
    }
  }
  private void startHomeReveal(long request,ImageView old,boolean opening,float x,float y){
    if(suspended||request!=id||snapshot!=old)return;
    View target=opening?content:old;
    if(opening)content.bringToFront();else old.bringToFront();
    float radius=(float)Math.hypot(Math.max(x,content.getWidth()-x),Math.max(y,content.getHeight()-y))+2;
    reveal=ViewAnimationUtils.createCircularReveal(target,Math.round(x),Math.round(y),opening?0:radius,opening?radius:0);
    reveal.setDuration(280);reveal.setInterpolator(new android.view.animation.PathInterpolator(.2f,.55f,.4f,1));
    reveal.addListener(new android.animation.AnimatorListenerAdapter(){@Override public void onAnimationEnd(android.animation.Animator animator){if(id==request&&snapshot==old){reveal=null;cancel();}}});reveal.start();
  }
  private void restoreRevealLayer(){
    if(revealLayer!=null){revealLayer.setLayerType(previousLayerType,null);revealLayer=null;}
  }
  void afterFinished(long request,Runnable ready){
    final long deadline=android.os.SystemClock.uptimeMillis()+2000;
    new Runnable(){public void run(){
      if(suspended||request!=id||(snapshot==null&&!readerCapturing)||android.os.SystemClock.uptimeMillis()>=deadline){ready.run();return;}
      content.postDelayed(this,16);
    }}.run();
  }
  void cancel(){
    generation++;
    id=-1;
    if(reveal!=null){android.animation.Animator running=reveal;reveal=null;running.removeAllListeners();running.cancel();}
    restoreRevealLayer();
    content.animate().cancel();content.setTranslationX(0);content.setAlpha(1);content.setScaleX(1);content.setScaleY(1);
    if(snapshot!=null){snapshot.animate().cancel();root.removeView(snapshot);snapshot.setImageDrawable(null);snapshot=null;}
    readerPending=false;readerCapturing=false;readerKey=null;
    revealReaderBars();readerRevealed=false;
    java.util.ArrayList<Runnable> ready=new java.util.ArrayList<>(readerCaptureReady);readerCaptureReady.clear();for(Runnable callback:ready)callback.run();
    // RenderThread may still hold the old display list; release by reachability.
    bitmap=null;
  }
  void pause(){suspended=true;cancel();}
  void resume(){suspended=false;}
}
