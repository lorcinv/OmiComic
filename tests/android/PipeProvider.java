package io.github.lorcinv.omicomic.test;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import java.io.*;

/** Test-only streaming document provider; never bundled in the production application. */
public final class PipeProvider extends ContentProvider {
  @Override public boolean onCreate(){return true;}
  @Override public String getType(Uri uri){return "application/vnd.rar";}
  @Override public Cursor query(Uri uri,String[] columns,String selection,String[] args,String order){
    MatrixCursor result=new MatrixCursor(columns);Object[] values=new Object[columns.length];
    for(int i=0;i<columns.length;i++){
      String column=columns[i];
      if(column.equals(DocumentsContract.Document.COLUMN_DOCUMENT_ID))values[i]="stream";
      else if(column.equals(DocumentsContract.Document.COLUMN_DISPLAY_NAME))values[i]="Stream.cbr";
      else if(column.equals(DocumentsContract.Document.COLUMN_MIME_TYPE))values[i]=getType(uri);
      else if(column.equals(DocumentsContract.Document.COLUMN_SIZE))values[i]=48595L;
      else if(column.equals(DocumentsContract.Document.COLUMN_LAST_MODIFIED))values[i]=1791590400000L;
    }
    result.addRow(values);return result;
  }
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {
    try {
      ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();
      new Thread(()->{
        try(InputStream input=getContext().getAssets().open("stream.cbr");OutputStream output=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){
          byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
        }catch(IOException closedProbe){}
      },"Omi test pipe").start();
      return pipe[0];
    }catch(IOException error){throw new FileNotFoundException(error.getMessage());}
  }
  @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
  @Override public int update(Uri uri,ContentValues values,String selection,String[] args){return 0;}
  @Override public int delete(Uri uri,String selection,String[] args){return 0;}
}
