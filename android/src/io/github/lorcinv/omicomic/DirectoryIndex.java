package io.github.lorcinv.omicomic;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;

/** Persistent URI lookup and bounded directory snapshots. Derived data, never an authority for grants. */
final class DirectoryIndex extends SQLiteOpenHelper {
  DirectoryIndex(Context context){super(context,"directory-index.db",null,1);setWriteAheadLoggingEnabled(true);}
  @Override public void onCreate(SQLiteDatabase db){
    db.execSQL("CREATE TABLE entries(path TEXT PRIMARY KEY, uri TEXT NOT NULL, record TEXT NOT NULL)");
    db.execSQL("CREATE TABLE directories(path TEXT PRIMARY KEY, version TEXT NOT NULL, saved INTEGER NOT NULL, listing TEXT NOT NULL)");
  }
  @Override public void onUpgrade(SQLiteDatabase db,int old,int next){}
  String uri(String path){try(Cursor c=getReadableDatabase().query("entries",new String[]{"uri"},"path=?",new String[]{path},null,null,null)){return c.moveToFirst()?c.getString(0):null;}catch(Exception unavailable){return null;}}
  JSONArray children(String path,String version){
    try(Cursor c=getReadableDatabase().query("directories",new String[]{"listing","saved","version"},"path=?",new String[]{path},null,null,null)){
      if(!c.moveToFirst()||!version.equals(c.getString(2))||System.currentTimeMillis()-c.getLong(1)>300000)return null;
      return new JSONArray(c.getString(0));
    }catch(Exception unavailable){return null;}
  }
  synchronized void save(String path,String version,JSONArray list){
    SQLiteDatabase db=null;try{
      db=getWritableDatabase();db.beginTransaction();
      ContentValues values=new ContentValues();values.put("path",path);values.put("version",version);values.put("saved",System.currentTimeMillis());values.put("listing",list.toString());
      db.insertWithOnConflict("directories",null,values,SQLiteDatabase.CONFLICT_REPLACE);
      for(int i=0;i<list.length();i++){JSONObject e=list.getJSONObject(i);values.clear();values.put("path",e.getString("path"));values.put("uri",e.getString("uri"));values.put("record",e.toString());db.insertWithOnConflict("entries",null,values,SQLiteDatabase.CONFLICT_REPLACE);}
      db.execSQL("DELETE FROM directories WHERE path IN (SELECT path FROM directories ORDER BY saved DESC LIMIT -1 OFFSET 128)");
      db.execSQL("DELETE FROM entries WHERE rowid IN (SELECT rowid FROM entries ORDER BY rowid DESC LIMIT -1 OFFSET 32000)");
      db.setTransactionSuccessful();
    }catch(Exception ignored){}finally{if(db!=null&&db.inTransaction())db.endTransaction();}
  }
  synchronized void clear(){try{SQLiteDatabase db=getWritableDatabase();db.delete("entries",null,null);db.delete("directories",null,null);}catch(Exception ignored){}}
}
