package io.github.lorcinv.omicomic;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** One ordered data writer, with opening/reading ahead of queued library metadata. */
final class ReaderWorkQueue extends ThreadPoolExecutor {
  private final AtomicLong sequence=new AtomicLong();
  ReaderWorkQueue(){super(1,1,0,TimeUnit.MILLISECONDS,new PriorityBlockingQueue<Runnable>());}
  private static final class Task implements Runnable,Comparable<Task> {
    final Runnable work;final int priority;final long sequence;
    Task(Runnable work,int priority,long sequence){this.work=work;this.priority=priority;this.sequence=sequence;}
    @Override public void run(){work.run();}
    @Override public int compareTo(Task other){int order=Integer.compare(priority,other.priority);return order!=0?order:Long.compare(sequence,other.sequence);}
  }
  void execute(int priority,Runnable work){super.execute(new Task(work,priority,sequence.getAndIncrement()));}
  @Override public void execute(Runnable work){execute(1,work);}
}
