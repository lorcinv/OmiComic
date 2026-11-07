package io.github.lorcinv.omicomic;

import android.content.Context;
import android.graphics.*;
import android.os.Looper;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Executes the production surface. Only file I/O is shadowed; detail work is
 * deliberately blocked so that a decoder can never hide a presentation stall. */
@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE,sdk=28,shadows=ReaderMotionTest.Library.class,instrumentedPackages="io.github.lorcinv.omicomic")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
public class ReaderMotionTest {
  @Implements(value=LocalLibrary.class,isInAndroidSdk=false,callThroughByDefault=false)
  public static class Library {
    @Implementation protected void __constructor__(Context context){}
    @Implementation protected boolean isPdfPage(String url){return url.endsWith("pdf");}
    @Implementation protected boolean isDocumentPage(String url){return url.endsWith("pdf");}
  }
  NativeReaderSurface surface;CountDownLatch release;Bitmap screen;int width=400,height=600;
  static Object get(Object o,String name)throws Exception{Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(o);}
  static void set(Object o,String name,Object v)throws Exception{Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);f.set(o,v);}
  static Object invoke(Object o,String name,Class<?>[] types,Object... args)throws Exception{Method m=o.getClass().getDeclaredMethod(name,types);m.setAccessible(true);return m.invoke(o,args);}
  void start(String url)throws Exception{
    Context context=RuntimeEnvironment.getApplication();surface=new NativeReaderSurface(context,new LocalLibrary(context));surface.layout(0,0,width,height);set(surface,"active",true);set(surface,"session",1L);set(surface,"budget",100L*1024*1024);
    CountDownLatch entered=new CountDownLatch(1);release=new CountDownLatch(1);
    ((ReaderWorkQueue)get(surface,"details")).execute(-100,()->{entered.countDown();try{release.await(30,TimeUnit.SECONDS);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}});
    assertTrue(entered.await(5,TimeUnit.SECONDS));
    Bitmap body=Bitmap.createBitmap(400,600,Bitmap.Config.ARGB_8888);Canvas bodyCanvas=new Canvas(body);bodyCanvas.scale(.25f,.25f);pattern(bodyCanvas);
    Class<?> type=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$Raster");Constructor<?> ctor=type.getDeclaredConstructor(String.class,Bitmap.class,int.class,int.class,int.class,int.class);ctor.setAccessible(true);
    Object raster=ctor.newInstance(url,body,1600,2400,4,1);
    ((Map)get(surface,"cache")).put(url,raster);set(surface,"bytes",(long)body.getAllocationByteCount());
    screen=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
    apply(url,-width,-(width*4.5f-height)/2,false);completeDetail();draw();assertTrue((Boolean)get(surface,"lastDrawSharp"));
  }
  static void pattern(Canvas canvas){Paint paint=new Paint();paint.setColor(Color.RED);canvas.drawRect(0,0,800,1200,paint);paint.setColor(Color.GREEN);canvas.drawRect(800,0,1600,1200,paint);paint.setColor(Color.BLUE);canvas.drawRect(0,1200,800,2400,paint);paint.setColor(Color.YELLOW);canvas.drawRect(800,1200,1600,2400,paint);}
  int expectedCenter(float x,float y){float sourceX=(width/2f-x)*1600/(width*3f),sourceY=(height/2f-y)*2400/(width*4.5f);return sourceY<1200?(sourceX<800?Color.RED:Color.GREEN):(sourceX<800?Color.BLUE:Color.YELLOW);}
  JSONObject frame(String url,float x,float y,boolean panorama)throws Exception{
    JSONArray rect=new JSONArray(new float[]{x,y,x+width*3f,y+width*4.5f});return new JSONObject().put("session",1).put("viewportWidth",width).put("clip",new JSONArray(new int[]{0,0,width,height})).put("zoom",3).put("panorama",panorama).put("slots",new JSONArray().put(new JSONObject().put("url",url).put("rect",rect).put("alpha",1))).put("expected",new JSONArray().put(rect));
  }
  void apply(String url,float x,float y,boolean panorama)throws Exception{invoke(surface,"applyFrame",new Class[]{JSONObject.class},frame(url,x,y,panorama));draw();}
  void draw(){surface.draw(new Canvas(screen));}
  RectF pose()throws Exception{return new RectF((RectF)get(((List)get(get(surface,"current"),"slots")).get(0),"rect"));}
  void completeDetail()throws Exception{
    Map plans=(Map)get(surface,"plannedDetails"),tiles=(Map)get(surface,"tiles"),pending=(Map)get(surface,"tilesPending");
    synchronized(get(surface,"cacheLock")){
      for(Object plan:plans.values()){
        List<Rect> regions=(List<Rect>)get(plan,"regions");List<String> keys=(List<String>)get(plan,"keys");float density=(Float)get(plan,"density");
        for(int i=0;i<keys.size();i++){
          if(!tiles.containsKey(keys.get(i))){Rect r=regions.get(i);Class<?> type=Class.forName("io.github.lorcinv.omicomic.NativeReaderSurface$Tile");Constructor<?> ctor=type.getDeclaredConstructor();ctor.setAccessible(true);Object tile=ctor.newInstance();Bitmap bitmap=Bitmap.createBitmap((int)Math.ceil(r.width()*density),(int)Math.ceil(r.height()*density),Bitmap.Config.ARGB_8888);Canvas detailCanvas=new Canvas(bitmap);detailCanvas.scale(density,density);detailCanvas.translate(-r.left,-r.top);pattern(detailCanvas);set(tile,"bitmap",bitmap);set(tile,"source",r);tiles.put(keys.get(i),tile);set(surface,"tileBytes",(Long)get(surface,"tileBytes")+bitmap.getAllocationByteCount());}
          pending.remove(keys.get(i));
        }
      }
    }
    invoke(surface,"commitFrame",new Class[]{});draw();
  }
  @After public void stop(){if(surface!=null)surface.close();if(release!=null)release.countDown();}
  void follows(String url,boolean panorama)throws Exception{
    start(url);
    float maxX=width*2f,maxY=width*4.5f-height;
    for(float[] fraction:new float[][]{{.85f,.85f},{.1f,.1f},{.8f,.8f},{.1f,.85f},{.85f,.1f},{.1f,.1f}}){
      float x=Math.round(-maxX*fraction[0]),y=Math.round(-maxY*fraction[1]);
      apply(url,x,y,panorama);RectF p=pose();assertEquals("decoder froze horizontal pan",x,p.left,0);assertEquals("decoder froze vertical pan",y,p.top,0);
      assertEquals("displayed pixels did not follow the finger",expectedCenter(x,y),screen.getPixel(width/2,height/2));
    }
    RectF held=pose();for(int i=0;i<3;i++)completeDetail();assertEquals("detail completion moved the held image",held,pose());assertTrue("settled detail never became sharp",(Boolean)get(surface,"lastDrawSharp"));
    JSONObject stats=surface.stats();assertTrue(stats.getLong("tileBytes")<=stats.getLong("tileBudget"));assertTrue(stats.getLong("bitmapBytes")+stats.getLong("tileBytes")<=stats.getLong("budget"));
  }
  @Test public void archiveOrdinaryFollowsWhileDecoderBlocked()throws Exception{follows("https://omi.local/media/archive",false);}
  @Test public void archivePanoramaFollowsWhileDecoderBlocked()throws Exception{follows("https://omi.local/media/archive",true);}
  @Test public void pdfOrdinaryFollowsWhileDecoderBlocked()throws Exception{follows("https://omi.local/media/pdf",false);}
  @Test public void pdfPanoramaFollowsWhileDecoderBlocked()throws Exception{follows("https://omi.local/media/pdf",true);}
  @Test public void tabletArchiveOrdinaryFollowsWhileDecoderBlocked()throws Exception{width=1000;height=750;follows("https://omi.local/media/archive",false);}
  @Test public void tabletArchivePanoramaFollowsWhileDecoderBlocked()throws Exception{width=1000;height=750;follows("https://omi.local/media/archive",true);}
  @Test public void tabletPdfOrdinaryFollowsWhileDecoderBlocked()throws Exception{width=1000;height=750;follows("https://omi.local/media/pdf",false);}
  @Test public void tabletPdfPanoramaFollowsWhileDecoderBlocked()throws Exception{width=1000;height=750;follows("https://omi.local/media/pdf",true);}
  @Test public void queuedGeometryWinsOverOlderCompletion()throws Exception{
    String url="https://omi.local/media/archive";start(url);Object held=get(surface,"current");apply(url,-600,-900,false);Object obsolete=get(surface,"pendingFrame");if(obsolete==null)obsolete=get(surface,"current");set(surface,"current",held);set(surface,"pendingFrame",obsolete);set(surface,"queuedGeometry",frame(url,-100,-100,false));completeDetail();assertSame("stale completion was published",held,get(surface,"current"));set(surface,"queuedGeometry",null);apply(url,-100,-100,false);assertEquals(-100,pose().left,0);
  }
  @Test public void missingPageBodyDoesNotReplaceVisiblePage()throws Exception{
    start("https://omi.local/media/archive");Object held=get(surface,"current");int pixel=screen.getPixel(width/2,height/2);apply("https://omi.local/media/not-decoded",-400,-600,false);assertSame("missing page replaced decoded pixels",held,get(surface,"current"));assertEquals(pixel,screen.getPixel(width/2,height/2));
  }
}
