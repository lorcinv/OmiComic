package io.github.lorcinv.omicomic;

import android.graphics.*;
import java.io.*;
import ar.com.hjg.pngj.*;
import ar.com.hjg.pngj.chunks.*;

/** Reduce line art before sampling it. A filtered Canvas cannot remove aliasing
 * already introduced by a PNG decoder which discards intermediate source rows. */
final class ReaderBitmapDecoder {
  interface Check {void run() throws IOException;}
  // One native full-resolution strip at a time, across body and zoom workers.
  // Native filtering is faster for colour-profile/Adam7 PNGs, but needs a
  // bounded source strip in addition to the small output bitmap.
  private static final java.util.concurrent.locks.ReentrantLock pngNative=new java.util.concurrent.locks.ReentrantLock();
  private static final long STRIP_BYTES=Math.max(8L*1024*1024,Math.min(32L*1024*1024,Runtime.getRuntime().maxMemory()/6));
  static Bitmap region(BitmapRegionDecoder decoder,Rect rect,int sample,boolean png)throws IOException{
    return region(decoder,rect,sample,png,()->{});
  }
  static Bitmap region(BitmapRegionDecoder decoder,Rect rect,int sample,boolean png,Check check)throws IOException{
    if(!png)return reducedRegion(decoder,rect,sample,false,check);
    try{while(!pngNative.tryLock(50,java.util.concurrent.TimeUnit.MILLISECONDS))check.run();}
    catch(InterruptedException cancelled){Thread.currentThread().interrupt();throw new IOException("PNG decoding interrupted",cancelled);}
    Bitmap result=null;
    try{
      check.run();int rows=Math.max(sample,(int)(STRIP_BYTES/Math.max(1,(long)rect.width()*4))/sample*sample);
      if(rect.height()<=rows)return reducedRegion(decoder,rect,sample,true,check);
      result=Bitmap.createBitmap((rect.width()+sample-1)/sample,(rect.height()+sample-1)/sample,Bitmap.Config.ARGB_8888);
      Canvas canvas=new Canvas(result);
      for(int y=rect.top;y<rect.bottom;y+=rows){
        int end=Math.min(rect.bottom,y+rows),halo=sample*4;
        Rect coverage=new Rect(rect.left,Math.max(rect.top,y-halo),rect.right,Math.min(rect.bottom,end+halo));
        check.run();Bitmap strip=reducedRegion(decoder,coverage,sample,true,check);
        if(strip==null)throw new IOException("PNG region unavailable");
        int first=(y-coverage.top)/sample,count=(end-y+sample-1)/sample;
        canvas.drawBitmap(strip,new Rect(0,first,strip.getWidth(),Math.min(strip.getHeight(),first+count)),new Rect(0,(y-rect.top)/sample,result.getWidth(),(y-rect.top)/sample+count),null);strip.recycle();
      }
      return result;
    }catch(IOException|RuntimeException|OutOfMemoryError error){if(result!=null)result.recycle();throw error;}
    finally{pngNative.unlock();}
  }
  private static Bitmap reducedRegion(BitmapRegionDecoder decoder,Rect rect,int sample,boolean png,Check check)throws IOException {
    BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=png?1:sample;options.inPreferredConfig=Bitmap.Config.ARGB_8888;
    Bitmap bitmap=decoder.decodeRegion(rect,options);
    if(png&&bitmap!=null&&sample>1){
      try{Bitmap next=DisplayResampler.reduce(bitmap,Math.max(1,(bitmap.getWidth()+sample-1)/sample),Math.max(1,(bitmap.getHeight()+sample-1)/sample),check);if(next!=null&&next!=bitmap){bitmap.recycle();bitmap=next;}}
      catch(IOException|RuntimeException|OutOfMemoryError error){bitmap.recycle();throw error;}
    }
    return bitmap;
  }
  static Bitmap decode(byte[] data,int sample,Check check)throws IOException {
    check.run();
    Bitmap bitmap=null;
    if(sample>1&&data.length>33&&data[0]==(byte)137&&data[1]==80&&data[2]==78&&data[3]==71){
      try{bitmap=png(data,sample,check);}
      catch(IOException unsupported){check.run(); /* A current request may try Android's colour-aware decoder. */}
      if(bitmap==null)bitmap=pngRegions(data,sample,check);
    }
    if(bitmap==null){
      BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=sample;options.inPreferredConfig=Bitmap.Config.ARGB_8888;
      bitmap=BitmapFactory.decodeByteArray(data,0,data.length,options);
    }
    if(bitmap==null)throw new IOException("图片无法解码。");
    check.run();bitmap.setHasMipMap(true);return bitmap;
  }
  private static Bitmap pngRegions(byte[] data,int sample,Check check)throws IOException {
    BitmapRegionDecoder decoder=null;Bitmap result=null;
    try{
      decoder=BitmapRegionDecoder.newInstance(data,0,data.length,false);
      int width=decoder.getWidth(),height=decoder.getHeight();
      result=Bitmap.createBitmap((width+sample-1)/sample,(height+sample-1)/sample,Bitmap.Config.ARGB_8888);
      Canvas canvas=new Canvas(result);
      int rows=Math.max(sample,(int)(STRIP_BYTES/Math.max(1,(long)width*4))/sample*sample);
      for(int y=0;y<height;y+=rows){
        check.run();Bitmap strip=region(decoder,new Rect(0,y,width,Math.min(height,y+rows)),sample,true,check);
        if(strip==null)throw new IOException("PNG 区域无法读取。");
        canvas.drawBitmap(strip,0,y/sample,null);strip.recycle();
      }
      return result;
    }catch(IOException|RuntimeException error){if(result!=null)result.recycle();throw new IOException("PNG 图片无法缩放。",error);}
    catch(OutOfMemoryError error){if(result!=null)result.recycle();throw error;}
    finally{if(decoder!=null)decoder.recycle();}
  }
  private static Bitmap png(byte[] data,int sample,Check check)throws IOException {
    PngReaderInt reader=null;Bitmap result=null;
    try {
      reader=new PngReaderInt(new ByteArrayInputStream(data));
      ImageInfo info=reader.imgInfo;
      // Adam7 requires a full-frame buffer in PNGJ; keep that and colour-profile
      // conversion with Android rather than allocating a full giant image here.
      if(reader.isInterlaced())return null;
      reader.setMaxBytesMetadata(1024*1024);reader.setMaxTotalBytesRead(data.length+1L);
      if(reader.getChunksList().getById1("iCCP")!=null)return null;
      PngChunkPLTE palette=reader.getMetadata().getPLTE();PngChunkTRNS transparency=reader.getMetadata().getTRNS();
      int[] paletteAlpha=transparency!=null&&info.indexed?transparency.getPalletteAlpha():new int[0];
      int grayKey=transparency!=null&&info.greyscale?transparency.getGray():-1;
      int[] rgbKey=transparency!=null&&!info.indexed&&!info.greyscale?transparency.getRGB():null;
      int w=(info.cols+sample-1)/sample,h=(info.rows+sample-1)/sample,maximum=(1<<info.bitDepth)-1;
      if((long)w*h>4000000L)return null;
      DisplayResampler.Stream sampler=new DisplayResampler.Stream(info.cols,info.rows,w,h,info.alpha||transparency!=null);
      result=sampler.bitmap;int[] pixels=new int[info.cols];
      for(int y=0;y<info.rows;y++){
        if((y&31)==0)check.run();
        int[] row=reader.readRowInt().getScanline();
        boolean monochrome=true,opaque=true;
        if(info.bitDepth==8&&!info.indexed&&!info.greyscale&&transparency==null){
          for(int x=0,p=0;x<info.cols;x++){int r=row[p++],g=row[p++],b=row[p++],a=info.alpha?row[p++]:255;pixels[x]=(a<<24)|(r<<16)|(g<<8)|b;if(r!=g||r!=b)monochrome=false;if(a!=255)opaque=false;}
        }else for(int x=0,p=0;x<info.cols;x++){
          int r,g,b,a=255;
          if(info.indexed){int index=row[p++],rgb=palette.getEntry(index);r=rgb>>>16&255;g=rgb>>>8&255;b=rgb&255;if(index<paletteAlpha.length)a=paletteAlpha[index];}
          else if(info.greyscale){int raw=row[p++];r=g=b=raw*255/maximum;a=info.alpha?row[p++]*255/maximum:raw==grayKey?0:255;}
          else {int rr=row[p++],gg=row[p++],bb=row[p++];r=rr*255/maximum;g=gg*255/maximum;b=bb*255/maximum;a=info.alpha?row[p++]*255/maximum:rgbKey!=null&&rr==rgbKey[0]&&gg==rgbKey[1]&&bb==rgbKey[2]?0:255;}
          pixels[x]=(a<<24)|(r<<16)|(g<<8)|b;
          if(r!=g||r!=b)monochrome=false;if(a!=255)opaque=false;
        }
        sampler.row(y,pixels,monochrome,opaque);
      }
      reader.end();return sampler.finish();
    }catch(RuntimeException error){if(result!=null)result.recycle();throw new IOException("PNG 图片数据无法读取。",error);}
    catch(IOException error){if(result!=null)result.recycle();throw error;}
    catch(OutOfMemoryError error){if(result!=null)result.recycle();throw error;}
    finally{if(reader!=null)reader.close();}
  }
}
