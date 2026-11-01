package io.github.lorcinv.omicomic;

import java.io.IOException;
import java.util.function.BooleanSupplier;

/** Bound encoded reads and native body decodes together. One speculative
 * image leaves a lane for the latest visible page, including a rapid seek. */
final class ReaderDecodeGate {
  interface Check {void run()throws IOException;}
  private int active,background;
  final class Permit implements AutoCloseable {
    private final boolean speculative;private boolean closed;
    Permit(boolean speculative){this.speculative=speculative;}
    public void close(){synchronized(ReaderDecodeGate.this){if(closed)return;closed=true;active--;if(speculative)background--;ReaderDecodeGate.this.notifyAll();}}
  }
  synchronized Permit enter(BooleanSupplier speculative,Check check)throws IOException{
    for(;;){
      check.run();boolean ahead=speculative.getAsBoolean();
      if(active<2&&(!ahead||background<1)){active++;if(ahead)background++;return new Permit(ahead);}
      try{wait(10);}catch(InterruptedException cancelled){Thread.currentThread().interrupt();throw new ReaderCancelledException(cancelled);}
    }
  }
}
