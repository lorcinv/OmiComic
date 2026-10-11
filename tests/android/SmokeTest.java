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
  @Override public void onStart() {
    Bundle output=new Bundle();
    try {
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
        Thread.sleep(100);
      }
      String json=(String)new JSONTokener(result).nextValue();
      JSONObject resultObject=new JSONObject(json);
      android.graphics.drawable.Drawable icon=getTargetContext().getApplicationInfo().loadIcon(getTargetContext().getPackageManager());
      boolean adaptive=icon instanceof android.graphics.drawable.AdaptiveIconDrawable;
      boolean monochrome=Build.VERSION.SDK_INT>=33&&adaptive&&((android.graphics.drawable.AdaptiveIconDrawable)icon).getMonochrome()!=null;
      String archiveVersion=new String((byte[])Class.forName("me.zhanghai.android.libarchive.Archive").getMethod("versionDetails").invoke(null),StandardCharsets.UTF_8);
      resultObject.put("native",new JSONObject().put("version",packageInfo.versionName).put("versionCode",packageInfo.versionCode).put("displayedVersionMatches",true).put("adaptiveIcon",adaptive).put("monochromeIcon",monochrome).put("archiveVersion",archiveVersion));
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
