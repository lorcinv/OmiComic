package io.github.lorcinv.omicomic;

import android.app.Activity;
import android.view.KeyEvent;
import android.content.Intent;
import android.content.ClipData;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
  private WebView web;
  private FrameLayout rootFrame;
  private NativeReaderSurface readerSurface;
  private SceneTransition sceneTransition;
  private LaunchReveal launchReveal;
  private ResumeDrawGate resumeDrawGate;
  private boolean webStopped;
  private String systemTheme = "mist";
  private WebMessagePort channel;
  private LocalLibrary library;
  private final ReaderWorkQueue work = new ReaderWorkQueue();
  private final ReaderWorkQueue covers = new ReaderWorkQueue();
  private final ReaderWorkQueue pageRequests = new ReaderWorkQueue();
  private final ReaderWorkQueue persistence = new ReaderWorkQueue();
  private final ReaderWorkQueue openings = new ReaderWorkQueue();
  private boolean readerVolumeKeys;
  private final Set<Integer> capturedVolumeKeys = new HashSet<>();
  private long lastVolumeTurn;
  private int pickerId = -1;
  private boolean fullscreen;
  private boolean keyboardVisible;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    library = new LocalLibrary(this);
    FrameLayout frame = new FrameLayout(this);
    rootFrame = frame;
    LaunchReveal content=new LaunchReveal(this);
    launchReveal=content;
    readerSurface=new NativeReaderSurface(this,library);
    content.addView(readerSurface,new FrameLayout.LayoutParams(-1,-1));
    web = new WebView(this);
    // Keep one compositor mode throughout navigation and background restore.
    // Root/theme surfaces paint the background; only the reader DOM is clear.
    web.setBackgroundColor(android.graphics.Color.TRANSPARENT);
    content.addView(web, new FrameLayout.LayoutParams(-1,-1));
    // Only thumbnail pixels live above the WebView. This view is not clickable:
    // Omi's filmstrip still owns scrolling, selection, borders and captions.
    content.addView(readerSurface.previewOverlay(), new FrameLayout.LayoutParams(-1,-1));
    frame.addView(content,new FrameLayout.LayoutParams(-1,-1));
    sceneTransition=new SceneTransition(getWindow(),frame,content);
    resumeDrawGate=new ResumeDrawGate(getWindow(),frame,content,web);
    setContentView(frame);
    applySystemTheme(getPreferences(MODE_PRIVATE).getString("colorTheme", "mist"));
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      frame.setOnApplyWindowInsetsListener((v,insets)->{
        boolean visible=insets.isVisible(WindowInsets.Type.ime());
        if(keyboardVisible&&!visible)event("keyboard-hidden");
        keyboardVisible=visible;
        android.graphics.Insets padding = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
        v.setPadding(padding.left,padding.top,padding.right,padding.bottom); return insets;
      });
    } else {
      frame.getViewTreeObserver().addOnGlobalLayoutListener(()->{
        android.graphics.Rect visibleFrame=new android.graphics.Rect();
        frame.getWindowVisibleDisplayFrame(visibleFrame);
        boolean visible=frame.getRootView().getHeight()-visibleFrame.bottom>120*getResources().getDisplayMetrics().density;
        if(keyboardVisible&&!visible)event("keyboard-hidden");
        keyboardVisible=visible;
      });
    }
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setTextZoom(100);
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
        Uri uri=request.getUrl();
        if(isApp(uri))return false;
        if(request.isForMainFrame()&&request.hasGesture()&&"https".equals(uri.getScheme())&&"github.com".equalsIgnoreCase(uri.getHost())&&"/lorcinv/OmiComic".equals(uri.getPath())) {
          try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); }
          catch(android.content.ActivityNotFoundException error) { android.widget.Toast.makeText(MainActivity.this,"No browser available",android.widget.Toast.LENGTH_SHORT).show(); }
        }
        return true;
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request) {
        Uri uri=request.getUrl();
        if(!isApp(uri)) return response("text/plain",new ByteArrayInputStream(new byte[0]),403,"Blocked");
        try {
          if(uri.getPath().startsWith("/media/")) return library.media(uri.getLastPathSegment());
          String file=uri.getPath().substring(1);
          if(file.isEmpty())file="index.html";
          if(file.contains("..")||file.contains("\\")) throw new IOException("Invalid asset");
          String mime=file.endsWith(".mjs")||file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":file.endsWith(".json")?"application/json":file.endsWith(".wasm")?"application/wasm":file.endsWith(".svg")?"image/svg+xml":file.endsWith(".webp")?"image/webp":"application/octet-stream";
          return response(mime,getAssets().open("web/"+file),200,"OK");
        } catch(Exception e) { android.util.Log.w("OmiComic","Local media could not be read",e);return response("text/plain",new ByteArrayInputStream(new byte[0]),404,"Not found"); }
      }
      @Override public void onPageFinished(WebView v,String url) {
        if(!url.equals("https://omi.local/index.html"))return;
        // A failed frontend must still reveal its startup error; normal entry
        // releases this cover as soon as React has committed its first frame.
        v.postDelayed(()->revealLaunch(false),4000);
        readerVolumeKeys=false;
        if(channel!=null)channel.close();
        WebMessagePort[] ports=web.createWebMessageChannel();channel=ports[0];
        channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){
          @Override public void onMessage(WebMessagePort port,WebMessage msg){
            try {
              JSONObject input=new JSONObject(msg.getData());
              int id=input.getInt("id"); String method=input.getString("method");JSONObject args=input.optJSONObject("args");
              if(args==null)args=new JSONObject();
              if(method.equals("finishLaunch")){final boolean animated=args.optBoolean("animated",true);web.postVisualStateCallback(id,new WebView.VisualStateCallback(){@Override public void onComplete(long ignored){revealLaunch(animated);reply(id,true,null);}});return;}
              if(method.equals("readerConfigure")){readerSurface.configure(args);if(id!=0)reply(id,true,null);return;}
              if(method.equals("readerFrame")){readerSurface.frame(args);return;}
              if(method.equals("readerSeek")){readerSurface.seek(args);return;}
              if(method.equals("readerPrepare")){readerSurface.prepare(args,(value,error)->reply(id,value,error==null?null:explain(error)));return;}
              if(method.equals("readerStats")){reply(id,readerSurface.stats(),null);return;}
              if(method.equals("beginScene")){sceneTransition.begin(args.optLong("request"),()->reply(id,true,null));return;}
              if(method.equals("commitScene")){long request=args.optLong("request");String direction=args.optString("direction","forward");JSONObject origin=args.optJSONObject("origin");float scale=web.getWidth()/(float)args.optDouble("viewportWidth",web.getWidth());float x=origin==null?36:(float)origin.optDouble("x")*scale,y=origin==null?40:(float)origin.optDouble("y")*scale;web.postVisualStateCallback(request,new WebView.VisualStateCallback(){@Override public void onComplete(long ignored){FrameCommit.after(web,()->{sceneTransition.commit(request,direction,x,y);reply(id,true,null);});}});return;}
              if(method.equals("cancelScene")){sceneTransition.cancel();if(id!=0)reply(id,true,null);return;}
              if(method.equals("chooseFolder")||method.equals("chooseFile")){choose(id,method.equals("chooseFolder"));return;}
              if(method.equals("close")){reply(id,null,null);finish();return;}
              if(method.equals("background")){reply(id,null,null);moveTaskToBack(true);return;}
              if(method.equals("setColorTheme")){applySystemTheme(args.optString("theme"));reply(id,true,null);return;}
              if(method.equals("setFullscreen")){
                fullscreen=args.optBoolean("enabled");
                if(Build.VERSION.SDK_INT>=30){if(fullscreen)web.getWindowInsetsController().hide(WindowInsets.Type.systemBars());else web.getWindowInsetsController().show(WindowInsets.Type.systemBars());}
                else { web.setSystemUiVisibility(fullscreen?5894:0); applySystemTheme(systemTheme); }
                reply(id,fullscreen,null);return;
              }
              if(method.equals("isFullscreen")){reply(id,fullscreen,null);return;}
              if(method.equals("setReaderVolumeKeys")){readerVolumeKeys=args.optBoolean("enabled");reply(id,readerVolumeKeys,null);return;}
              final JSONObject params=args;
              int priority=method.equals("getThumbnail")||method.equals("getReadablePageCount")||method.equals("checkResourcePath")||method.equals("getBookmarkPagePreview")||(method.equals("openDocument")&&params.optString("purpose").equals("thumbnail"))?2:0;
              (method.equals("saveData")||method.equals("backupData")?persistence:method.equals("getResourcePages")?openings:method.equals("getThumbnail")?covers:method.equals("getPageImage")?pageRequests:work).execute(priority,()->{try{reply(id,library.call(method,params),null);}catch(Exception e){reply(id,null,explain(e));}});
            }catch(Exception e){android.util.Log.e("OmiComic","Invalid request",e);}
          }
        });
        web.postWebMessage(new WebMessage("omi-native",new WebMessagePort[]{ports[1]}),Uri.parse("https://omi.local"));
      }
    });
    web.loadUrl("https://omi.local/index.html");
  }

  private void applySystemTheme(String requested) {
    String theme = Arrays.asList("mist", "nord", "sand", "night").contains(requested) ? requested : "mist";
    systemTheme = theme;
    boolean dark = theme.equals("night");
    int color = dark ? 0xff2e3440 : theme.equals("nord") ? 0xffe2e8f2 : theme.equals("sand") ? 0xfff3efe9 : 0xfff8f8f7;
    // The root paints the inset areas too on Android versions enforcing edge-to-edge.
    rootFrame.setBackgroundColor(color);
    getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(color));
    // Edge-to-edge bars stay transparent; the themed root paints behind them.
    int barColor = Build.VERSION.SDK_INT >= 30 ? android.graphics.Color.TRANSPARENT : color;
    getWindow().setStatusBarColor(barColor);
    getWindow().setNavigationBarColor(barColor);
    if (Build.VERSION.SDK_INT >= 29) {
      getWindow().setStatusBarContrastEnforced(false);
      getWindow().setNavigationBarContrastEnforced(false);
    }
    if (Build.VERSION.SDK_INT >= 30) {
      android.view.WindowInsetsController controller = getWindow().getInsetsController();
      int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
      if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : mask, mask);
    } else {
      int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      int flags = web.getSystemUiVisibility();
      web.setSystemUiVisibility(dark ? flags & ~mask : flags | mask);
    }
    getPreferences(MODE_PRIVATE).edit().putString("colorTheme", theme).apply();
  }
  private int themeColor(){return systemTheme.equals("night")?0xff2e3440:systemTheme.equals("nord")?0xffe2e8f2:systemTheme.equals("sand")?0xfff3efe9:0xfff8f8f7;}

  private void revealLaunch(boolean animated) {
    if(!isDestroyed())launchReveal.ready(animated);
  }

  static boolean isApp(Uri uri){return "https".equals(uri.getScheme())&&"omi.local".equals(uri.getHost());}
  static WebResourceResponse response(String mime,InputStream stream,int code,String reason){
    Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
    return new WebResourceResponse(mime,"UTF-8",code,reason,headers,stream);
  }
  private String explain(Exception e){
    if(e instanceof SecurityException)return "目录授权已失效或不允许修改，请重新添加目录并授予访问权限。";
    if(e instanceof FileNotFoundException)return "文件不存在或不可读取，请刷新目录。";
    return e.getMessage()==null?"本地文件操作失败。":e.getMessage();
  }
  private void reply(int id,Object data,String error){
    try{JSONObject m=new JSONObject().put("id",id);if(error==null)m.put("data",data==null?JSONObject.NULL:data);else m.put("error",error);
      // Large page indexes are serialized on their worker, not on the UI thread.
      String payload=m.toString();runOnUiThread(()->{try{if(channel!=null)channel.postMessage(new WebMessage(payload));}catch(Exception e){android.util.Log.e("OmiComic","Reply failed",e);}});
    }catch(JSONException e){android.util.Log.e("OmiComic","Reply failed",e);}
  }
  private void choose(int id,boolean folder){
    if(pickerId!=-1){reply(id,null,"文件选择窗口已打开。");return;}
    pickerId=id;
    Intent intent=new Intent(folder?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    if(!folder){intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");}
    try{startActivityForResult(intent,folder?41:42);}catch(Exception e){pickerId=-1;reply(id,null,"无法打开系统文件选择器。");}
  }
  @Override protected void onActivityResult(int request,int result,Intent input){
    super.onActivityResult(request,result,input);
    if(request!=41&&request!=42)return;
    int id=pickerId;pickerId=-1;
    if(result!=RESULT_OK||input==null||input.getData()==null){reply(id,null,null);return;}
    Uri uri=input.getData();int flags=input.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    work.execute(()->{try{getContentResolver().takePersistableUriPermission(uri,flags);reply(id,library.addGrant(uri,request==41),null);}catch(Exception e){reply(id,null,explain(e));}});
  }
  private void event(String event){try{if(channel!=null)channel.postMessage(new WebMessage(new JSONObject().put("event",event).toString()));}catch(Exception ignored){}}
  @Override public void onBackPressed(){event("back");}
  @Override public boolean dispatchKeyEvent(KeyEvent key){
    int code=key.getKeyCode();
    if(code==KeyEvent.KEYCODE_VOLUME_UP||code==KeyEvent.KEYCODE_VOLUME_DOWN){
      if(key.getAction()==KeyEvent.ACTION_UP&&capturedVolumeKeys.remove(code))return true;
      if(key.getAction()==KeyEvent.ACTION_DOWN&&readerVolumeKeys&&hasWindowFocus()){
        capturedVolumeKeys.add(code);
        long now=android.os.SystemClock.uptimeMillis();
        if(key.getRepeatCount()==0||now-lastVolumeTurn>=220){lastVolumeTurn=now;event(code==KeyEvent.KEYCODE_VOLUME_UP?"volume-up":"volume-down");}
        return true;
      }
    }
    return super.dispatchKeyEvent(key);
  }
  @Override protected void onStart(){
    super.onStart();
    if(webStopped){resumeDrawGate.begin();web.onResume();webStopped=false;}
  }
  @Override protected void onResume(){super.onResume();sceneTransition.resume();event("app-resume");event("resume");resumeDrawGate.readyWhenWebIsReady();}
  @Override protected void onPause(){readerVolumeKeys=false;capturedVolumeKeys.clear();sceneTransition.pause();launchReveal.finish();event("app-pause");event("pause");resumeDrawGate.pause();super.onPause();}
  // onPause can run while the launcher is still animating the app window.
  // Suspend WebView only once it is invisible, keeping that outgoing frame.
  @Override protected void onStop(){web.onPause();webStopped=true;super.onStop();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(readerSurface!=null&&level>=android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW)readerSurface.trimMemory();}
  @Override protected void onDestroy(){if(channel!=null){channel.close();channel=null;}launchReveal.finish();resumeDrawGate.cancel();sceneTransition.cancel();readerSurface.close();covers.getQueue().clear();covers.shutdownNow();pageRequests.getQueue().clear();pageRequests.shutdownNow();openings.getQueue().clear();openings.shutdownNow();persistence.shutdown();work.getQueue().clear();work.execute(library::close);work.shutdown();web.destroy();super.onDestroy();}
}
