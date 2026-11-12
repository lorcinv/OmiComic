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
  private final ReaderWorkQueue catalogWork = new ReaderWorkQueue();
  private final ReaderWorkQueue work = new ReaderWorkQueue();
  private final ReaderWorkQueue covers = new ReaderWorkQueue();
  private final ReaderWorkQueue pageRequests = new ReaderWorkQueue();
  private final ReaderWorkQueue persistence = new ReaderWorkQueue();
  private final ReaderWorkQueue openings = new ReaderWorkQueue();
  private boolean readerVolumeKeys;
  private final Set<Integer> capturedVolumeKeys = new HashSet<>();
  private long lastVolumeTurn;
  private int pickerId = -1;
  private String pendingDataExport;
  private boolean fullscreen;
  private boolean readerChromeHidden;
  private boolean readerActive;
  private boolean epubViewportPrepared;
  private String epubViewportKey;
  private long epubViewportRequest;
  private boolean keyboardVisible;
  private int readerStatusInset=-1;
  private int readerSafeLeft,readerSafeTop,readerSafeRight,readerSafeBottom;
  private Boolean requestedStatusHidden,requestedNavigationHidden;
  private boolean systemThemeApplied;
  private final ArrayDeque<Intent> externalFiles = new ArrayDeque<>();

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    library = new LocalLibrary(this);
    FrameLayout frame = new FrameLayout(this);
    rootFrame = frame;
    LaunchReveal content=new LaunchReveal(this);
    launchReveal=content;
    readerSurface=new NativeReaderSurface(this,library);
    content.addView(readerSurface,new FrameLayout.LayoutParams(-1,-1));
    web = new WebView(this){
      @Override public boolean onKeyPreIme(int code,KeyEvent key){
        if(code==KeyEvent.KEYCODE_BACK&&keyboardVisible){
          if(key.getAction()==KeyEvent.ACTION_UP)MainActivity.this.onBackPressed();
          return true;
        }
        return super.onKeyPreIme(code,key);
      }
    };
    // Keep one compositor mode throughout navigation and background restore.
    // Root/theme surfaces paint the background; only the reader DOM is clear.
    web.setBackgroundColor(android.graphics.Color.TRANSPARENT);
    web.setVerticalScrollBarEnabled(false);
    web.setHorizontalScrollBarEnabled(false);
    content.addView(web, new FrameLayout.LayoutParams(-1,-1));
    // Only thumbnail pixels live above the WebView. This view is not clickable:
    // Omi's filmstrip still owns scrolling, selection, borders and captions.
    content.addView(readerSurface.previewOverlay(), new FrameLayout.LayoutParams(-1,-1));
    frame.addView(content,new FrameLayout.LayoutParams(-1,-1));
    sceneTransition=new SceneTransition(getWindow(),frame,content);
    resumeDrawGate=new ResumeDrawGate(getWindow(),frame,content,web);
    setContentView(frame);
    applySystemTheme(savedSystemTheme());
    if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    frame.setOnApplyWindowInsetsListener((v,insets)->{
        boolean visible=Build.VERSION.SDK_INT>=30?insets.isVisible(WindowInsets.Type.ime()):insets.getSystemWindowInsetBottom()>120*getResources().getDisplayMetrics().density;
        if(keyboardVisible&&!visible)event("keyboard-hidden");
        keyboardVisible=visible;
        int left=0,top=0,right=0,bottom,status;
        int cutoutLeft=0,cutoutTop=0,cutoutRight=0,cutoutBottom=0;
        boolean expandedCanvas=readerActive;
        if(Build.VERSION.SDK_INT>=30){
          android.graphics.Insets cutout=insets.getInsets(WindowInsets.Type.displayCutout());
          cutoutLeft=cutout.left;cutoutTop=cutout.top;cutoutRight=cutout.right;cutoutBottom=cutout.bottom;
          android.graphics.Insets safe=insets.getInsets((expandedCanvas?0:WindowInsets.Type.displayCutout())|WindowInsets.Type.ime()|(fullscreen?0:WindowInsets.Type.navigationBars()));
          left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
          status=insets.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars()).top;
        }else{
          bottom=fullscreen&&!visible?0:insets.getSystemWindowInsetBottom();status=insets.getStableInsetTop();
          if(!fullscreen){left=insets.getSystemWindowInsetLeft();right=insets.getSystemWindowInsetRight();}
          if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null){
            android.view.DisplayCutout cutout=insets.getDisplayCutout();
            cutoutLeft=cutout.getSafeInsetLeft();cutoutTop=cutout.getSafeInsetTop();cutoutRight=cutout.getSafeInsetRight();cutoutBottom=cutout.getSafeInsetBottom();
            if(!expandedCanvas){left=Math.max(left,cutoutLeft);top=cutoutTop;right=Math.max(right,cutoutRight);bottom=Math.max(bottom,cutoutBottom);}
          }
        }
        // A reader always keeps the same canvas, whether its controls/time bar
        // are shown or hidden. Only the toolbar needs the stable status inset.
        // Keep this canvas fixed through zoom and restore. The ordinary reader
        // fits pages inside CSS safe padding; enlarged pixels can cover it.
        // Controls retain safe edges, including a side camera after rotation.
        int toolbarInset=Math.max(0,Math.max(expandedCanvas?cutoutTop:0,fullscreen||tabletLandscape()?0:status)-top);
        int safeLeft=expandedCanvas?Math.max(0,cutoutLeft-left):0;
        int safeTop=expandedCanvas?Math.max(0,cutoutTop-top):0;
        int safeRight=expandedCanvas?Math.max(0,cutoutRight-right):0;
        int safeBottom=expandedCanvas?Math.max(0,cutoutBottom-bottom):0;
        if(readerStatusInset!=toolbarInset||readerSafeLeft!=safeLeft||readerSafeTop!=safeTop||readerSafeRight!=safeRight||readerSafeBottom!=safeBottom){
          readerStatusInset=toolbarInset;readerSafeLeft=safeLeft;readerSafeTop=safeTop;readerSafeRight=safeRight;readerSafeBottom=safeBottom;publishReaderStatusInset();
        }
        if(!readerActive&&!epubViewportPrepared&&!hideStatusBar())top=Math.max(top,status);
        if(v.getPaddingLeft()!=left||v.getPaddingTop()!=top||v.getPaddingRight()!=right||v.getPaddingBottom()!=bottom){
          v.setPadding(left,top,right,bottom);sceneTransition.insetsChanged();
        }
        return insets;
    });
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setTextZoom(100);
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
        Uri uri=request.getUrl();
        if(isApp(uri))return false;
        if(request.isForMainFrame()&&request.hasGesture()&&"https".equals(uri.getScheme())&&"github.com".equalsIgnoreCase(uri.getHost())&&("/lorcinv/OmiComic".equals(uri.getPath())||uri.getPath()!=null&&uri.getPath().startsWith("/lorcinv/OmiComic/releases/tag/"))) {
          try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); }
          catch(android.content.ActivityNotFoundException error) { android.widget.Toast.makeText(MainActivity.this,"No browser available",android.widget.Toast.LENGTH_SHORT).show(); }
        }
        return true;
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request) {
        Uri uri=request.getUrl();
        // Update metadata is the only remote resource the reader itself fetches.
        if("GET".equals(request.getMethod())&&"https".equals(uri.getScheme())&&"api.github.com".equalsIgnoreCase(uri.getHost())&&"/repos/lorcinv/OmiComic/releases".equals(uri.getPath())) return null;
        if(!isApp(uri)) return response("text/plain",new ByteArrayInputStream(new byte[0]),403,"Blocked");
        try {
          if(uri.getPath().startsWith("/media/")) return library.media(uri.getLastPathSegment());
          if(uri.getPath().startsWith("/documents/")) return library.documentRange(uri.getLastPathSegment(),Integer.parseInt(uri.getQueryParameter("begin")),Integer.parseInt(uri.getQueryParameter("end")));
          String file=uri.getPath().substring(1);
          if(file.isEmpty())file="index.html";
          if(file.contains("..")||file.contains("\\")) throw new IOException("Invalid asset");
          String mime=file.endsWith(".mjs")||file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":file.endsWith(".json")?"application/json":file.endsWith(".wasm")?"application/wasm":file.endsWith(".svg")?"image/svg+xml":file.endsWith(".webp")?"image/webp":"application/octet-stream";
          return response(mime,getAssets().open("web/"+file),200,"OK");
        } catch(Exception e) { android.util.Log.w("OmiComic","Local media could not be read",e);return response("text/plain",new ByteArrayInputStream(new byte[0]),404,"Not found"); }
      }
      @Override public void onPageFinished(WebView v,String url) {
        if(!url.equals("https://omi.local/index.html"))return;
        publishReaderStatusInset();
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
              if(method.equals("readerPrepare")){readerSurface.prepare(args,(value,error)->reply(id,value,error==null?null:explain(error),ReaderCancelledException.causedBy(error)?"READER_CANCELLED":null));return;}
              if(method.equals("readerStats")){reply(id,readerSurface.stats(),null);return;}
              if(method.equals("beginScene")){sceneTransition.begin(args.optLong("request"),args.optBoolean("coverRoot"),()->reply(id,true,null));return;}
              if(method.equals("readerIntent")){sceneTransition.readerIntent(args.optString("key"));if(id!=0)reply(id,true,null);return;}
              if(method.equals("cancelReaderIntent")){if(args.optString("key").equals(epubViewportKey))resetEpubReaderViewport();sceneTransition.cancelReaderIntent(args.optString("key"));if(id!=0)reply(id,true,null);return;}
              if(method.equals("prepareEpubReaderViewport")){prepareEpubReaderViewport(args.optString("key"),id);return;}
              if(method.equals("commitScene")){long request=args.optLong("request");String direction=args.optString("direction","forward");JSONObject origin=args.optJSONObject("origin");float scale=web.getWidth()/(float)args.optDouble("viewportWidth",web.getWidth());float x=origin==null?36:(float)origin.optDouble("x")*scale,y=origin==null?40:(float)origin.optDouble("y")*scale;web.postVisualStateCallback(request,new WebView.VisualStateCallback(){@Override public void onComplete(long ignored){readerSurface.afterFrameReady(()->FrameCommit.after(web,()->{sceneTransition.commit(request,direction,x,y);reply(id,true,null);}));}});return;}
              if(method.equals("cancelScene")){if(args.has("request"))sceneTransition.cancel(args.optLong("request"));else{resetEpubReaderViewport();sceneTransition.cancel();}if(id!=0)reply(id,true,null);return;}
              if(method.equals("waitScene")){sceneTransition.afterFinished(args.optLong("request"),()->reply(id,true,null));return;}
              if(method.equals("chooseFolder")||method.equals("chooseFile")){choose(id,method.equals("chooseFolder"));return;}
              if(method.equals("takeExternalFile")){
                final Intent incoming=externalFiles.pollFirst();
                if(incoming==null){reply(id,null,null);return;}
                // The frontend drains only after its reader and error handlers exist.
                work.execute(()->{try{reply(id,library.openExternalFile(ExternalFiles.uri(incoming),incoming.getType(),incoming.getFlags()),null);}catch(Exception e){reply(id,null,explain(e));}});
                return;
              }
              if(method.equals("exportBackupFile")||method.equals("readBackupFile")){chooseBackup(id,method.equals("exportBackupFile"),args);return;}
              if(method.equals("close")){reply(id,null,null);finish();return;}
              if(method.equals("background")){reply(id,null,null);moveTaskToBack(true);return;}
              if(method.equals("setColorTheme")){
                getPreferences(MODE_PRIVATE).edit().putBoolean("followSystemTheme",args.optBoolean("followSystemTheme")).putString("dayColorTheme",dayTheme(args.optString("dayColorTheme"))).apply();
                applySystemTheme(args.optString("theme"));reply(id,true,null);return;
              }
              if(method.equals("isSystemDark")){reply(id,isSystemDark(),null);return;}
              if(method.equals("setFullscreen")){
                fullscreen=args.optBoolean("enabled");
                applySystemBars();
                reply(id,fullscreen,null);return;
              }
              if(method.equals("setReaderChrome")){
                readerActive=args.optBoolean("active",true);readerChromeHidden=readerActive&&args.optBoolean("hidden");
                resetEpubReaderViewport();
                if(!readerActive||!sceneTransition.deferReaderBars(MainActivity.this::applySystemBars))applySystemBars();
                if(args.optBoolean("settle"))FrameCommit.after(rootFrame,()->web.postVisualStateCallback(id,new WebView.VisualStateCallback(){@Override public void onComplete(long ignored){reply(id,readerChromeHidden,null);}}));
                else reply(id,readerChromeHidden,null);return;
              }
              if(method.equals("isFullscreen")){reply(id,fullscreen,null);return;}
              if(method.equals("setReaderVolumeKeys")){readerVolumeKeys=args.optBoolean("enabled");reply(id,readerVolumeKeys,null);return;}
              if(method.equals("cancelLibraryScan")){library.cancelCatalog();return;}
              final JSONObject params=args;final long catalogRequestEpoch=library.catalogGeneration();
              int priority=method.equals("getThumbnail")||method.equals("getReadablePageCount")||method.equals("checkResourcePath")||method.equals("getBookmarkPagePreview")||(method.equals("openDocument")&&params.optString("purpose").equals("thumbnail"))?2:0;
              (method.equals("scanLibrary")?catalogWork:method.equals("saveData")||method.equals("backupData")||method.equals("importDataBackup")||method.equals("restoreDataBackup")?persistence:method.equals("getResourcePages")?openings:method.equals("getThumbnail")?covers:method.equals("getPageImage")?pageRequests:work).execute(priority,()->{try{if(method.equals("scanLibrary")&&catalogRequestEpoch!=library.catalogGeneration())throw new InterruptedIOException("资源库扫描已取消。");reply(id,library.call(method,params),null);}catch(Exception e){reply(id,null,explain(e));}});
            }catch(Exception e){android.util.Log.e("OmiComic","Invalid request",e);}
          }
        });
        web.postWebMessage(new WebMessage("omi-native",new WebMessagePort[]{ports[1]}),Uri.parse("https://omi.local"));
      }
    });
    web.post(this::applySystemBars);
    web.loadUrl("https://omi.local/index.html");
    receiveExternalFile(getIntent());
  }

  @Override protected void onNewIntent(Intent intent){
    super.onNewIntent(intent);setIntent(intent);receiveExternalFile(intent);
  }
  private void receiveExternalFile(Intent intent){
    if(ExternalFiles.uri(intent)==null)return;
    if(externalFiles.size()>=16){Toast.makeText(this,"待打开的文件过多，请稍后重试。",Toast.LENGTH_SHORT).show();return;}
    externalFiles.addLast(new Intent(intent));event("external-open");
  }

  private boolean tabletLandscape(){
    android.content.res.Configuration config=getResources().getConfiguration();
    return config.smallestScreenWidthDp>=600&&config.orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE;
  }
  private boolean hideStatusBar(){return fullscreen||readerChromeHidden||tabletLandscape();}
  private void resetEpubReaderViewport(){
    epubViewportRequest++;epubViewportKey=null;
    if(epubViewportPrepared){epubViewportPrepared=false;rootFrame.requestApplyInsets();}
  }
  private void prepareEpubReaderViewport(String key,int id){
    final long request=++epubViewportRequest;
    final java.util.concurrent.atomic.AtomicBoolean replied=new java.util.concurrent.atomic.AtomicBoolean();
    final java.util.function.Consumer<Boolean> finish=ready->{if(replied.compareAndSet(false,true))reply(id,ready&&request==epubViewportRequest,null);};
    // An optional layout handshake must never hold a book behind an old frame.
    web.postDelayed(()->finish.accept(false),100);
    sceneTransition.afterReaderCapture(key,covered->{
      if(replied.get()||!covered||readerActive||request!=epubViewportRequest){finish.accept(false);return;}
      epubViewportKey=key;epubViewportPrepared=true;
      boolean alreadyFull=rootFrame.getPaddingTop()==0||readerStatusInset<=0;
      rootFrame.requestApplyInsets();
      if(alreadyFull){finish.accept(true);return;}
      // The library remains covered at its original coordinates. Settle EPUB's
      // final viewport before parsing/layout; the system time bar stays visible.
      FrameCommit.after(rootFrame,()->web.postVisualStateCallback(id,new WebView.VisualStateCallback(){@Override public void onComplete(long ignored){finish.accept(true);}}));
    });
  }
  private void publishReaderStatusInset(){
    if(web==null)return;
    float density=getResources().getDisplayMetrics().density;
    web.evaluateJavascript("(()=>{const s=document.documentElement.style;s.setProperty('--android-reader-status-inset','"+(Math.max(0,readerStatusInset)/density)+"px');s.setProperty('--android-reader-safe-left','"+(readerSafeLeft/density)+"px');s.setProperty('--android-reader-safe-top','"+(readerSafeTop/density)+"px');s.setProperty('--android-reader-safe-right','"+(readerSafeRight/density)+"px');s.setProperty('--android-reader-safe-bottom','"+(readerSafeBottom/density)+"px');})()",null);
  }
  private void applySystemBars(){
    if(web==null)return;
    if(Build.VERSION.SDK_INT>=28){
      WindowManager.LayoutParams attributes=getWindow().getAttributes();
      int cutoutMode=readerActive&&Build.VERSION.SDK_INT>=30?WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS:WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      if(attributes.layoutInDisplayCutoutMode!=cutoutMode){attributes.layoutInDisplayCutoutMode=cutoutMode;getWindow().setAttributes(attributes);}
    }
    boolean hideStatus=hideStatusBar();
    if(Build.VERSION.SDK_INT>=30){
      android.view.WindowInsetsController controller=getWindow().getInsetsController();
      if(controller!=null){
        controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if(requestedStatusHidden==null||requestedStatusHidden!=hideStatus){
          if(hideStatus)controller.hide(WindowInsets.Type.statusBars());else controller.show(WindowInsets.Type.statusBars());
          requestedStatusHidden=hideStatus;
        }
        if(requestedNavigationHidden==null||requestedNavigationHidden!=fullscreen){
          if(fullscreen)controller.hide(WindowInsets.Type.navigationBars());else controller.show(WindowInsets.Type.navigationBars());
          requestedNavigationHidden=fullscreen;
        }
      }
      rootFrame.requestApplyInsets();
    }else{
      int flags=View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
      if(hideStatus)flags|=View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
      if(fullscreen)flags|=View.SYSTEM_UI_FLAG_HIDE_NAVIGATION;
      if(!systemTheme.equals("night"))flags|=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      if(web.getSystemUiVisibility()!=flags)web.setSystemUiVisibility(flags);
      rootFrame.requestApplyInsets();
    }
  }
  @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);refreshSystemTheme();event("system-theme-changed");applySystemBars();}
  @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)applySystemBars();}

  private boolean isSystemDark(){return (getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;}
  private String dayTheme(String theme){return Arrays.asList("mist","nord","sand").contains(theme)?theme:"mist";}
  private String savedSystemTheme(){
    android.content.SharedPreferences saved=getPreferences(MODE_PRIVATE);
    return saved.getBoolean("followSystemTheme",false)?isSystemDark()?"night":dayTheme(saved.getString("dayColorTheme","mist")):saved.getString("colorTheme","mist");
  }
  private void refreshSystemTheme(){if(getPreferences(MODE_PRIVATE).getBoolean("followSystemTheme",false))applySystemTheme(savedSystemTheme());}
  private void applySystemTheme(String requested) {
    String theme = Arrays.asList("mist", "nord", "sand", "night").contains(requested) ? requested : "mist";
    if(systemThemeApplied&&systemTheme.equals(theme))return;
    systemThemeApplied=true;
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
    reply(id,data,error,null);
  }
  private void reply(int id,Object data,String error,String code){
    try{JSONObject m=new JSONObject().put("id",id);if(error==null)m.put("data",data==null?JSONObject.NULL:data);else m.put("error",error);
      if(code!=null)m.put("errorCode",code);
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
  private void chooseBackup(int id,boolean exporting,JSONObject args){
    if(pickerId!=-1){reply(id,null,"文件选择窗口已打开。");return;}
    pickerId=id;
    pendingDataExport=exporting?args.optString("text"):null;
    Intent intent=new Intent(exporting?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");
    if(exporting)intent.putExtra(Intent.EXTRA_TITLE,args.optString("filename","OmiComic-Data-android.json"));
    try{startActivityForResult(intent,exporting?44:43);}catch(Exception e){pickerId=-1;pendingDataExport=null;reply(id,null,"无法打开系统文件选择器。");}
  }
  @Override protected void onActivityResult(int request,int result,Intent input){
    super.onActivityResult(request,result,input);
    if(request==43||request==44){
      int id=pickerId;pickerId=-1;final String payload=pendingDataExport;pendingDataExport=null;
      if(result!=RESULT_OK||input==null||input.getData()==null){reply(id,null,null);return;}
      final Uri uri=input.getData();
      work.execute(()->{try{if(request==44){DataBackupFiles.write(getContentResolver(),uri,payload);reply(id,uri.toString(),null);}else reply(id,DataBackupFiles.read(getContentResolver(),uri),null);}catch(Exception e){reply(id,null,explain(e));}});
      return;
    }
    if(request!=41&&request!=42)return;
    int id=pickerId;pickerId=-1;
    if(result!=RESULT_OK||input==null||input.getData()==null){reply(id,null,null);return;}
    Uri uri=input.getData();int flags=input.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    work.execute(()->{try{getContentResolver().takePersistableUriPermission(uri,flags);reply(id,library.addGrant(uri,request==41),null);}catch(Exception e){reply(id,null,explain(e));}});
  }
  private void event(String event){try{if(channel!=null)channel.postMessage(new WebMessage(new JSONObject().put("event",event).toString()));}catch(Exception ignored){}}
  @Override public void onBackPressed(){
    if(keyboardVisible){
      web.evaluateJavascript("document.documentElement.dataset.randomBrowse === 'on'",value->{
        if("true".equals(value))event("back");
        else ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0);
      });
      return;
    }
    event("back");
  }
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
  @Override protected void onResume(){super.onResume();refreshSystemTheme();library.pauseCatalog(false);sceneTransition.resume();event("app-resume");event("resume");resumeDrawGate.readyWhenWebIsReady();}
  @Override protected void onPause(){resetEpubReaderViewport();library.pauseCatalog(true);readerVolumeKeys=false;capturedVolumeKeys.clear();sceneTransition.pause();launchReveal.finish();event("app-pause");event("pause");resumeDrawGate.pause();super.onPause();}
  // onPause can run while the launcher is still animating the app window.
  // Suspend WebView only once it is invisible, keeping that outgoing frame.
  @Override protected void onStop(){web.onPause();webStopped=true;super.onStop();}
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(readerSurface!=null&&level>=android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW)readerSurface.trimMemory();}
  @Override protected void onDestroy(){if(channel!=null){channel.close();channel=null;}launchReveal.finish();resumeDrawGate.cancel();sceneTransition.cancel();readerSurface.close();covers.getQueue().clear();covers.shutdownNow();pageRequests.getQueue().clear();pageRequests.shutdownNow();openings.getQueue().clear();openings.shutdownNow();persistence.shutdown();work.getQueue().clear();work.execute(library::close);work.shutdown();library.cancelCatalog();catalogWork.getQueue().clear();catalogWork.shutdownNow();web.destroy();super.onDestroy();}
}
