package io.github.lorcinv.omicomic.test;

import android.content.*;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import org.json.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;

/** Calls the shipped LocalLibrary; all injection and fixture code lives in the test APK. */
final class CatalogChecks {
  private final Object library;
  private final ContentResolver resolver;
  private final Method call;
  private final Uri endpoint=Uri.parse("content://"+CatalogProvider.AUTHORITY);
  CatalogChecks(Object target,Context context)throws Exception{library=target;resolver=context.getContentResolver();call=library.getClass().getDeclaredMethod("call",String.class,JSONObject.class);call.setAccessible(true);}
  private Object field(String name)throws Exception{Field f=library.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(library);}
  private Object invoke(String name,Class<?>[] types,Object...args)throws Exception{Method m=library.getClass().getDeclaredMethod(name,types);m.setAccessible(true);try{return m.invoke(library,args);}catch(InvocationTargetException error){throw (Exception)error.getCause();}}
  private JSONObject request(String method,JSONObject input)throws Exception{try{return (JSONObject)call.invoke(library,method,input);}catch(InvocationTargetException error){throw (Exception)error.getCause();}}
  private JSONObject list(String path)throws Exception{return request("listDirectory",new JSONObject().put("path",path));}
  private Bundle control(String method){return resolver.call(endpoint,method,null,null);}
  private void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  private void clearHot()throws Exception{
    ((ExecutorService)field("indexWrites")).submit(()->{}).get(5,TimeUnit.SECONDS);
    synchronized(field("metadataLock")){for(String name:new String[]{"entries","directories","directoryTimes"})((Map<?,?>)field(name)).clear();}
  }
  JSONObject run()throws Exception{
    control("reset");String root=(String)invoke("addGrant",new Class<?>[]{Uri.class,boolean.class},DocumentsContract.buildTreeDocumentUri(CatalogProvider.AUTHORITY,"root"),true);
    ExecutorService worker=Executors.newSingleThreadExecutor();
    try{
      String deep=root+"/Branch/Deep";list(deep);clearHot();
      int before=control("state").getInt("children");long beforeHits=(Long)field("directoryIndexHits");list(deep);
      check(control("state").getInt("children")==before&&(Long)field("directoryIndexHits")>beforeHits,"Version key differs between normal listing and persisted snapshot");
      list(root+"/Zero");clearHot();control("extra");before=control("state").getInt("children");JSONObject zero=list(root+"/Zero");
      check(zero.getJSONArray("items").length()==2&&control("state").getInt("children")>before,"Zero mtime reused an unverifiable snapshot");
      SystemClock.sleep(300);JSONObject full=request("scanLibrary",new JSONObject().put("path",root).put("refresh",true));check(full.getInt("skipped")==0,"Initial fixture scan failed");
      clearHot();before=control("state").getInt("children");long beforeUri=(Long)field("uriIndexHits");JSONObject pages=request("getResourcePages",new JSONObject().put("path",deep+"/Stable.cbr"));
      check(pages.getInt("total")>0&&control("state").getInt("children")==before&&(Long)field("uriIndexHits")>beforeUri,"Deep open did not reuse catalog URI");
      SystemClock.sleep(300);control("slow");
      Future<JSONObject> scan=worker.submit(()->request("scanLibrary",new JSONObject().put("path",root).put("refresh",true)));
      long deadline=SystemClock.uptimeMillis()+3000;while(!control("state").getBoolean("started")){if(SystemClock.uptimeMillis()>deadline)throw new AssertionError("Slow query never began");SystemClock.sleep(5);}
      long start=SystemClock.uptimeMillis();JSONObject renamed=request("changeLocalResource",new JSONObject().put("path",deep+"/Stable.cbr").put("action","rename").put("name","Renamed.cbr"));long renameMs=SystemClock.uptimeMillis()-start;
      control("release");JSONObject completed=scan.get(10,TimeUnit.SECONDS);
      check(renameMs<1000&&control("state").getInt("canceled")>0,"Slow scanner blocked foreground rename or ignored CancellationSignal");
      check(renamed.getString("newPath").equals(deep+"/Renamed.cbr")&&completed.getInt("skipped")==0,"Rename/canceled scan lost data");
      boolean found=false,stale=false;JSONArray rows=completed.getJSONArray("items");for(int i=0;i<rows.length();i++){String path=rows.getJSONObject(i).getString("path");found|=path.endsWith("/Renamed.cbr");stale|=path.endsWith("/Stable.cbr");}
      check(found&&!stale,"Catalog retained the old filename after concurrent rename");
      invoke("pauseCatalog",new Class<?>[]{boolean.class},true);before=control("state").getInt("children");JSONObject paused=request("scanLibrary",new JSONObject().put("path",root).put("refresh",true).put("incremental",true).put("restart",true));
      check(paused.getBoolean("yielded")&&control("state").getInt("children")==before,"Paused activity still scanned provider");
      invoke("pauseCatalog",new Class<?>[]{boolean.class},false);SystemClock.sleep(300);JSONObject resumed=request("scanLibrary",new JSONObject().put("path",root).put("refresh",true).put("incremental",true));check(resumed.getJSONArray("items").length()>0,"Resume did not continue pending work");
      clearHot();resolver.call(endpoint,"deny","true",null);boolean rejected=false;try{list(root);}catch(SecurityException expected){rejected=true;}check(rejected,"Provider permission failure was hidden by disk cache");resolver.call(endpoint,"deny","false",null);
      ((SharedPreferences)field("grants")).edit().remove(root).commit();rejected=false;try{request("scanLibrary",new JSONObject().put("path",root).put("incremental",true));}catch(SecurityException expected){rejected=true;}check(rejected,"Removed grant still admitted cached scan");
      return new JSONObject().put("directoryDiskVersionShared",true).put("zeroMtimeFreshChildren",zero.getJSONArray("items").length()).put("deepOpenUsedCatalogUri",true).put("slowQueryCanceled",true).put("providerCancellations",control("state").getInt("canceled")).put("foregroundRenameMs",renameMs).put("renamedInventoryCoherent",true).put("pauseStopsQueries",true).put("resumeContinues",true).put("providerDenialRejected",true).put("removedGrantRejected",true);
    }finally{control("release");resolver.call(endpoint,"deny","false",null);invoke("pauseCatalog",new Class<?>[]{boolean.class},false);((SharedPreferences)field("grants")).edit().remove(root).commit();worker.shutdownNow();}
  }
}
