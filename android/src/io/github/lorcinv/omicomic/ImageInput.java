package io.github.lorcinv.omicomic;

import java.io.*;
import java.util.*;
import java.util.zip.CRC32;

/** Bounded encoded-image stream; never allocate an array the size of an animation. */
final class ImageInput extends FilterInputStream {
  static final long MAX_ANIMATION=256L*1024*1024;
  final long length;
  private final long limit;
  private final Long expectedCrc;
  private final CRC32 crc=new CRC32();
  private final List<Closeable> owners=new ArrayList<>();
  private long count;
  private boolean closed,ended;
  ImageInput(InputStream input,long length,long limit,Long expectedCrc)throws IOException{
    super(input);this.length=length;this.limit=limit;this.expectedCrc=expectedCrc;
    if(input==null)throw new FileNotFoundException();
    if(length>limit){input.close();throw new IOException("动图超过 256 MiB 读取上限，请缩小后打开。");}
  }
  ImageInput own(Closeable owner){owners.add(owner);return this;}
  @Override public int read()throws IOException{byte[] one=new byte[1];return read(one,0,1)<0?-1:one[0]&255;}
  @Override public int read(byte[] bytes,int start,int size)throws IOException{
    if(size==0)return 0;if(closed)throw new IOException("图片流已关闭。");if(ended)return -1;
    try{
      int n=in.read(bytes,start,(int)Math.min(size,limit-count+1));
      if(n<0){ended=true;if((length>=0&&count!=length)||(expectedCrc!=null&&crc.getValue()!=expectedCrc))throw new IOException("图片数据不完整或校验失败。");return -1;}
      count+=n;if(count>limit)throw new IOException("动图超过 256 MiB 读取上限，请缩小后打开。");
      if(length>=0&&count>length)throw new IOException("图片展开长度不符。");
      if(expectedCrc!=null){crc.update(bytes,start,n);if(count==length&&crc.getValue()!=expectedCrc)throw new IOException("图片校验失败。");}return n;
    }catch(IOException|RuntimeException error){try{close();}catch(IOException cleanup){error.addSuppressed(cleanup);}throw error;}
  }
  @Override public long skip(long size)throws IOException{
    byte[] buffer=new byte[8192];long done=0;while(done<size){int n=read(buffer,0,(int)Math.min(buffer.length,size-done));if(n<0)break;done+=n;}return done;
  }
  @Override public void close()throws IOException{
    if(closed)return;closed=true;IOException failure=null;
    try{super.close();}catch(IOException error){failure=error;}
    for(Closeable owner:owners)try{owner.close();}catch(IOException error){if(failure==null)failure=error;else failure.addSuppressed(error);}
    if(failure!=null)throw failure;
  }
}
