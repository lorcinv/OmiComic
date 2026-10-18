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
  SceneTransition(Window window,FrameLayout root,FrameLayout content){this.window=window;this.root=root;this.content=content;}
  void begin(long request,Runnable ready){
    boolean interrupted=snapshot!=null;
    cancel();id=request;
    if(suspended||content.getWidth()==0||content.getHeight()==0){ready.run();return;}
    final int expected=generation;
    // Rapid back/forward must capture the settled page, not the previous
    // transition's translated or half-faded buffer.
    if(interrupted)FrameCommit.after(content,()->capture(expected,ready));
    else capture(expected,ready);
  }
  private void capture(int expected,Runnable ready){
    if(expected!=generation||suspended){ready.run();return;}
    try{
      Bitmap capture=Bitmap.createBitmap(content.getWidth(),content.getHeight(),Bitmap.Config.ARGB_8888);
      int[] origin=new int[2];content.getLocationInWindow(origin);
      Rect area=new Rect(origin[0],origin[1],origin[0]+content.getWidth(),origin[1]+content.getHeight());
      // Copy the already composed frame asynchronously; WebView.draw(Canvas)
      // forces a software repaint of the entire scene on the UI thread.
      PixelCopy.request(window,area,capture,result->{
        if(expected==generation&&result==PixelCopy.SUCCESS){
          bitmap=capture;snapshot=new ImageView(root.getContext());snapshot.setImageBitmap(bitmap);snapshot.setScaleType(ImageView.ScaleType.FIT_XY);root.addView(snapshot,new FrameLayout.LayoutParams(-1,-1));
          // Do not clear the native reader until its replacement snapshot has
          // actually been submitted to the window compositor.
          FrameCommit.after(snapshot,ready);
        }else{capture.recycle();ready.run();}
      },content.getHandler());
    }catch(IllegalArgumentException|OutOfMemoryError ignored){ready.run();}
  }
  void commit(long request,String direction){
    commit(request,direction,36,40);
  }
  void commit(long request,String direction,float x,float y){
    if(suspended||request!=id)return;
    if(snapshot==null)return;
    ImageView old=snapshot;
    long duration=direction.equals("replace")?140:240;
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
    }else if(direction.equals("folder")||direction.startsWith("detail")){
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
  void cancel(){
    generation++;
    id=-1;
    if(reveal!=null){android.animation.Animator running=reveal;reveal=null;running.removeAllListeners();running.cancel();}
    restoreRevealLayer();
    content.animate().cancel();content.setTranslationX(0);content.setAlpha(1);content.setScaleX(1);content.setScaleY(1);
    if(snapshot!=null){snapshot.animate().cancel();root.removeView(snapshot);snapshot.setImageDrawable(null);snapshot=null;}
    // RenderThread may still hold the old display list; release by reachability.
    bitmap=null;
  }
  void pause(){suspended=true;cancel();}
  void resume(){suspended=false;}
}
