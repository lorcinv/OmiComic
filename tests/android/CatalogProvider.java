package io.github.lorcinv.omicomic.test;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import java.io.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** A separate-process SAF-shaped fixture with observable cancellation and mutation. */
public final class CatalogProvider extends ContentProvider {
  static final String AUTHORITY="io.github.lorcinv.omicomic.test.catalog";
  private final AtomicInteger stats=new AtomicInteger(),children=new AtomicInteger(),canceled=new AtomicInteger();
  private volatile boolean slow,started,extra,denied;
  private volatile String bookName="Stable.cbr";
  @Override public boolean onCreate(){return true;}
  @Override public String getType(Uri uri){return "vnd.android.document/directory";}
  private Bundle state(){Bundle out=new Bundle();out.putInt("stats",stats.get());out.putInt("children",children.get());out.putInt("canceled",canceled.get());out.putBoolean("started",started);return out;}
  @Override public Bundle call(String method,String arg,Bundle extras){
    if(method.equals("reset")){stats.set(0);children.set(0);canceled.set(0);slow=started=extra=denied=false;bookName="Stable.cbr";}
    if(method.equals("slow")){slow=true;started=false;}
    if(method.equals("release"))slow=false;
    if(method.equals("extra"))extra=true;
    if(method.equals("deny"))denied=Boolean.parseBoolean(arg);
    if(method.equals("android:renameDocument")){
      bookName=extras.getString("_display_name");
      Bundle out=new Bundle();out.putParcelable("uri",DocumentsContract.buildDocumentUriUsingTree((Uri)extras.getParcelable("uri"),"root/Branch/Deep/"+bookName));return out;
    }
    return state();
  }
  @Override public Cursor query(Uri uri,String[] columns,String selection,String[] args,String order){return query(uri,columns,selection,args,order,null);}
  @Override public Cursor query(Uri uri,String[] columns,String selection,String[] args,String order,CancellationSignal signal){
    if(denied)throw new SecurityException("Fixture grant revoked");
    String id=DocumentsContract.getDocumentId(uri);boolean listing=uri.getLastPathSegment().equals("children");
    MatrixCursor result=new MatrixCursor(columns);
    if(!listing){stats.incrementAndGet();row(result,columns,id);return result;}
    children.incrementAndGet();
    if(id.equals("root/Slow")&&slow){
      started=true;long end=SystemClock.uptimeMillis()+6000;
      while(slow&&SystemClock.uptimeMillis()<end){
        if(signal!=null&&signal.isCanceled()){canceled.incrementAndGet();signal.throwIfCanceled();}
        SystemClock.sleep(5);
      }
    }
    if(id.equals("root"))for(String name:new String[]{"Slow","Zero","Branch"})row(result,columns,"root/"+name);
    if(id.equals("root/Slow"))row(result,columns,id+"/Slowed.cbr");
    if(id.equals("root/Zero")){row(result,columns,id+"/Zero.cbr");if(extra)row(result,columns,id+"/Extra.cbr");}
    if(id.equals("root/Branch"))row(result,columns,id+"/Deep");
    if(id.equals("root/Branch/Deep"))row(result,columns,id+"/"+bookName);
    return result;
  }
  private void row(MatrixCursor result,String[] columns,String id){
    boolean directory=!id.endsWith(".cbr");Object[] row=new Object[columns.length];
    for(int i=0;i<columns.length;i++){
      String column=columns[i];
      if(column.equals(DocumentsContract.Document.COLUMN_DOCUMENT_ID))row[i]=id;
      else if(column.equals(DocumentsContract.Document.COLUMN_DISPLAY_NAME))row[i]=id.equals("root")?"Catalog1142":id.substring(id.lastIndexOf('/')+1);
      else if(column.equals(DocumentsContract.Document.COLUMN_MIME_TYPE))row[i]=directory?DocumentsContract.Document.MIME_TYPE_DIR:"application/vnd.rar";
      else if(column.equals(DocumentsContract.Document.COLUMN_SIZE))row[i]=directory?0L:48595L;
      else if(column.equals(DocumentsContract.Document.COLUMN_LAST_MODIFIED))row[i]=id.equals("root/Zero")?0L:1793160000000L;
    }
    result.addRow(row);
  }
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {
    if(denied)throw new SecurityException("Fixture grant revoked");
    try{ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();new Thread(()->{
      try(InputStream in=getContext().getAssets().open("stream.cbr");OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}catch(IOException closed){}
    },"catalog-fixture-stream").start();return pipe[0];}catch(IOException error){throw new FileNotFoundException(error.getMessage());}
  }
  @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
  @Override public int update(Uri uri,ContentValues values,String selection,String[] args){return 0;}
  @Override public int delete(Uri uri,String selection,String[] args){return 0;}
}
