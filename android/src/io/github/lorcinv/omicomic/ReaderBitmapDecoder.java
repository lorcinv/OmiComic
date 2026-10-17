package io.github.lorcinv.omicomic;

import android.graphics.*;
import java.io.*;
import java.util.Arrays;
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
    if(!png)return reducedRegion(decoder,rect,sample,false);
    try{while(!pngNative.tryLock(50,java.util.concurrent.TimeUnit.MILLISECONDS))check.run();}
    catch(InterruptedException cancelled){Thread.currentThread().interrupt();throw new IOException("PNG decoding interrupted",cancelled);}
    Bitmap result=null;
    try{
      check.run();int rows=Math.max(sample,(int)(STRIP_BYTES/Math.max(1,(long)rect.width()*4))/sample*sample);
      if(rect.height()<=rows)return reducedRegion(decoder,rect,sample,true);
      result=Bitmap.createBitmap((rect.width()+sample-1)/sample,(rect.height()+sample-1)/sample,Bitmap.Config.ARGB_8888);
      Canvas canvas=new Canvas(result);
      for(int y=rect.top;y<rect.bottom;y+=rows){
        check.run();Bitmap strip=reducedRegion(decoder,new Rect(rect.left,y,rect.right,Math.min(rect.bottom,y+rows)),sample,true);
        if(strip==null)throw new IOException("PNG region unavailable");
        canvas.drawBitmap(strip,0,(y-rect.top)/sample,null);strip.recycle();
      }
      return result;
    }catch(IOException|RuntimeException|OutOfMemoryError error){if(result!=null)result.recycle();throw error;}
    finally{pngNative.unlock();}
  }
  private static Bitmap reducedRegion(BitmapRegionDecoder decoder,Rect rect,int sample,boolean png){
    BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=png?1:sample;options.inPreferredConfig=Bitmap.Config.ARGB_8888;
    Bitmap bitmap=decoder.decodeRegion(rect,options);
    if(png&&bitmap!=null)for(int level=1;level<sample;level*=2){
      Bitmap next=Bitmap.createScaledBitmap(bitmap,Math.max(1,(bitmap.getWidth()+1)/2),Math.max(1,(bitmap.getHeight()+1)/2),true);
      if(next!=bitmap)bitmap.recycle();bitmap=next;
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
      result=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
      long[] sums=new long[w*4];int[] output=new int[w];int rows=0;
      for(int y=0;y<info.rows;y++){
        if((y&31)==0)check.run();
        int[] row=reader.readRowInt().getScanline();
        if(info.bitDepth==8&&!info.indexed&&!info.greyscale&&transparency==null){
          // The usual RGB/RGBA scan avoids per-pixel division and dynamic colour
          // model branches. Accumulate one output bucket in local registers.
          for(int x=0,p=0;x<w;x++){
            int count=Math.min(sample,info.cols-x*sample);long r=0,g=0,b=0,a=0;
            if(info.alpha){for(int i=0;i<count;i++){int rr=row[p++],gg=row[p++],bb=row[p++],aa=row[p++];r+=rr*aa;g+=gg*aa;b+=bb*aa;a+=aa;}}
            else {for(int i=0;i<count;i++){r+=row[p++];g+=row[p++];b+=row[p++];}r*=255;g*=255;b*=255;a=count*255L;}
            int at=x*4;sums[at]+=r;sums[at+1]+=g;sums[at+2]+=b;sums[at+3]+=a;
          }
        }else for(int x=0,p=0;x<info.cols;x++){
          int r,g,b,a=255;
          if(info.indexed){int index=row[p++],rgb=palette.getEntry(index);r=rgb>>>16&255;g=rgb>>>8&255;b=rgb&255;if(index<paletteAlpha.length)a=paletteAlpha[index];}
          else if(info.greyscale){int raw=row[p++];r=g=b=raw*255/maximum;a=info.alpha?row[p++]*255/maximum:raw==grayKey?0:255;}
          else {int rr=row[p++],gg=row[p++],bb=row[p++];r=rr*255/maximum;g=gg*255/maximum;b=bb*255/maximum;a=info.alpha?row[p++]*255/maximum:rgbKey!=null&&rr==rgbKey[0]&&gg==rgbKey[1]&&bb==rgbKey[2]?0:255;}
          int at=(x/sample)*4;sums[at]+=(long)r*a;sums[at+1]+=(long)g*a;sums[at+2]+=(long)b*a;sums[at+3]+=a;
        }
        rows++;
        if(rows==sample||y==info.rows-1){
          for(int x=0;x<w;x++){
            int at=x*4;long alpha=sums[at+3];int count=rows*Math.min(sample,info.cols-x*sample);
            output[x]=alpha==0?0:((int)((alpha+count/2)/count)<<24)|((int)((sums[at]+alpha/2)/alpha)<<16)|((int)((sums[at+1]+alpha/2)/alpha)<<8)|(int)((sums[at+2]+alpha/2)/alpha);
          }
          result.setPixels(output,0,w,0,y/sample,w,1);Arrays.fill(sums,0);rows=0;
        }
      }
      reader.end();return result;
    }catch(RuntimeException error){if(result!=null)result.recycle();throw new IOException("PNG 图片数据无法读取。",error);}
    catch(IOException error){if(result!=null)result.recycle();throw error;}
    catch(OutOfMemoryError error){if(result!=null)result.recycle();throw error;}
    finally{if(reader!=null)reader.close();}
  }
}
