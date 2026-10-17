package io.github.lorcinv.omicomic;

import android.graphics.Bitmap;
import org.json.JSONObject;

/** The Omi adjustments applied off the UI thread, to screen-sized bitmaps/tiles. */
final class NativeImageAdjustments {
  static boolean changed(JSONObject s){return s.optBoolean("enabled")&&(s.optDouble("brightness",100)!=100||s.optDouble("contrast",100)!=100||s.optDouble("gamma",1)!=1||s.optDouble("warmth")!=0||s.optBoolean("grayscale")||s.optBoolean("invert")||s.optDouble("sharpen")!=0||s.optDouble("denoise")!=0);}
  private static int clamp(double n){return Math.max(0,Math.min(255,(int)Math.round(n)));}
  static Bitmap apply(Bitmap bitmap,JSONObject s){
    int w=bitmap.getWidth(),h=bitmap.getHeight();int[] pixels=new int[w*h];bitmap.getPixels(pixels,0,w,0,0,w,h);
    double noise=s.optDouble("denoise")/100,sharp=s.optDouble("sharpen")*.007;
    if(noise>0||sharp>0){
      int[] out=new int[pixels.length];double[] range=new double[256];double sigma=5+noise*14;
      for(int i=0;i<256;i++)range[i]=Math.exp(-i*i/(2*sigma*sigma));
      for(int y=0;y<h;y++)for(int x=0;x<w;x++){
        int p=pixels[y*w+x],r=(p>>16)&255,g=(p>>8)&255,b=p&255;double weight=0,br=0,bg=0,bb=0,rr=0,gg=0,bb2=0,ws=0;
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
          int q=pixels[Math.min(h-1,Math.max(0,y+dy))*w+Math.min(w-1,Math.max(0,x+dx))];int qr=(q>>16)&255,qg=(q>>8)&255,qb=q&255;
          int spatial=dx==0&&dy==0?4:dx==0||dy==0?2:1;double weightQ=spatial*range[Math.max(Math.abs(qr-r),Math.max(Math.abs(qg-g),Math.abs(qb-b)))];
          weight+=weightQ;rr+=qr*weightQ;gg+=qg*weightQ;bb2+=qb*weightQ;br+=qr*spatial;bg+=qg*spatial;bb+=qb*spatial;ws+=spatial;
        }
        double nr=r+(rr/weight-r)*noise,ng=g+(gg/weight-g)*noise,nb=b+(bb2/weight-b)*noise;
        out[y*w+x]=(p&0xff000000)|(clamp(nr+detail(nr-br/ws)*sharp)<<16)|(clamp(ng+detail(ng-bg/ws)*sharp)<<8)|clamp(nb+detail(nb-bb/ws)*sharp);
      }pixels=out;
    }
    double gamma=1/Math.max(.5,Math.min(2,s.optDouble("gamma",1))),brightness=s.optDouble("brightness",100)/100,contrast=s.optDouble("contrast",100)/100,sepia=s.optDouble("warmth")*.0035;
    int[] lut=new int[256];for(int i=0;i<256;i++)lut[i]=clamp((255*Math.pow(i/255.0,gamma)*brightness-127.5)*contrast+127.5);
    for(int i=0;i<pixels.length;i++){
      int p=pixels[i];double r=lut[(p>>16)&255],g=lut[(p>>8)&255],b=lut[p&255];
      double nr=r*(1-sepia)+(.393*r+.769*g+.189*b)*sepia,ng=g*(1-sepia)+(.349*r+.686*g+.168*b)*sepia,nb=b*(1-sepia)+(.272*r+.534*g+.131*b)*sepia;
      if(s.optBoolean("grayscale"))nr=ng=nb=.2126*nr+.7152*ng+.0722*nb;
      if(s.optBoolean("invert")){nr=255-nr;ng=255-ng;nb=255-nb;}
      pixels[i]=(p&0xff000000)|(clamp(nr)<<16)|(clamp(ng)<<8)|clamp(nb);
    }
    Bitmap result=Bitmap.createBitmap(pixels,w,h,Bitmap.Config.ARGB_8888);result.prepareToDraw();return result;
  }
  private static double detail(double n){return Math.abs(n)<3?0:Math.max(-24,Math.min(24,n));}
}
