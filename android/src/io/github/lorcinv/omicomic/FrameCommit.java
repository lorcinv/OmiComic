package io.github.lorcinv.omicomic;

import android.os.Build;
import android.view.View;
import android.view.ViewTreeObserver;

/** Run after a submitted frame, rather than when WebView merely has one ready. */
final class FrameCommit {
  static void after(View view, Runnable action) {
    if (!view.isAttachedToWindow() || view.getWindowVisibility() != View.VISIBLE) {
      view.post(action);
    } else if (Build.VERSION.SDK_INT >= 29 && view.isHardwareAccelerated()) {
      view.getViewTreeObserver().registerFrameCommitCallback(() -> view.post(action));
      view.invalidate();
    } else {
      view.getViewTreeObserver().addOnDrawListener(new ViewTreeObserver.OnDrawListener() {
        private boolean drawn;
        public void onDraw() {
          if (drawn) return;
          drawn = true;
          view.post(() -> {
            if (view.getViewTreeObserver().isAlive()) view.getViewTreeObserver().removeOnDrawListener(this);
            action.run();
          });
        }
      });
      view.invalidate();
    }
  }
}
