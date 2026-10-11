package io.github.lorcinv.omicomic;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import java.io.*;

/** SAF descriptors are read directly. Reopening /proc/self/fd can be denied by scoped storage. */
final class SeekableSource implements Closeable {
  private final ParcelFileDescriptor descriptor;
  SeekableSource(File file)throws IOException { this(ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY)); }
  private SeekableSource(ParcelFileDescriptor descriptor){this.descriptor=descriptor;}
  static SeekableSource open(ContentResolver resolver,Uri uri)throws IOException {
    ParcelFileDescriptor descriptor=resolver.openFileDescriptor(uri,"r");
    if(descriptor==null)throw new FileNotFoundException("文件提供程序未返回文件。");
    try {Os.lseek(descriptor.getFileDescriptor(),0,OsConstants.SEEK_SET);return new SeekableSource(descriptor);}
    catch(android.system.ErrnoException streaming){descriptor.close();return null;}
  }
  ParcelFileDescriptor duplicate()throws IOException{return ParcelFileDescriptor.dup(descriptor.getFileDescriptor());}
  long size(){return descriptor.getStatSize();}
  byte[] range(int start,int end)throws IOException {
    if(start<0||end<start||end>size()||end-start>1024*1024)throw new IOException("文档读取范围无效。");
    byte[] bytes=new byte[end-start];int done=0;
    try {while(done<bytes.length){int n=Os.pread(descriptor.getFileDescriptor(),bytes,done,bytes.length-done,(long)start+done);if(n<=0)throw new EOFException();done+=n;}}
    catch(android.system.ErrnoException error){throw new IOException(error);}
    return bytes;
  }
  @Override public void close()throws IOException{descriptor.close();}
}
