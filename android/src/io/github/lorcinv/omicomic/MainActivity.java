package io.github.lorcinv.omicomic;

import android.app.Activity;
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
  private WebMessagePort channel;
  private LocalLibrary library;
  private final ExecutorService work = Executors.newSingleThreadExecutor();
  private int pickerId = -1;
  private boolean fullscreen;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    library = new LocalLibrary(this);
    FrameLayout frame = new FrameLayout(this);
    web = new WebView(this);
    web.setBackgroundColor(0xffe9ebee);
    frame.addView(web, new FrameLayout.LayoutParams(-1,-1));
    setContentView(frame);
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      frame.setOnApplyWindowInsetsListener((v,insets)->{
        android.graphics.Insets padding = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
        v.setPadding(padding.left,padding.top,padding.right,padding.bottom); return insets;
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
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { return !isApp(request.getUrl()); }
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
        } catch(Exception e) { return response("text/plain",new ByteArrayInputStream(new byte[0]),404,"Not found"); }
      }
      @Override public void onPageFinished(WebView v,String url) {
        if(!url.equals("https://omi.local/index.html"))return;
        if(channel!=null)channel.close();
        WebMessagePort[] ports=web.createWebMessageChannel();channel=ports[0];
        channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){
          @Override public void onMessage(WebMessagePort port,WebMessage msg){
            try {
              JSONObject input=new JSONObject(msg.getData());
              int id=input.getInt("id"); String method=input.getString("method");JSONObject args=input.optJSONObject("args");
              if(args==null)args=new JSONObject();
              if(method.equals("chooseFolder")||method.equals("chooseFile")){choose(id,method.equals("chooseFolder"));return;}
              if(method.equals("close")){reply(id,null,null);finish();return;}
              if(method.equals("background")){reply(id,null,null);moveTaskToBack(true);return;}
              if(method.equals("setFullscreen")){
                fullscreen=args.optBoolean("enabled");
                if(Build.VERSION.SDK_INT>=30){if(fullscreen)web.getWindowInsetsController().hide(WindowInsets.Type.systemBars());else web.getWindowInsetsController().show(WindowInsets.Type.systemBars());}
                else web.setSystemUiVisibility(fullscreen?5894:0);
                reply(id,fullscreen,null);return;
              }
              if(method.equals("isFullscreen")){reply(id,fullscreen,null);return;}
              final JSONObject params=args;
              work.execute(()->{try{reply(id,library.call(method,params),null);}catch(Exception e){reply(id,null,explain(e));}});
            }catch(Exception e){android.util.Log.e("OmiComic","Invalid request",e);}
          }
        });
        web.postWebMessage(new WebMessage("omi-native",new WebMessagePort[]{ports[1]}),Uri.parse("https://omi.local"));
      }
    });
    web.loadUrl("https://omi.local/index.html");
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
    runOnUiThread(()->{try{JSONObject m=new JSONObject().put("id",id);if(error==null)m.put("data",data==null?JSONObject.NULL:data);else m.put("error",error);if(channel!=null)channel.postMessage(new WebMessage(m.toString()));}catch(Exception e){android.util.Log.e("OmiComic","Reply failed",e);}});
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
  @Override protected void onPause(){event("pause");super.onPause();}
  @Override protected void onDestroy(){if(channel!=null)channel.close();work.execute(library::close);work.shutdown();web.destroy();super.onDestroy();}
}
