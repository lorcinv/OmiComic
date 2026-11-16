package io.github.lorcinv.omicomic;

import java.io.*;

/** Container metadata only: BitmapFactory and canvas would discard later frames. */
final class ImageAnimation {
  static final class Info {
    final int width,height;final String mime;final long bytes;
    Info(int width,int height,String mime,long bytes)throws IOException{
      if(width<1||height<1||(long)width*height>100000000L)throw new IOException("图片尺寸超出上限。");
      this.width=width;this.height=height;this.mime=mime;this.bytes=bytes;
    }
  }
  private static long u32(byte[] data,int offset){return ((long)(data[offset]&255)<<24)|((long)(data[offset+1]&255)<<16)|((data[offset+2]&255)<<8)|(data[offset+3]&255);}
  private static int le(byte[] data,int offset,int count){int value=0;for(int i=0;i<count;i++)value|=(data[offset+i]&255)<<(i*8);return value;}
  private static byte[] read(InputStream input,int size)throws IOException{
    byte[] result=new byte[size];int done=0;while(done<size){int n=input.read(result,done,size-done);if(n<0)throw new EOFException("图片头不完整。");done+=n;}return result;
  }
  /** Only headers and bounded skips, including PNG metadata before acTL. */
  static Info inspect(ImageInput input)throws IOException{
    byte[] head=read(input,12);
    if(text(head,0,"GIF87a")||text(head,0,"GIF89a"))return new Info(le(head,6,2),le(head,8,2),"image/gif",input.length);
    if(text(head,0,"RIFF")&&text(head,8,"WEBP")){
      byte[] chunk=read(input,18);
      return text(chunk,0,"VP8X")&&(chunk[8]&2)!=0?new Info(1+le(chunk,12,3),1+le(chunk,15,3),"image/webp",input.length):null;
    }
    if(!text(head,0,"\u0089PNG\r\n\u001a\n"))return null;
    byte[] ihdr=read(input,21);if(u32(head,8)!=13||!text(ihdr,0,"IHDR"))return null;
    long width=u32(ihdr,4),height=u32(ihdr,8);if(width>Integer.MAX_VALUE||height>Integer.MAX_VALUE)throw new IOException("图片尺寸超出上限。");
    for(int chunks=0;chunks<4096;chunks++){
      byte[] header=read(input,8);long length=u32(header,0);
      if(text(header,4,"acTL"))return length==8?new Info((int)width,(int)height,"image/png",input.length):null;
      if(text(header,4,"IDAT")||text(header,4,"IEND"))return null;
      if(length>ImageInput.MAX_ANIMATION||input.skip(length+4)!=length+4)throw new EOFException("PNG 元数据不完整。");
    }
    // Preserve original rendering for pathological metadata, as on desktop.
    return new Info((int)width,(int)height,"image/png",input.length);
  }
  private static boolean text(byte[] data,int offset,String value){
    if(offset<0||offset+value.length()>data.length)return false;
    for(int i=0;i<value.length();i++)if((data[offset+i]&255)!=value.charAt(i))return false;
    return true;
  }
  static boolean animated(byte[] data){
    if(text(data,0,"GIF87a")||text(data,0,"GIF89a"))return true;
    if(data.length>=30&&text(data,0,"RIFF")&&text(data,8,"WEBP"))return text(data,12,"VP8X")&&(data[20]&2)!=0;
    if(!text(data,0,"\u0089PNG\r\n\u001a\n"))return false;
    for(int offset=8;offset<=data.length-12;){
      long length=((long)(data[offset]&255)<<24)|((long)(data[offset+1]&255)<<16)|((data[offset+2]&255)<<8)|(data[offset+3]&255);
      if(length>data.length-offset-12)return false;
      if(text(data,offset+4,"acTL"))return length==8;
      if(text(data,offset+4,"IDAT")||text(data,offset+4,"IEND"))return false;
      offset+=(int)length+12;
    }
    return false;
  }
}
