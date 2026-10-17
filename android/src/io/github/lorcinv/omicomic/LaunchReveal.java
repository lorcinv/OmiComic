package io.github.lorcinv.omicomic;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Build;
import android.os.SystemClock;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewAnimationUtils;
import android.view.ViewTreeObserver;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** One continuous handoff from Android's original splash to the real page. */
final class LaunchReveal extends FrameLayout {
  private static final long DURATION = 420;
  private final PathInterpolator easing = new PathInterpolator(.22f, 0f, .2f, 1f);
  private boolean ready, painted, finished, running, capturing, animate = true;
  private final ViewTreeObserver.OnPreDrawListener firstDraw = () -> ready || finished;
  private View splashView;
  private Runnable removeSplash;
  private final Activity activity;
  private Animator reveal;
  private ImageView backdrop;
  private long started;

  LaunchReveal(Activity activity) {
    super(activity);
    this.activity = activity;
    setClickable(true);
    // An empty first frame dismisses Android's starting window too early.
    // The existing system splash remains visible while the page initializes.
    getViewTreeObserver().addOnPreDrawListener(firstDraw);
    if (Build.VERSION.SDK_INT >= 31) {
      activity.getSplashScreen().setOnExitAnimationListener(splash -> {
        if (finished) { splash.remove(); return; }
        splashView = splash;
        removeSplash = splash::remove;
        start();
      });
    }
  }

  void ready(boolean animated) {
    if (ready || finished) return;
    ready = true;
    animate = animated;
    getViewTreeObserver().removeOnPreDrawListener(firstDraw);
    // Paint the complete WebView under the still-opaque system splash first.
    // Its exit callback can arrive after this commit, so both must be ready.
    FrameCommit.after(this, () -> {
      painted = true;
      start();
      // Start the fallback clock after drawing, not while a cold WebView is
      // still preparing its GPU resources. Otherwise it skips the handoff.
      postDelayed(() -> { if (!running && !capturing && splashView == null) finish(); }, 700);
    });
    // Some entries (instrumentation or a launch without a starting window)
    // have no splash callback. The prepared page is already drawn in full;
    // never hide it again merely to replay an entrance effect.
    invalidate();
  }

  private void start() {
    if (finished || running || capturing || !ready || !painted || splashView == null) return;
    if (!animate || !ValueAnimator.areAnimatorsEnabled()) { finish(); return; }
    capturing = true;
    // Android transfers its splash into the app window asynchronously. Copy
    // that exact presented frame, never reconstruct a second icon. This one
    // temporary, <= 8 MiB backdrop is released at the end of cold entry.
    FrameCommit.after(splashView, this::captureSplash);
  }

  private void captureSplash() {
    if (finished) return;
    int width=getWidth(),height=getHeight();
    if(width==0||height==0){finish();return;}
    float scale=Math.min(1f,(float)Math.sqrt(2_000_000d/((double)width*height)));
    final Bitmap pixels;
    try{pixels=Bitmap.createBitmap(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),Bitmap.Config.ARGB_8888);}
    catch(OutOfMemoryError error){finish();return;}
    int[] origin=new int[2];getLocationInWindow(origin);
    try{
      PixelCopy.request(activity.getWindow(),new Rect(origin[0],origin[1],origin[0]+width,origin[1]+height),pixels,result->{
        if(finished||result!=PixelCopy.SUCCESS){pixels.recycle();if(!finished)finish();return;}
        FrameLayout root=(FrameLayout)getParent();
        backdrop=new ImageView(getContext());backdrop.setScaleType(ImageView.ScaleType.FIT_XY);backdrop.setImageBitmap(pixels);
        root.addView(backdrop,0,new FrameLayout.LayoutParams(-1,-1));
        // Prime the identical backdrop underneath the original splash before
        // removing it, so a delayed WebView frame cannot expose a blank color.
        setClipBounds(new Rect(0,0,0,0));
        FrameCommit.after(backdrop,this::animateReveal);
      },getHandler());
    }catch(IllegalArgumentException error){pixels.recycle();finish();}
  }

  private void animateReveal() {
    if(finished)return;
    running = true;
    started = SystemClock.uptimeMillis();
    float radius = (float)Math.hypot(getWidth()/2f, getHeight()/2f) + 2f;
    // RenderThread drives the reveal; repeatedly clipping WebView in Java
    // would force fresh full-window display lists and amplify a slow frame.
    reveal = ViewAnimationUtils.createCircularReveal(this, getWidth()/2, getHeight()/2, 0f, radius);
    reveal.setDuration(DURATION);
    reveal.setInterpolator(easing);
    reveal.addListener(new AnimatorListenerAdapter() {
      @Override public void onAnimationEnd(Animator animation) { reveal = null; finish(); }
    });
    reveal.start();
    setClipBounds(null);
    if (removeSplash != null) { removeSplash.run(); removeSplash = null; }
    splashView = null;
  }

  void finish() {
    if (finished) return;
    finished = true;
    getViewTreeObserver().removeOnPreDrawListener(firstDraw);
    if (reveal != null) { reveal.removeAllListeners(); reveal.cancel(); reveal = null; }
    if (removeSplash != null) { removeSplash.run(); removeSplash = null; }
    splashView = null;
    setClipBounds(null);
    if(backdrop!=null){((FrameLayout)backdrop.getParent()).removeView(backdrop);backdrop.setImageDrawable(null);backdrop=null;}
    setClickable(false);
    invalidate();
  }

  boolean isFinished() { return finished; }
  float progress() { return finished ? -1f : running ? easing.getInterpolation(Math.min(1f, (SystemClock.uptimeMillis()-started)/(float)DURATION)) : 0f; }

  @Override public boolean onInterceptTouchEvent(android.view.MotionEvent event) {
    return !finished || super.onInterceptTouchEvent(event);
  }
}
