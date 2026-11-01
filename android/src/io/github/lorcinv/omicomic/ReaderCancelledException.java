package io.github.lorcinv.omicomic;

import java.io.InterruptedIOException;

/** A navigation cancellation is not a corrupt/missing page. */
final class ReaderCancelledException extends InterruptedIOException {
  ReaderCancelledException(){super("阅读请求已取消。");}
  ReaderCancelledException(Throwable cause){this();initCause(cause);}
  static boolean causedBy(Throwable error){
    for(int depth=0;error!=null&&depth<8;depth++,error=error.getCause())if(error instanceof ReaderCancelledException)return true;
    return false;
  }
}
