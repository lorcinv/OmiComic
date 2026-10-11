package io.github.lorcinv.omicomic;

import android.util.AtomicFile;
import java.io.*;
import java.util.*;

/** Private, bounded derived data. Cache failure must never prevent reading a comic. */
final class DiskCache {
  private final File directory;
  private final long limit;
  DiskCache(File directory,long limit){this.directory=directory;this.limit=limit;directory.mkdirs();}
  synchronized byte[] get(String key) {
    try {
      File file=new File(directory,LocalLibrary.hash(key));
      if(!file.isFile()||file.length()>4*1024*1024)return null;
      byte[] result=new AtomicFile(file).readFully();file.setLastModified(System.currentTimeMillis());return result;
    }catch(Exception ignored){return null;}
  }
  synchronized void put(String key,byte[] data) {
    if(data.length>4*1024*1024)return;
    try {
      File file=new File(directory,LocalLibrary.hash(key));AtomicFile atomic=new AtomicFile(file);FileOutputStream out=null;
      try{out=atomic.startWrite();out.write(data);atomic.finishWrite(out);}catch(IOException error){atomic.failWrite(out);return;}
      File[] files=directory.listFiles();if(files==null)return;
      Arrays.sort(files,Comparator.comparingLong(File::lastModified));
      long size=0;for(File item:files)size+=item.length();
      for(File item:files){if(size<=limit)break;if(item.equals(file))continue;long length=item.length();if(item.delete())size-=length;}
    }catch(Exception ignored){}
  }
}
