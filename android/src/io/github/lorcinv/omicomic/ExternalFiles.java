package io.github.lorcinv.omicomic;

import android.content.Intent;
import android.net.Uri;
import java.util.Locale;

/** Only local, explicitly supplied files enter the external-open queue. */
final class ExternalFiles {
  static Uri uri(Intent intent){
    if(intent==null)return null;
    Uri uri=null;
    if(Intent.ACTION_VIEW.equals(intent.getAction()))uri=intent.getData();
    else if(Intent.ACTION_SEND.equals(intent.getAction())){
      try{Object stream=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(stream instanceof Uri)uri=(Uri)stream;}catch(RuntimeException ignored){}
      if(uri==null&&intent.getClipData()!=null&&intent.getClipData().getItemCount()>0)uri=intent.getClipData().getItemAt(0).getUri();
    }
    return uri!=null&&("content".equals(uri.getScheme())||"file".equals(uri.getScheme()))?uri:null;
  }
  static String extension(String mime){
    if(mime==null)return "";
    switch(mime.toLowerCase(Locale.ROOT).split(";",2)[0].trim()){
      case "image/jpeg":return "jpg";case "image/png":return "png";case "image/webp":return "webp";
      case "image/gif":return "gif";case "image/bmp":return "bmp";
      case "application/pdf":return "pdf";case "application/epub+zip":return "epub";
      case "application/x-mobi":case "application/x-mobipocket-ebook":return "mobi";
      case "application/zip":case "application/x-zip":case "application/x-zip-compressed":case "application/x-cbz":case "application/vnd.comicbook+zip":return "cbz";
      case "application/x-rar":case "application/x-rar-compressed":case "application/vnd.rar":case "application/x-cbr":case "application/vnd.comicbook-rar":return "cbr";
      case "application/x-7z-compressed":case "application/x-cb7":return "cb7";
      default:return "";
    }
  }
  static boolean supported(String name){return name!=null&&name.toLowerCase(Locale.ROOT).matches(".+\\.(jpg|jpeg|png|webp|gif|bmp|zip|cbz|rar|cbr|7z|cb7|pdf|epub|mobi)");}
  static String name(String name,String mime){
    String safe=name==null?"":name.replace('/','_').replace('\\','_').replace('\0','_').trim();
    if(safe.isEmpty()||safe.equals(".")||safe.equals(".."))safe="打开的文件";
    String extension=extension(mime);
    if(!supported(safe)&&!extension.isEmpty())safe+="."+extension;
    return safe;
  }
}
