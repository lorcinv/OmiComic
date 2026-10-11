package io.github.lorcinv.omicomic.test;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Separate, same-signer instrumentation APK. The shipped app needs no debug bridge. */
public final class SmokeTest extends Instrumentation {
  private Bundle args;
  private WebView web;
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); args=arguments; start(); }
  private WebView find(View view) {
    if(view instanceof WebView)return (WebView)view;
    if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView w=find(((ViewGroup)view).getChildAt(i));if(w!=null)return w;}
    return null;
  }
  private String eval(String script)throws Exception {
    CountDownLatch done=new CountDownLatch(1);String[] result={null};
    runOnMainSync(()->web.evaluateJavascript(script,value->{result[0]=value;done.countDown();}));
    if(!done.await(10,TimeUnit.SECONDS))throw new IOException("WebView evaluation timed out");
    return result[0];
  }
  private Object field(Object object,String name)throws Exception {java.lang.reflect.Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(object);}
  private JSONObject storageTest(Object library)throws Exception {
    Class<?> type=library.getClass();
    java.lang.reflect.Method grant=type.getDeclaredMethod("addGrant",android.net.Uri.class,boolean.class);grant.setAccessible(true);
    java.lang.reflect.Method call=type.getDeclaredMethod("call",String.class,JSONObject.class);call.setAccessible(true);
    String path=(String)grant.invoke(library,android.net.Uri.parse("content://io.github.lorcinv.omicomic.test.pipe/document/stream"),false);
    try {
      long before=(long)field(library,"copiedBytes");
      JSONObject cover=(JSONObject)call.invoke(library,"getThumbnail",new JSONObject().put("path",path));
      if((long)field(library,"copiedBytes")!=before)throw new IOException("Cover metadata copied the streaming archive");
      java.lang.reflect.Method media=type.getDeclaredMethod("media",String.class);media.setAccessible(true);
      try {media.invoke(library,android.net.Uri.parse(cover.getString("url")).getLastPathSegment());throw new IOException("Background preview consumed a streaming document");}
      catch(java.lang.reflect.InvocationTargetException expected){if(!(expected.getCause() instanceof IOException))throw expected;}
      JSONObject pages=(JSONObject)call.invoke(library,"getResourcePages",new JSONObject().put("path",path));
      if(pages.getInt("total")!=3)throw new IOException("Streaming fallback lost pages");
      long copied=(long)field(library,"copiedBytes");if(copied<=before)throw new IOException("Streaming archive was not cached");
      call.invoke(library,"releaseReaderResource",new JSONObject().put("path",path));
      call.invoke(library,"getResourcePages",new JSONObject().put("path",path));
      if((long)field(library,"copiedBytes")!=copied)throw new IOException("Streaming archive was copied twice");
      JSONObject page=pages.getJSONArray("pages").getJSONObject(1);
      JSONObject image=(JSONObject)call.invoke(library,"getPageImage",page);
      android.webkit.WebResourceResponse response=(android.webkit.WebResourceResponse)media.invoke(library,android.net.Uri.parse(image.getString("url")).getLastPathSegment());
      try(InputStream input=response.getData()){
        android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeStream(input);
        if(bitmap==null||bitmap.getWidth()!=800)throw new IOException("Cached streaming page failed to decode");bitmap.recycle();
      }
      return new JSONObject().put("backgroundDidNotCopy",true).put("copiedOnce",true).put("pageDecodedAfterReopen",true).put("copiedBytes",copied-before);
    }finally{getTargetContext().getSharedPreferences("omi-grants",0).edit().remove(path).commit();}
  }
  private void clearCache(File directory)throws IOException {
    File base=getTargetContext().getCacheDir().getCanonicalFile();
    if(!directory.getCanonicalPath().startsWith(base.getPath()+File.separator))throw new IOException("Refusing non-cache deletion");
    File[] files=directory.listFiles();if(files!=null)for(File file:files){if(file.isDirectory())clearCache(file);else file.delete();}
    directory.delete();
  }
  @Override public void onStart() {
    Bundle output=new Bundle();
    try {
      if("cold".equals(args.getString("cache")))for(String name:new String[]{"reader","covers","archive-indexes"})clearCache(new File(getTargetContext().getCacheDir(),name));
      Activity activity=startActivitySync(new Intent().setClassName("io.github.lorcinv.omicomic","io.github.lorcinv.omicomic.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
      if(web==null)throw new IOException("WebView missing");
      long deadline=System.currentTimeMillis()+30000;
      while(!"true".equals(eval("!!window.omicomic && !!document.querySelector('.omi-home')"))){if(System.currentTimeMillis()>deadline)throw new IOException("App startup failed: "+eval("document.body.innerText"));Thread.sleep(100);}
      String mode=args.getString("mode","smoke");
      android.content.pm.PackageInfo packageInfo=getTargetContext().getPackageManager().getPackageInfo("io.github.lorcinv.omicomic",0);
      String expectedVersion=args.getString("expectedVersion",packageInfo.versionName);
      if(!expectedVersion.equals(packageInfo.versionName))throw new IOException("Installed APK version mismatch: "+packageInfo.versionName);
      byte[] script;
      try(InputStream input=getContext().getAssets().open(mode+".js");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)bytes.write(buffer,0,n);script=bytes.toByteArray();}
      eval("window.__omiResult=null; (async()=>{const info=await window.omicomic.getAppInfo();if(info.version!=="+JSONObject.quote(expectedVersion)+")throw new Error('Displayed version mismatch: '+info.version);"+new String(script,StandardCharsets.UTF_8)+"})().then(result=>window.__omiResult={ok:true,result},error=>window.__omiResult={ok:false,error:String(error.stack||error),body:document.body.innerText.slice(-2500)});");
      deadline=System.currentTimeMillis()+150000;
      String result;
      while("null".equals(result=eval("JSON.stringify(window.__omiResult)"))||"\"null\"".equals(result)){
        if(System.currentTimeMillis()>deadline)throw new IOException("Smoke timed out: "+eval("document.body.innerText"));
        String tap=(String)new JSONTokener(eval("JSON.stringify(window.__omiTap||null)")).nextValue();
        if(!"null".equals(tap)){
          JSONObject point=new JSONObject(tap);int[] origin=new int[2],width=new int[1];
          runOnMainSync(()->{web.getLocationOnScreen(origin);width[0]=web.getWidth();});
          float scale=(float)(width[0]/point.getDouble("viewport"));
          float x=origin[0]+(float)point.getDouble("x")*scale,y=origin[1]+(float)point.getDouble("y")*scale;
          long down=SystemClock.uptimeMillis();
          MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0);press.setSource(InputDevice.SOURCE_TOUCHSCREEN);
          getUiAutomation().injectInputEvent(press,true);press.recycle();SystemClock.sleep(60);
          MotionEvent release=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);release.setSource(InputDevice.SOURCE_TOUCHSCREEN);
          getUiAutomation().injectInputEvent(release,true);release.recycle();eval("window.__omiTap=null");
        }
        Thread.sleep(100);
      }
      String json=(String)new JSONTokener(result).nextValue();
      JSONObject resultObject=new JSONObject(json);
      if(mode.equals("storage"))resultObject.put("storage",storageTest(field(activity,"library")));
      android.graphics.drawable.Drawable icon=getTargetContext().getApplicationInfo().loadIcon(getTargetContext().getPackageManager());
      boolean adaptive=icon instanceof android.graphics.drawable.AdaptiveIconDrawable;
      boolean monochrome=Build.VERSION.SDK_INT>=33&&adaptive&&((android.graphics.drawable.AdaptiveIconDrawable)icon).getMonochrome()!=null;
      String archiveVersion=new String((byte[])Class.forName("me.zhanghai.android.libarchive.Archive").getMethod("versionDetails").invoke(null),StandardCharsets.UTF_8);
      resultObject.put("native",new JSONObject().put("version",packageInfo.versionName).put("versionCode",packageInfo.versionCode).put("displayedVersionMatches",true).put("adaptiveIcon",adaptive).put("monochromeIcon",monochrome).put("archiveVersion",archiveVersion));
      try {
        Object library=field(activity,"library");
        JSONObject io=new JSONObject().put("directoryQueries",field(library,"directoryQueries")).put("wholeArchiveCopiedBytes",field(library,"copiedBytes"));
        io.put("readerIndexBuilds",field(field(library,"nativeArchives"),"indexBuilds"));
        io.put("previewIndexBuilds",field(field(library,"previewArchives"),"indexBuilds"));
        resultObject.put("io",io);
      }catch(NoSuchFieldException legacy){} // The same workload can measure the published 1.0.0 baseline.
      output.putString("result",resultObject.toString());
      File shots=getTargetContext().getExternalFilesDir(null);
      android.graphics.Bitmap iconBitmap=android.graphics.Bitmap.createBitmap(432,432,android.graphics.Bitmap.Config.ARGB_8888);
      icon.setBounds(0,0,432,432);icon.draw(new android.graphics.Canvas(iconBitmap));
      try(FileOutputStream file=new FileOutputStream(new File(shots,"android-icon.png"))){iconBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);}iconBitmap.recycle();
      android.graphics.Bitmap screenshot=getUiAutomation().takeScreenshot();
      if(screenshot!=null){try(FileOutputStream file=new FileOutputStream(new File(shots,"android-"+mode+".png"))){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);}screenshot.recycle();}
      finish(new JSONObject(json).getBoolean("ok")?Activity.RESULT_OK:Activity.RESULT_CANCELED,output);
    }catch(Throwable error){output.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,output);}
  }
}
