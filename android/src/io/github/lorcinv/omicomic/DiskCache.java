package io.github.lorcinv.omicomic;

import android.util.AtomicFile;
import java.io.*;
import java.util.*;

/** Private, bounded derived data. Cache failure must never prevent reading a comic. */
final class DiskCache {
  private final File directory;
  private long limit;
  private final int maxEntry;
  private long retainedBytes=-1;
  private long scans,hits,writes;
  private volatile long epoch;
  long epoch(){return epoch;}
  DiskCache(File directory,long limit){this(directory,limit,4*1024*1024);}
  DiskCache(File directory,long limit,int maxEntry){this.directory=directory;this.limit=limit;this.maxEntry=maxEntry;directory.mkdirs();}
  synchronized void setLimit(long value){if(limit==value)return;limit=value;if(retainedBytes>limit)trim(true);}
  synchronized long size(){if(retainedBytes<0)trim(false);return Math.max(0,retainedBytes);}
  synchronized long limit(){return limit;}
  synchronized boolean contains(String key){try{File file=new File(directory,LocalLibrary.hash(key));return limit>0&&file.isFile()&&file.length()<=maxEntry;}catch(Exception ignored){return false;}}
  synchronized byte[] get(String key) {
    try {
      File file=new File(directory,LocalLibrary.hash(key));
      if(limit==0||!file.isFile()||file.length()>maxEntry)return null;
      byte[] result=new AtomicFile(file).readFully();hits++;
      long now=System.currentTimeMillis();if(now-file.lastModified()>60000)file.setLastModified(now);
      return result;
    }catch(Exception ignored){return null;}
  }
  synchronized void put(String key,byte[] data) {
    if(data.length>maxEntry||data.length>limit||limit==0)return;
    try {
      File file=new File(directory,LocalLibrary.hash(key));long previousLength=file.length();
      // Derived data needs atomic replacement, not a blocking fsync per page.
      File partial=new File(directory,file.getName()+".part");
      try(FileOutputStream out=new FileOutputStream(partial)){out.write(data);}
      if(!partial.renameTo(file)){partial.delete();return;}writes++;
      if(retainedBytes>=0){retainedBytes+=file.length()-previousLength;if(retainedBytes<=limit)return;}
      trim(false);
    }catch(Exception ignored){}
  }
  private void trim(boolean force) {
    try {
      File[] files=directory.listFiles();if(files==null)return;scans++;
      Arrays.sort(files,Comparator.comparingLong(File::lastModified));
      long size=0;for(File item:files){if(item.getName().endsWith(".part")){item.delete();continue;}size+=item.length();}
      // Leave headroom so a full cache does not rescan/sort for every new page.
      long target=size>limit||force?limit*85/100:limit;
      for(File item:files){if(size<=target)break;long length=item.length();if(item.delete())size-=length;}
      retainedBytes=size;
    }catch(Exception ignored){}
  }
  synchronized void clear() {
    epoch++;
    File[] files=directory.listFiles();
    if(files!=null)for(File file:files)if(file.isFile())file.delete();
    retainedBytes=-1;
  }
}
