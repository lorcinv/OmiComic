package io.github.lorcinv.omicomic;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Pure Java checks also run on the build JDK, without an emulator or user data. */
public final class ReaderQueueChecks {
  static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  static void await(CountDownLatch latch)throws Exception{require(latch.await(3,TimeUnit.SECONDS),"Task did not complete");}
  public static void main(String[] args)throws Exception{
    require(ReaderCancelledException.causedBy(new IOException("wrapped",new ReaderCancelledException())),"Navigation cancellation lost its type");
    require(!ReaderCancelledException.causedBy(new IOException("corrupt PNG")),"Real image failure was treated as cancellation");
    ReaderWorkQueue queue=new ReaderWorkQueue();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1),done=new CountDownLatch(2);
    List<String> seen=Collections.synchronizedList(new ArrayList<>());AtomicInteger cancellations=new AtomicInteger();
    queue.execute(0,()->{entered.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}});await(entered);
    class Work implements ReaderWorkQueue.RankedWork {
      final String name;int rank;
      Work(String name,int rank){this.name=name;this.rank=rank;}
      public int priority(){return rank;}public void cancelled(){cancellations.incrementAndGet();}
      public void run(){seen.add(name);done.countDown();}
    }
    Work old=new Work("old-neighbor",2),focus=new Work("latest-page",8),stale=new Work("stale",0);
    queue.execute(old.priority(),old);queue.execute(focus.priority(),focus);queue.execute(stale.priority(),stale);
    focus.rank=0;old.rank=8;stale.rank=Integer.MAX_VALUE;queue.reprioritize();release.countDown();await(done);
    require(seen.equals(Arrays.asList("latest-page","old-neighbor")),"Window did not reprioritize: "+seen);
    require(cancellations.get()==1,"Obsolete job lost its cancellation reply");queue.shutdownNow();

    ReaderDecodeGate gate=new ReaderDecodeGate();ReaderDecodeGate.Permit background=gate.enter(()->true,()->{});
    AtomicBoolean speculative=new AtomicBoolean(true),enteredSecond=new AtomicBoolean();CountDownLatch second=new CountDownLatch(1);
    Thread waiting=new Thread(()->{try(ReaderDecodeGate.Permit p=gate.enter(speculative::get,()->{})){enteredSecond.set(true);second.countDown();}catch(IOException e){throw new RuntimeException(e);}});waiting.start();
    require(!second.await(40,TimeUnit.MILLISECONDS),"Two speculative encoded reads ran together");
    try(ReaderDecodeGate.Permit foreground=gate.enter(()->false,()->{})){
      require(!enteredSecond.get(),"Speculation consumed the reserved foreground lane");
    }
    speculative.set(false);await(second);waiting.join();
    AtomicBoolean cancelled=new AtomicBoolean();CountDownLatch stopped=new CountDownLatch(1);
    Thread abandoned=new Thread(()->{try(ReaderDecodeGate.Permit p=gate.enter(()->true,()->{if(cancelled.get())throw new IOException("cancelled");})){throw new AssertionError("Cancelled decode entered");}catch(IOException expected){stopped.countDown();}});abandoned.start();
    cancelled.set(true);await(stopped);background.close();abandoned.join();
    try(ReaderDecodeGate.Permit p=gate.enter(()->false,()->{})){}
    System.out.println("reader-queue-priority, cancellation, promotion and reserved decode lane passed");
  }
}
