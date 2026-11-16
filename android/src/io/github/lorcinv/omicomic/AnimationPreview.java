package io.github.lorcinv.omicomic;

import java.io.*;

/** A bounded first-frame container for BitmapFactory. Some codecs scan the entire
 * animation even for a thumbnail; that must not hold the library read lock. */
final class AnimationPreview {
  private static final int LIMIT=64*1024*1024;
  private static final class Output extends ByteArrayOutputStream {
    void put(byte[] bytes)throws IOException{if(bytes.length>LIMIT-count)throw new IOException("动图首帧超过缩略图读取上限。");write(bytes);}
    void one(int value)throws IOException{if(count==LIMIT)throw new IOException("动图首帧超过缩略图读取上限。");write(value);}
  }
  private static byte[] read(InputStream input,int size)throws IOException{
    if(size<0||size>LIMIT)throw new IOException("动图首帧超过缩略图读取上限。");
    byte[] bytes=new byte[size];int done=0;while(done<size){int n=input.read(bytes,done,size-done);if(n<0)throw new EOFException("动图首帧不完整。");done+=n;}return bytes;
  }
  private static int one(InputStream input)throws IOException{int value=input.read();if(value<0)throw new EOFException("动图首帧不完整。");return value;}
  private static long number(byte[] bytes,int at,boolean little){long value=0;for(int n=0;n<4;n++)value|=(long)(bytes[at+n]&255)<<(8*(little?n:3-n));return value;}
  private static String type(byte[] bytes,int at){return new String(bytes,at,4,java.nio.charset.StandardCharsets.US_ASCII);}
  private static void skip(ImageInput input,long size)throws IOException{if(size>ImageInput.MAX_ANIMATION||input.skip(size)!=size)throw new EOFException("动图数据不完整。");}
  private static void blocks(ImageInput input,Output output)throws IOException{
    for(int size;(size=one(input))!=0;){if(output==null)skip(input,size);else{output.one(size);output.put(read(input,size));}}
    if(output!=null)output.one(0);
  }
  static byte[] firstFrame(ImageInput input,String mime)throws IOException{
    Output output=new Output();
    if(mime.equals("image/gif")){
      byte[] header=read(input,13);output.put(header);if((header[10]&128)!=0)output.put(read(input,3*(1<<((header[10]&7)+1))));
      for(int count=0;count<4096;count++){
        int marker=one(input);
        if(marker==0x21){int label=one(input);if(label==0xf9){output.one(marker);output.one(label);blocks(input,output);}else blocks(input,null);}
        else if(marker==0x2c){
          output.one(marker);byte[] descriptor=read(input,9);output.put(descriptor);
          if((descriptor[8]&128)!=0)output.put(read(input,3*(1<<((descriptor[8]&7)+1))));
          output.one(one(input));blocks(input,output);output.one(0x3b);return output.toByteArray();
        }else throw new IOException("GIF 首帧无效。");
      }
    }else if(mime.equals("image/png")){
      output.put(read(input,8));boolean pixels=false;
      for(int count=0;count<4096;count++){
        byte[] header=read(input,8);long size=number(header,0,false);String type=type(header,4);
        if(pixels&&!type.equals("IDAT")){
          output.put(new byte[]{0,0,0,0,73,69,78,68,(byte)174,66,96,(byte)130});return output.toByteArray();
        }
        if(type.equals("IDAT"))pixels=true;
        if(type.equals("IHDR")||type.equals("PLTE")||type.equals("tRNS")||type.equals("IDAT")||type.equals("sRGB")||type.equals("gAMA")||type.equals("cHRM")||(type.equals("iCCP")&&size<1024*1024)){
          if(size>LIMIT-12-output.size())throw new IOException("动图首帧超过缩略图读取上限。");output.put(header);output.put(read(input,(int)size+4));
        }else skip(input,size+4);
      }
    }else if(mime.equals("image/webp")){
      output.put(read(input,12));
      for(int count=0;count<4096;count++){
        byte[] header=read(input,8);long size=number(header,4,true);String type=type(header,0);long padded=size+(size&1);
        if(type.equals("VP8X")||type.equals("ANIM")||type.equals("ANMF")||(type.equals("ICCP")&&size<1024*1024)){
          if(padded>LIMIT-8-output.size())throw new IOException("动图首帧超过缩略图读取上限。");output.put(header);output.put(read(input,(int)padded));
          if(type.equals("ANMF")){byte[] bytes=output.toByteArray();int length=bytes.length-8;for(int n=0;n<4;n++)bytes[4+n]=(byte)(length>>(8*n));return bytes;}
        }else skip(input,padded);
      }
    }
    throw new IOException("动图首帧无法读取。");
  }
}
