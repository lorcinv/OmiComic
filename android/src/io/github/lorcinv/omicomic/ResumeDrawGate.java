package io.github.lorcinv.omicomic;

import android.graphics.Bitmap;
import android.graphics.Rect;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** One temporary composed frame bridges WebView's discarded background tiles. */
final class ResumeDrawGate {
  private static final int MAX_PIXELS = 2_000_000;
  private final Window window;
  private final FrameLayout root;
  private final View content;
  private final WebView web;
  private int generation;
  private boolean paused, waiting;
  private Bitmap bitmap, pending;
  private ImageView snapshot;
  private Runnable timeout;
  private ViewTreeObserver.OnDrawListener firstDraw;

  ResumeDrawGate(Window window, FrameLayout root, View content, WebView web) {
    this.window = window; this.root = root; this.content = content; this.web = web;
  }

  void pause() {
    generation++;
    stopWaiting();
    paused = true;
    // A second pause during restoration keeps the same cover, not a copy of it.
    if (snapshot != null || pending != null || !content.isAttachedToWindow()
        || content.getWidth() == 0 || content.getHeight() == 0) return;
    final int expected = generation;
    try {
      int width = content.getWidth(), height = content.getHeight();
      double scale = Math.min(1, Math.sqrt(MAX_PIXELS / (double) width / height));
      Bitmap capture = Bitmap.createBitmap(Math.max(1, (int) (width * scale)),
          Math.max(1, (int) (height * scale)), Bitmap.Config.ARGB_8888);
      pending = capture;
      int[] origin = new int[2]; content.getLocationInWindow(origin);
      PixelCopy.request(window, new Rect(origin[0], origin[1], origin[0] + width, origin[1] + height),
          capture, result -> {
            pending = null;
            if (expected != generation || !paused || result != PixelCopy.SUCCESS) {
              capture.recycle(); return;
            }
            bitmap = capture;
            snapshot = new ImageView(root.getContext());
            snapshot.setScaleType(ImageView.ScaleType.FIT_XY);
            snapshot.setImageBitmap(bitmap);
            snapshot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            snapshot.setClickable(true);
            root.addView(snapshot, new FrameLayout.LayoutParams(-1, -1));
          }, root.getHandler());
    } catch (IllegalArgumentException | OutOfMemoryError ignored) {
      if (pending != null) { pending.recycle(); pending = null; }
    }
  }

  void begin() {
    // Never block pre-draw: after a long stop WebView must draw to recreate its
    // compositor. Android's task snapshot alone does not cover that interval.
    if (snapshot != null) snapshot.bringToFront();
  }

  void readyWhenWebIsReady() {
    paused = false;
    generation++;
    stopWaiting();
    if (snapshot == null) return;
    waiting = true;
    final int expected = generation;
    timeout = () -> release(expected);
    root.postDelayed(timeout, 1800);
    // First let the visible WebView recreate its draw resources *under* the
    // cover. A visual-state callback before this draw can refer to old tiles.
    firstDraw = new ViewTreeObserver.OnDrawListener() {
      private boolean drawn;
      @Override public void onDraw() {
        if (drawn) return;
        drawn = true;
        root.post(() -> {
          if (expected != generation || !waiting) return;
          removeDrawListener();
          web.postVisualStateCallback(expected, new WebView.VisualStateCallback() {
            @Override public void onComplete(long ignored) {
              if (expected != generation || !waiting) return;
              FrameCommit.after(web, () -> release(expected));
            }
          });
        });
      }
    };
    root.getViewTreeObserver().addOnDrawListener(firstDraw);
    web.invalidate(); root.invalidate();
  }

  private void removeDrawListener() {
    if (firstDraw != null && root.getViewTreeObserver().isAlive())
      root.getViewTreeObserver().removeOnDrawListener(firstDraw);
    firstDraw = null;
  }

  private void stopWaiting() {
    waiting = false;
    if (timeout != null) root.removeCallbacks(timeout);
    timeout = null;
    removeDrawListener();
  }

  private void release(int expected) {
    if (expected != generation || !waiting || paused) return;
    stopWaiting();
    clearSnapshot();
  }

  private void clearSnapshot() {
    if (snapshot != null) {
      root.removeView(snapshot); snapshot.setImageDrawable(null); snapshot = null;
    }
    // RenderThread may still own the previous display list; let it release the
    // bitmap normally. No disk cache and no list of previous screenshots.
    bitmap = null;
  }

  void cancel() { generation++; paused = false; stopWaiting(); clearSnapshot(); }
}
