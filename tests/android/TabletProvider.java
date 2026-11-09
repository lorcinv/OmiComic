package io.github.lorcinv.omicomic.test;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import java.io.*;

/** Read-only, emulator-only SAF fixtures. Never part of the production APK. */
public final class TabletProvider extends ContentProvider {
  @Override public boolean onCreate(){return true;}
  @Override public android.os.Bundle call(String method,String arg,android.os.Bundle extras){
    if(!"prepareBookSwitch".equals(method))return super.call(method,arg,extras);
    try{for(int volume=1;volume<=3;volume++){
      File folder=new File(getContext().getFilesDir(),"tablet1179/Switch1193/Vol "+volume);folder.mkdirs();
      android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(600,900,android.graphics.Bitmap.Config.ARGB_8888);
      bitmap.eraseColor(volume==1?0xffffaaaa:volume==2?0xffaaffaa:0xffaaaaff);
      try{for(int page=1;page<=2;page++)try(FileOutputStream out=new FileOutputStream(new File(folder,page+".png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}}finally{bitmap.recycle();}
    }}catch(IOException error){throw new IllegalStateException(error);}
    return android.os.Bundle.EMPTY;
  }

  private File file(String id)throws IOException{
    File root=new File(getContext().getFilesDir(),"tablet1179").getCanonicalFile();
    File file=id.equals("root")?root:new File(root,id.substring("root/".length())).getCanonicalFile();
    if(!file.equals(root)&&!file.getPath().startsWith(root.getPath()+File.separator))throw new IOException("Invalid fixture path");
    return file;
  }
  private String mime(File file){String n=file.getName().toLowerCase();return file.isDirectory()?DocumentsContract.Document.MIME_TYPE_DIR:n.endsWith(".pdf")?"application/pdf":n.endsWith(".epub")?"application/epub+zip":n.endsWith(".mobi")?"application/x-mobipocket-ebook":"image/png";}
  @Override public String getType(Uri uri){try{return mime(file(DocumentsContract.getDocumentId(uri)));}catch(Exception e){return "application/octet-stream";}}
  private void row(MatrixCursor result,String[] columns,String id,File file){
    Object[] values=new Object[columns.length];for(int i=0;i<columns.length;i++){
      String c=columns[i];if(c.equals("document_id"))values[i]=id;else if(c.equals("_display_name"))values[i]=id.equals("root")?"Tablet1179":file.getName();else if(c.equals("mime_type"))values[i]=mime(file);else if(c.equals("_size"))values[i]=file.length();else if(c.equals("last_modified"))values[i]=file.lastModified();
    }result.addRow(values);
  }
  @Override public Cursor query(Uri uri,String[] columns,String selection,String[] args,String order){
    try{String id=DocumentsContract.getDocumentId(uri);File f=file(id);MatrixCursor result=new MatrixCursor(columns);
      if(uri.getLastPathSegment().equals("children")){File[] children=f.listFiles();android.util.Log.i("Tablet1179","root="+f+" package="+getContext().getPackageName()+" exists="+f.exists()+" readable="+f.canRead()+" children="+(children==null?-1:children.length));if(children!=null)for(File child:children)row(result,columns,id+"/"+child.getName(),child);}else row(result,columns,id,f);return result;
    }catch(IOException e){throw new IllegalArgumentException(e);}
  }
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
    try{return ParcelFileDescriptor.open(file(DocumentsContract.getDocumentId(uri)),ParcelFileDescriptor.MODE_READ_ONLY);}catch(IOException e){throw new FileNotFoundException(e.toString());}
  }
  @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
  @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
  @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
