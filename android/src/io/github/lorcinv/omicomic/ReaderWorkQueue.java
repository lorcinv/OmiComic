package io.github.lorcinv.omicomic;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.ArrayList;

/** One ordered data writer, with opening/reading ahead of queued library metadata. */
final class ReaderWorkQueue extends ThreadPoolExecutor {
  interface RankedWork extends Runnable {int priority();void cancelled();}
  private final AtomicLong sequence=new AtomicLong();
  ReaderWorkQueue(){super(1,1,0,TimeUnit.MILLISECONDS,new PriorityBlockingQueue<Runnable>());}
  private static final class Task implements Runnable,Comparable<Task> {
    final Runnable work;int priority;final long sequence;
    Task(Runnable work,int priority,long sequence){this.work=work;this.priority=priority;this.sequence=sequence;}
    @Override public void run(){work.run();}
    @Override public int compareTo(Task other){int order=Integer.compare(priority,other.priority);return order!=0?order:Long.compare(sequence,other.sequence);}
  }
  void execute(int priority,Runnable work){super.execute(new Task(work,priority,sequence.getAndIncrement()));}
  // Only reader jobs opt into live ranking; ordinary data/metadata writers
  // retain their existing FIFO ordering and completion behavior.
  void reprioritize(){
    ArrayList<Runnable> waiting=new ArrayList<>();getQueue().drainTo(waiting);
    for(Runnable queued:waiting){Task task=(Task)queued;
      if(task.work instanceof RankedWork){RankedWork work=(RankedWork)task.work;task.priority=work.priority();if(task.priority==Integer.MAX_VALUE){work.cancelled();continue;}}
      getQueue().add(task);
    }
  }
  @Override public void execute(Runnable work){execute(1,work);}
}
