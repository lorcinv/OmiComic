package io.github.lorcinv.omicomic;

import android.graphics.Bitmap;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Arrays;

/** Scale-aware low-pass reconstruction for a bounded, already decoded raster.
 * A few horizontally filtered rows are retained; no full-size source copy or
 * full intermediate bitmap is allocated, including long/high-pixel pages. */
final class DisplayResampler {
  private static final class Weights {int start;float[] values;boolean symmetric;}
  private static Weights[] weights(int source,int target,double filterRatio){
    Weights[] table=new Weights[target];double scale=target/(double)source,filterScale=filterRatio*.9,radius=3/filterScale;
    for(int out=0;out<target;out++){
      double center=(out+.5)/scale-.5;
      int first=Math.max(0,(int)Math.ceil(center-radius)),last=Math.min(source-1,(int)Math.floor(center+radius));
      Weights w=new Weights();w.start=first;w.values=new float[last-first+1];w.symmetric=Math.abs(center-(first+last)*.5)<1e-8;double total=0;
      for(int i=first;i<=last;i++){
        double x=Math.abs((i-center)*filterScale),value=x<1e-8?1:x>=3?0:Math.sin(Math.PI*x)*Math.sin(Math.PI*x/3)/(Math.PI*Math.PI*x*x/3);
        w.values[i-first]=(float)value;total+=value;
      }
      for(int i=0;i<w.values.length;i++)w.values[i]/=(float)total;
      table[out]=w;
    }
    return table;
  }
  static Bitmap resize(Bitmap source,int width,int height,ReaderBitmapDecoder.Check check)throws IOException {
    if(width<1||height<1||(long)width*height>4000000L||width>=source.getWidth()||height>=source.getHeight())return null;
    return filter(source,width,height,width/(double)source.getWidth(),height/(double)source.getHeight(),check);
  }
  static Bitmap prefilter(Bitmap source,double ratio,ReaderBitmapDecoder.Check check)throws IOException {
    return filter(source,source.getWidth(),source.getHeight(),ratio,ratio,check);
  }
  static Bitmap reduce(Bitmap source,int width,int height,ReaderBitmapDecoder.Check check)throws IOException {
    if(width<1||height<1||(long)width*height>4000000L||width>source.getWidth()||height>source.getHeight())return null;
    return filter(source,width,height,width/(double)source.getWidth(),height/(double)source.getHeight(),check);
  }
  /** Streaming PNG low-pass, before inSampleSize discards any pixels. */
  static final class Stream {
    final Bitmap bitmap;
    private final Weights[] xs,ys;
    private final LinkedHashMap<Integer,float[]> rows=new LinkedHashMap<>();
    private final ArrayDeque<float[]> reusable=new ArrayDeque<>();
    private final int[] output;
    private final boolean alpha;
    private boolean grayscale=true,solid=true;
    private static final class RowMemo {int[] input;float[] filtered;}
    private final LinkedHashMap<Integer,RowMemo> memoRows=new LinkedHashMap<>(16,.75f,true);
    private final int memoLimit;
    private int next;
    Stream(int sourceWidth,int sourceHeight,int width,int height,boolean alpha){
      xs=weights(sourceWidth,width,width/(double)sourceWidth);ys=weights(sourceHeight,height,height/(double)sourceHeight);
      bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);output=new int[width];this.alpha=alpha;
      memoLimit=Math.min(64,Math.max(1,(int)(2L*1024*1024/((long)sourceWidth*4+(long)width*16))));
    }
    void row(int y,int[] input,boolean monochrome,boolean opaque){
      if(next>=ys.length||y<ys[next].start)return;
      grayscale&=monochrome;solid&=opaque;
      float[] filtered=reusable.poll();if(filtered==null)filtered=new float[xs.length*4];
      // Repeated scanlines are common in flat fills and screentones. Verify
      // bytes after the hash; cached copies never alias the reusable row pool.
      int hash=Arrays.hashCode(input);RowMemo memo=memoRows.get(hash);
      if(memo!=null&&Arrays.equals(memo.input,input))System.arraycopy(memo.filtered,0,filtered,0,filtered.length);
      else{
       for(int x=0;x<xs.length;x++){
        Weights horizontal=xs[x];float r=0,g=0,b=0,a=0;
        // Opaque rows do not need a per-tap alpha sum. Grayscale rows need
        // only one colour channel; retain the exact same normalized kernel.
        if(monochrome&&opaque){
          int length=horizontal.values.length;
          if(horizontal.symmetric){for(int i=0;i<length/2;i++)r+=((input[horizontal.start+i]&255)+(input[horizontal.start+length-1-i]&255))*horizontal.values[i];if((length&1)!=0)r+=(input[horizontal.start+length/2]&255)*horizontal.values[length/2];}
          else for(int i=0;i<length;i++)r+=(input[horizontal.start+i]&255)*horizontal.values[i];r*=255;g=b=r;a=255;
        }else if(opaque){
          for(int i=0;i<horizontal.values.length;i++){int pixel=input[horizontal.start+i];float w=horizontal.values[i];r+=(pixel>>>16&255)*w;g+=(pixel>>>8&255)*w;b+=(pixel&255)*w;}r*=255;g*=255;b*=255;a=255;
        }else if(monochrome){
          for(int i=0;i<horizontal.values.length;i++){int pixel=input[horizontal.start+i];float w=(alpha&&!opaque?(pixel>>>24):255)*horizontal.values[i];r+=(pixel&255)*w;a+=w;}g=b=r;
        }else for(int i=0;i<horizontal.values.length;i++){
          int pixel=input[horizontal.start+i];float weightedOpacity=(alpha&&!opaque?(pixel>>>24):255)*horizontal.values[i];
          r+=(pixel>>>16&255)*weightedOpacity;g+=(pixel>>>8&255)*weightedOpacity;b+=(pixel&255)*weightedOpacity;a+=weightedOpacity;
        }
        int at=x*4;filtered[at]=r;filtered[at+1]=g;filtered[at+2]=b;filtered[at+3]=a;
       }
       if(memo==null){
         if(memoRows.size()>=memoLimit){Integer oldest=memoRows.keySet().iterator().next();memo=memoRows.remove(oldest);}
         else{memo=new RowMemo();memo.input=new int[input.length];memo.filtered=new float[filtered.length];}
       }
       System.arraycopy(input,0,memo.input,0,input.length);System.arraycopy(filtered,0,memo.filtered,0,filtered.length);memoRows.put(hash,memo);
      }
      rows.put(y,filtered);
      while(next<ys.length&&ys[next].start+ys[next].values.length-1<=y){
        Weights vertical=ys[next];float[][] contributing=new float[vertical.values.length][];
        for(int i=0;i<contributing.length;i++)contributing[i]=rows.get(vertical.start+i);
        for(int x=0;x<xs.length;x++){
          float r=0,g=0,b=0,a=0;int at=x*4;
          if(grayscale&&solid){
            int length=vertical.values.length;
            if(vertical.symmetric){for(int i=0;i<length/2;i++)r+=(contributing[i][at]+contributing[length-1-i][at])*vertical.values[i];if((length&1)!=0)r+=contributing[length/2][at]*vertical.values[length/2];}
            else for(int i=0;i<length;i++)r+=contributing[i][at]*vertical.values[i];int value=clamp(r/255);output[x]=0xff000000|value*0x010101;
          }else if(solid){
            for(int i=0;i<vertical.values.length;i++){float[] source=contributing[i];float w=vertical.values[i];r+=source[at]*w;g+=source[at+1]*w;b+=source[at+2]*w;}output[x]=0xff000000|(clamp(r/255)<<16)|(clamp(g/255)<<8)|clamp(b/255);
          }else{
            for(int i=0;i<vertical.values.length;i++){float[] source=contributing[i];float w=vertical.values[i];r+=source[at]*w;g+=source[at+1]*w;b+=source[at+2]*w;a+=source[at+3]*w;}
            output[x]=a<.5f?0:(clamp(a)<<24)|(clamp(r/a)<<16)|(clamp(g/a)<<8)|clamp(b/a);
          }
        }
        bitmap.setPixels(output,0,xs.length,0,next,xs.length,1);next++;
        int keep=next<ys.length?ys[next].start:Integer.MAX_VALUE;
        Iterator<Map.Entry<Integer,float[]>> old=rows.entrySet().iterator();
        while(old.hasNext()){Map.Entry<Integer,float[]> entry=old.next();if(entry.getKey()>=keep)break;reusable.add(entry.getValue());old.remove();}
      }
    }
    Bitmap finish()throws IOException {
      if(next!=ys.length)throw new IOException("Incomplete PNG sampling rows");
      bitmap.setDensity(Bitmap.DENSITY_NONE);bitmap.prepareToDraw();return bitmap;
    }
  }
  private static Bitmap filter(Bitmap source,int width,int height,double xRatio,double yRatio,ReaderBitmapDecoder.Check check)throws IOException {
    check.run();
    Weights[] xs=weights(source.getWidth(),width,xRatio),ys=weights(source.getHeight(),height,yRatio);
    int[] input=new int[source.getWidth()],output=new int[width];
    LinkedHashMap<Integer,float[]> rows=new LinkedHashMap<>();ArrayDeque<float[]> reusable=new ArrayDeque<>();
    Bitmap result=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
    boolean alpha=source.hasAlpha();
    try{
      for(int y=0;y<height;y++){
        check.run();Weights vertical=ys[y];
        Iterator<Map.Entry<Integer,float[]>> old=rows.entrySet().iterator();
        while(old.hasNext()){Map.Entry<Integer,float[]> row=old.next();if(row.getKey()>=vertical.start)break;reusable.add(row.getValue());old.remove();}
        for(int row=vertical.start;row<vertical.start+vertical.values.length;row++){
          if(rows.containsKey(row))continue;
          check.run();source.getPixels(input,0,input.length,0,row,input.length,1);
          float[] filtered=reusable.poll();if(filtered==null)filtered=new float[width*4];
          for(int x=0;x<width;x++){
            Weights horizontal=xs[x];float r=0,g=0,b=0,a=0;
            for(int i=0;i<horizontal.values.length;i++){
              int pixel=input[horizontal.start+i];float weightedOpacity=(alpha?(pixel>>>24):255)*horizontal.values[i];
              r+=(pixel>>>16&255)*weightedOpacity;g+=(pixel>>>8&255)*weightedOpacity;b+=(pixel&255)*weightedOpacity;a+=weightedOpacity;
            }
            int at=x*4;filtered[at]=r;filtered[at+1]=g;filtered[at+2]=b;filtered[at+3]=a;
          }
          rows.put(row,filtered);
        }
        float[][] contributing=new float[vertical.values.length][];
        for(int i=0;i<contributing.length;i++)contributing[i]=rows.get(vertical.start+i);
        for(int x=0;x<width;x++){
          float r=0,g=0,b=0,a=0;int at=x*4;
          for(int i=0;i<vertical.values.length;i++){
            float[] row=contributing[i];float weight=vertical.values[i];
            r+=row[at]*weight;g+=row[at+1]*weight;b+=row[at+2]*weight;a+=row[at+3]*weight;
          }
          output[x]=a<.5f?0:(clamp(a)<<24)|(clamp(r/a)<<16)|(clamp(g/a)<<8)|clamp(b/a);
        }
        result.setPixels(output,0,width,0,y,width,1);
      }
      check.run();result.setDensity(Bitmap.DENSITY_NONE);result.prepareToDraw();return result;
    }catch(IOException|RuntimeException|OutOfMemoryError error){result.recycle();throw error;}
  }
  private static int clamp(float n){return Math.max(0,Math.min(255,Math.round(n)));}
}
