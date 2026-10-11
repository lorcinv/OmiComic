package io.github.lorcinv.omicomic;

import android.content.*;
import android.database.Cursor;
import android.graphics.*;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.WebResourceResponse;
import org.json.*;
import org.xmlpull.v1.XmlPullParser;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

final class LocalLibrary {
  private final Context context;
  private final ContentResolver resolver;
  private final SharedPreferences grants;
  private final AtomicFile dataFile;
  private final File cache;
  private final Map<String,File> localCopies=new LinkedHashMap<>();
  private final Map<String,Doc> documents=new HashMap<>();
  private final Map<String,Media> media=new LinkedHashMap<>();
  private final NativeArchives nativeArchives=new NativeArchives();
  private static final long MAX_FILE=1024L*1024*1024,MAX_IMAGE=64L*1024*1024;
  private static final String[] COLUMNS={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED};
  private static final class Entry {String name,path,mime;Uri uri;long size,modified;boolean directory;}
  private static final class Media {String path,inner;boolean preview;Media(String p,String i,boolean t){path=p;inner=i;preview=t;}}
  private static final class Doc {String path;File file;List<String> chapters=new ArrayList<>();}

  LocalLibrary(Context context){this.context=context;resolver=context.getContentResolver();grants=context.getSharedPreferences("omi-grants",0);dataFile=new AtomicFile(new File(context.getFilesDir(),"omicomic-data.json"));cache=new File(context.getCacheDir(),"reader");cache.mkdirs();for(File f:Objects.requireNonNull(cache.listFiles()))f.delete();}
  synchronized String addGrant(Uri uri,boolean tree)throws Exception{
    String key=hash(uri.toString()).substring(0,16);
    Uri document=tree?DocumentsContract.buildDocumentUriUsingTree(uri,DocumentsContract.getTreeDocumentId(uri)):uri;
    Entry root=stat(document,"/");
    String path="/local/"+key+"/"+root.name.replace('/','_');
    if(!grants.edit().putString(path,new JSONObject().put("uri",uri.toString()).put("tree",tree).toString()).commit())throw new IOException("目录授权保存失败。");
    return path;
  }
  private String root(String path)throws Exception{
    for(String key:grants.getAll().keySet())if(path.equals(key)||path.startsWith(key+"/"))return key;
    throw new SecurityException("No grant");
  }
  private Entry resolve(String path)throws Exception{
    if(path==null||path.contains("/../")||path.endsWith("/..")||path.contains("\\"))throw new SecurityException("Invalid path");
    String root=root(path);JSONObject grant=new JSONObject(grants.getString(root,"{}"));Uri uri=Uri.parse(grant.getString("uri"));
    boolean tree=grant.getBoolean("tree");if(tree)uri=DocumentsContract.buildDocumentUriUsingTree(uri,DocumentsContract.getTreeDocumentId(uri));
    if(!path.equals(root)){
      if(!tree)throw new SecurityException("Only this file is authorized");
      for(String part:path.substring(root.length()+1).split("/")){
        if(part.isEmpty()||part.equals(".")||part.equals(".."))throw new SecurityException("Invalid child");
        Uri found=null;
        for(Entry entry:children(uri,""))if(entry.name.equals(part)){found=entry.uri;break;}
        if(found==null)throw new FileNotFoundException(path);uri=found;
      }
    }
    return stat(uri,path);
  }
  private Entry stat(Uri uri,String path)throws Exception{
    try(Cursor c=resolver.query(uri,COLUMNS,null,null,null)){if(c==null||!c.moveToFirst())throw new FileNotFoundException();return entry(c,uri,path);}
  }
  private Entry entry(Cursor c,Uri uri,String path){
    Entry e=new Entry();e.uri=uri;e.path=path;e.name=c.getString(1);e.mime=c.getString(2);e.size=c.getLong(3);e.modified=c.getLong(4);e.directory=DocumentsContract.Document.MIME_TYPE_DIR.equals(e.mime);return e;
  }
  private List<Entry> children(Uri uri,String path)throws Exception{
    List<Entry> entries=new ArrayList<>();Uri child=DocumentsContract.buildChildDocumentsUriUsingTree(uri,DocumentsContract.getDocumentId(uri));
    try(Cursor c=resolver.query(child,COLUMNS,null,null,null)){
      if(c==null)throw new IOException("目录读取失败。");
      while(c.moveToNext()){
        if(entries.size()>=30000)throw new IOException("目录内容过多，请选择较小的子目录。");
        String name=c.getString(1);if(name==null||name.contains("/")||name.equals(".")||name.equals(".."))continue;
        entries.add(entry(c,DocumentsContract.buildDocumentUriUsingTree(uri,c.getString(0)),path+"/"+name));
      }
    }
    entries.sort((a,b)->natural(a.name,b.name));return entries;
  }
  static int natural(String a,String b){
    int i=0,j=0;
    while(i<a.length()&&j<b.length()){
      char x=a.charAt(i),y=b.charAt(j);
      if(Character.isDigit(x)&&Character.isDigit(y)){
        int ia=i,jb=j;while(i<a.length()&&Character.isDigit(a.charAt(i)))i++;while(j<b.length()&&Character.isDigit(b.charAt(j)))j++;
        String na=a.substring(ia,i).replaceFirst("^0+(?!$)",""),nb=b.substring(jb,j).replaceFirst("^0+(?!$)","");
        int c=Integer.compare(na.length(),nb.length());if(c==0)c=na.compareTo(nb);if(c!=0)return c;
      }else{int c=Character.compare(Character.toLowerCase(x),Character.toLowerCase(y));if(c!=0)return c;i++;j++;}
    }
    return Integer.compare(a.length(),b.length());
  }
  private String extension(String name){int i=name.lastIndexOf('.');return i<0?"":name.substring(i+1).toLowerCase(Locale.ROOT);}
  private boolean image(String name){return Arrays.asList("jpg","jpeg","png","webp","gif","bmp").contains(extension(name));}
  private String type(Entry e){if(e.directory)return "folder";String ext=extension(e.name);if(image(e.name))return "image";if(ext.equals("pdf")||ext.equals("epub"))return ext;if(Arrays.asList("zip","cbz","rar","cbr","7z","cb7").contains(ext))return "archive";return "unknown";}
  private JSONObject item(Entry e)throws Exception{return new JSONObject().put("id",e.path).put("path",e.path).put("name",e.name).put("type",type(e)).put("extension",extension(e.name)).put("size",e.size).put("modifiedAt",e.modified);}
  private JSONObject directory(String path)throws Exception{
    Entry e=resolve(path);if(!e.directory)throw new IOException("这不是一个目录。");JSONArray items=new JSONArray();
    for(Entry child:children(e.uri,path))if(!type(child).equals("unknown"))items.put(item(child));
    return new JSONObject().put("path",path).put("parentPath",path.equals(root(path))?JSONObject.NULL:parent(path)).put("items",items).put("total",items.length());
  }
  private String parent(String path){return path.substring(0,path.lastIndexOf('/'));}
  private File localFile(String path)throws Exception{
    Entry e=resolve(path);if(e.size>MAX_FILE)throw new IOException("手机端单个文档或压缩包最大支持 1 GB。");
    String key=path+":"+e.size+":"+e.modified;
    File old=localCopies.get(key);if(old!=null&&old.exists())return old;
    File target=new File(cache,hash(key));File partial=new File(cache,target.getName()+".part");
    try(InputStream in=resolver.openInputStream(e.uri);OutputStream out=new FileOutputStream(partial)){copy(in,out,MAX_FILE);}
    catch(Exception ex){partial.delete();throw ex;}
    if(!partial.renameTo(target))throw new IOException("本地读取缓存保存失败。");
    localCopies.put(key,target);
    long total=0;for(File file:localCopies.values())total+=file.length();
    Iterator<Map.Entry<String,File>> it=localCopies.entrySet().iterator();
    while(it.hasNext()&&(total>1536L*1024*1024||localCopies.size()>3)){
      File file=it.next().getValue();if(file.equals(target)||documents.values().stream().anyMatch(d->d.file.equals(file)))continue;
      total-=file.length();nativeArchives.forget(file);file.delete();it.remove();
    }
    return target;
  }
  static void copy(InputStream in,OutputStream out,long limit)throws IOException{
    if(in==null)throw new FileNotFoundException();byte[] buffer=new byte[65536];long total=0;int n;
    while((n=in.read(buffer))!=-1){total+=n;if(total>limit)throw new IOException("文件内容超过手机端读取上限。");out.write(buffer,0,n);}
  }
  private byte[] bytes(InputStream in,long limit)throws IOException{try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){copy(stream,out,limit);return out.toByteArray();}}
  private List<String> archiveImages(String path)throws Exception{
    if(Arrays.asList("rar","cbr","7z","cb7").contains(extension(path)))return nativeArchives.images(localFile(path));
    List<String> names=new ArrayList<>();try(ZipFile zip=new ZipFile(localFile(path))){Enumeration<? extends ZipEntry> it=zip.entries();int count=0;while(it.hasMoreElements()){
      ZipEntry e=it.nextElement();if(++count>30000)throw new IOException("压缩包条目过多。");
      if(!e.isDirectory()&&image(e.getName())&&!e.getName().startsWith("__MACOSX/")&&e.getSize()<=MAX_IMAGE)names.add(e.getName());
    }}names.sort(LocalLibrary::natural);return names;
  }
  private JSONObject pages(String path)throws Exception{
    Entry e=resolve(path);String type=type(e),source=path,title=e.name;JSONArray pages=new JSONArray();String key;
    if(type.equals("folder")||type.equals("image")){
      List<Entry> entries;
      if(type.equals("image")&&path.equals(root(path)))entries=Collections.singletonList(e);
      else{String dir=type.equals("folder")?path:parent(path);Entry d=resolve(dir);entries=children(d.uri,dir);title=d.name;}
      for(Entry page:entries)if(image(page.name)&&!page.directory)pages.put(new JSONObject().put("index",pages.length()).put("name",page.name).put("sourcePath",page.path).put("type","folder-image"));
      key="folder:"+(type.equals("folder")?path:parent(path));
    }else if(type.equals("archive")){
      for(String name:archiveImages(path))pages.put(new JSONObject().put("index",pages.length()).put("name",name).put("sourcePath",path).put("archiveInnerPath",name).put("type","archive-image"));key="archive:"+path;
    }else if(type.equals("pdf")||type.equals("epub"))key=type+":"+path;
    else throw new IOException("不支持此文件格式。");
    if(pages.length()==0&&!type.equals("pdf")&&!type.equals("epub"))throw new IOException("NO_IMAGES:未在该文件夹中找到可阅读图片。");
    return new JSONObject().put("key",key).put("resourceKey",key).put("title",title).put("sourcePath",source).put("sourceType",type).put("pages",pages).put("total",pages.length());
  }
  private String registerMedia(String path,String inner,boolean preview)throws Exception{
    resolve(path);String key=hash(path+"\n"+inner+"\n"+preview);
    synchronized(media){media.put(key,new Media(path,inner,preview));while(media.size()>1200)media.remove(media.keySet().iterator().next());}
    return "https://omi.local/media/"+key;
  }
  WebResourceResponse media(String key)throws Exception{
    Media m;synchronized(media){m=media.get(key);}if(m==null)throw new FileNotFoundException();
    byte[] bytes;
    synchronized(this){
      if(m.inner!=null&&Arrays.asList("rar","cbr","7z","cb7").contains(extension(m.path)))bytes=nativeArchives.read(localFile(m.path),m.inner);
      else if(m.inner!=null){try(ZipFile zip=new ZipFile(localFile(m.path))){ZipEntry e=zip.getEntry(m.inner);if(e==null||e.getSize()>MAX_IMAGE)throw new IOException("图片过大或已不存在。");bytes=bytes(zip.getInputStream(e),MAX_IMAGE);}}
      else{Entry e=resolve(m.path);if(!image(e.name))throw new SecurityException();bytes=bytes(resolver.openInputStream(e.uri),MAX_IMAGE);}
    }
    BitmapFactory.Options size=new BitmapFactory.Options();size.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,size);
    if(size.outWidth<=0||size.outHeight<=0||(long)size.outWidth*size.outHeight>100_000_000L)throw new IOException("图片尺寸超出上限。");
    String mime=size.outMimeType;
    if(m.preview){BitmapFactory.Options opts=new BitmapFactory.Options();while(Math.max(size.outWidth,size.outHeight)/(opts.inSampleSize==0?1:opts.inSampleSize)>720)opts.inSampleSize=opts.inSampleSize<1?2:opts.inSampleSize*2;Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);if(bitmap==null)throw new IOException("图片解码失败。");ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,82,out);bitmap.recycle();bytes=out.toByteArray();mime="image/jpeg";}
    return MainActivity.response(mime,new ByteArrayInputStream(bytes),200,"OK");
  }
  private JSONObject pageImage(JSONObject input)throws Exception{return new JSONObject().put("url",registerMedia(input.getString("sourcePath"),input.optString("archiveInnerPath",null),input.optBoolean("preview")));}
  private JSONObject thumbnail(JSONObject input)throws Exception{
    String path=input.getString("path");Entry e=resolve(path);String type=type(e),inner=null;
    if(type.equals("pdf")||type.equals("epub")||type.equals("unknown"))return new JSONObject().put("url",JSONObject.NULL);
    if(type.equals("folder")){boolean found=false;for(Entry child:children(e.uri,path))if(image(child.name)&&!child.directory){path=child.path;found=true;break;}if(!found)return new JSONObject().put("url",JSONObject.NULL);}
    if(type.equals("archive")){List<String> names=archiveImages(path);if(names.isEmpty())return new JSONObject().put("url",JSONObject.NULL);inner=names.get(0);}
    return new JSONObject().put("url",registerMedia(path,inner,true));
  }
  private JSONObject change(JSONObject input)throws Exception{
    String path=input.getString("path"),action=input.getString("action");Entry e=resolve(path);
    if(e.directory&&path.equals(root(path)))throw new IOException("不能修改资源根目录，请选择目录中的具体漫画。");
    for(Doc d:documents.values())if(d.path.equals(path)||d.path.startsWith(path+"/"))throw new IOException("请先退出当前漫画的阅读器。");
    if(action.equals("rename")){
      String name=input.getString("name");
      if(name.trim().isEmpty()||!name.equals(name.trim())||name.length()>180||name.matches(".*[<>:\"/\\\\|?*\\p{Cntrl}].*")||name.endsWith(".")||name.equals(".."))throw new IOException("文件名无效。");
      if(!e.directory&&!extension(name).equals(extension(e.name)))throw new IOException("请保留原文件扩展名。");
      if(name.equals(e.name))throw new IOException("名称没有改变。");
      String root=root(path);boolean single=path.equals(root);
      if(!single){Entry parent=resolve(parent(path));for(Entry child:children(parent.uri,parent.path))if(child.name.equalsIgnoreCase(name))throw new IOException("同名文件或目录已存在。");}
      Uri changed=DocumentsContract.renameDocument(resolver,e.uri,name);if(changed==null)throw new IOException("文件提供程序不允许重命名。");
      String actualName=stat(changed,path).name;String next=parent(path)+"/"+actualName;
      if(single){JSONObject grant=new JSONObject().put("uri",changed.toString()).put("tree",false);if(!grants.edit().remove(root).putString(next,grant.toString()).commit())throw new IOException("文件已重命名，但授权保存失败，请重新打开文件。");}
      invalidate(path);return new JSONObject().put("newPath",next);
    }
    if(action.equals("trash")){
      if(!DocumentsContract.deleteDocument(resolver,e.uri))throw new IOException("文件提供程序不允许删除。");
      if(path.equals(root(path)))grants.edit().remove(path).commit();invalidate(path);return new JSONObject().put("newPath",JSONObject.NULL);
    }
    throw new IOException("未知文件操作。");
  }
  private void invalidate(String path){Iterator<Map.Entry<String,File>> it=localCopies.entrySet().iterator();while(it.hasNext()){Map.Entry<String,File> e=it.next();if(e.getKey().startsWith(path+":")||e.getKey().startsWith(path+"/")){nativeArchives.forget(e.getValue());e.getValue().delete();it.remove();}}synchronized(media){media.entrySet().removeIf(e->e.getValue().path.equals(path)||e.getValue().path.startsWith(path+"/"));}}
  private byte[] zipBytes(File file,String name,long limit)throws Exception{try(ZipFile zip=new ZipFile(file)){ZipEntry e=zip.getEntry(name);if(e==null||e.getSize()>limit)throw new IOException("电子书章节或图片不存在或过大。");return bytes(zip.getInputStream(e),limit);}}
  private static final class Tag {String name;Map<String,String> attributes=new HashMap<>();String get(String key){String value=attributes.get(key);return value==null?"":value;}}
  private List<Tag> xml(byte[] bytes)throws Exception{
    // Android's built-in DOM parser does not support desktop Xerces features.
    // Pull parsing keeps DTD processing disabled and rejects declarations/entities.
    XmlPullParser parser=android.util.Xml.newPullParser();
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES,true);
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_DOCDECL,false);
    parser.setInput(new ByteArrayInputStream(bytes),null);
    List<Tag> tags=new ArrayList<>();int token;
    while((token=parser.nextToken())!=XmlPullParser.END_DOCUMENT){
      if(token==XmlPullParser.DOCDECL||(token==XmlPullParser.ENTITY_REF&&parser.getText()==null))throw new IOException("EPUB 书目不允许文档类型或未定义实体。");
      if(token==XmlPullParser.START_TAG){
        if(parser.getDepth()>64||tags.size()>=30000)throw new IOException("EPUB 书目结构过大。");
        Tag tag=new Tag();tag.name=parser.getName();
        for(int i=0;i<parser.getAttributeCount();i++)tag.attributes.put(parser.getAttributeName(i),parser.getAttributeValue(i));
        tags.add(tag);
      }
    }
    return tags;
  }
  private String resolveZip(String base,String relative)throws Exception{
    String href=Uri.decode(relative.split("#",2)[0]);if(href.contains(":")||href.startsWith("/")||href.contains("\\"))throw new IOException("不支持外部电子书资源。");
    ArrayDeque<String> parts=new ArrayDeque<>();String combined=(base.contains("/")?base.substring(0,base.lastIndexOf('/')+1):"")+href;
    for(String part:combined.split("/")){if(part.equals("..")){if(parts.isEmpty())throw new IOException("电子书路径无效。");parts.removeLast();}else if(!part.equals(".")&&!part.isEmpty())parts.add(part);}
    return String.join("/",parts);
  }
  private JSONObject openDocument(JSONObject input)throws Exception{
    if(documents.size()>=6)throw new IOException("打开的文档过多，请先返回资源库。");
    Doc d=new Doc();d.path=input.getString("path");d.file=localFile(d.path);JSONArray chapters=new JSONArray();
    if(input.getString("type").equals("epub")){
      String opf=null;for(Tag tag:xml(zipBytes(d.file,"META-INF/container.xml",2*1024*1024)))if(tag.name.equals("rootfile")){opf=tag.get("full-path");break;}
      if(opf==null||opf.isEmpty())throw new IOException("EPUB 缺少书目。");
      List<Tag> packageDoc=xml(zipBytes(d.file,opf,4*1024*1024));Map<String,String> manifest=new HashMap<>();
      for(Tag item:packageDoc)if(item.name.equals("item"))manifest.put(item.get("id"),resolveZip(opf,item.get("href")));
      for(Tag item:packageDoc)if(item.name.equals("itemref")){
        if(d.chapters.size()>=5000)throw new IOException("EPUB 章节过多。");
        String entry=manifest.get(item.get("idref"));if(entry!=null){d.chapters.add(entry);chapters.put(new JSONObject().put("name","第 "+d.chapters.size()+" 章").put("index",d.chapters.size()-1));}
      }
      if(d.chapters.isEmpty())throw new IOException("EPUB 没有可阅读章节。");
    }
    documents.put(input.getString("id"),d);return new JSONObject().put("size",d.file.length()).put("chapters",chapters);
  }
  private String chapter(Doc d,int index)throws Exception{
    if(index<0||index>=d.chapters.size())throw new IOException("章节不存在。");String entry=d.chapters.get(index);String html=new String(zipBytes(d.file,entry,8*1024*1024),StandardCharsets.UTF_8);
    // Sanitization runs in the renderer's detached DOM, before the sandboxed chapter iframe.
    return new JSONObject().put("html",html).put("path",d.path).put("entry",entry).toString();
  }
  private void save(AtomicFile target,JSONObject data)throws Exception{
    FileOutputStream out=null;try{out=target.startWrite();out.write(data.toString().getBytes(StandardCharsets.UTF_8));target.finishWrite(out);}catch(Exception e){target.failWrite(out);throw e;}
  }
  synchronized Object call(String method,JSONObject input)throws Exception{
    switch(method){
      case "loadData":if(!dataFile.getBaseFile().exists())return null;return new JSONObject(new String(dataFile.readFully(),StandardCharsets.UTF_8));
      case "saveData":save(dataFile,input.getJSONObject("data"));return null;
      case "backupData":save(new AtomicFile(new File(context.getFilesDir(),"before-file-operation.json")),input.getJSONObject("data"));return null;
      case "listDirectory":return directory(input.getString("path"));
      case "getResourcePages":return pages(input.getString("path"));
      case "getPageImage":return pageImage(input);
      case "getThumbnail":return thumbnail(input);
      case "getReadablePageCount":{String t=type(resolve(input.getString("path")));return t.equals("pdf")||t.equals("epub")?null:pages(input.getString("path")).getInt("total");}
      case "checkResourcePath":{String p=input.getString("path");try{Entry e=resolve(p);return new JSONObject().put("path",p).put("exists",true).put("readable",true).put("isDirectory",e.directory);}catch(Exception e){return new JSONObject().put("path",p).put("exists",false).put("readable",false).put("reason","文件不存在或目录授权已失效。");}}
      case "getBookmarkPagePreview":{JSONObject p=pages(input.getString("sourcePath"));JSONArray list=p.getJSONArray("pages");int i=input.optInt("pageIndex");if(i<0||i>=list.length())return new JSONObject().put("dataUrl","");JSONObject page=list.getJSONObject(i).put("preview",true);return new JSONObject().put("dataUrl",pageImage(page).getString("url"));}
      case "releaseReaderResource":nativeArchives.close();return null;
      case "changeLocalResource":return change(input);
      case "openDocument":return openDocument(input);
      case "closeDocument":documents.remove(input.getString("id"));return null;
      case "readDocumentRange":{Doc d=documents.get(input.getString("id"));if(d==null)throw new IOException("文档已关闭。");int start=input.getInt("begin"),end=input.getInt("end");if(start<0||end<start||end>d.file.length()||end-start>1024*1024)throw new IOException("文档读取范围无效。");byte[] bytes=new byte[end-start];try(RandomAccessFile file=new RandomAccessFile(d.file,"r")){file.seek(start);file.readFully(bytes);}return Base64.encodeToString(bytes,Base64.NO_WRAP);}
      case "readDocumentChapter":{Doc d=documents.get(input.getString("id"));if(d==null)throw new IOException("文档已关闭。");return chapter(d,input.getInt("index"));}
      case "epubImage":{String entry=resolveZip(input.getString("entry"),input.getString("href"));if(!image(entry))return null;return registerMedia(input.getString("path"),entry,true);}
      default:throw new IOException("未知本地操作："+method);
    }
  }
  synchronized void close(){nativeArchives.close();documents.clear();}
  private String hash(String text)throws Exception{byte[] digest=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(Locale.ROOT,"%02x",b));return result.toString();}
}
