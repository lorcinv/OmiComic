package io.github.lorcinv.omicomic;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;

/** Persistent URI lookup and bounded directory snapshots. Derived data, never an authority for grants. */
final class DirectoryIndex extends SQLiteOpenHelper {
  private static final java.util.regex.Pattern CATALOG_FILE=java.util.regex.Pattern.compile(".*\\.(zip|cbz|rar|cbr|7z|cb7|pdf|epub)$",java.util.regex.Pattern.CASE_INSENSITIVE);
  DirectoryIndex(Context context){super(context,"directory-index.db",null,3);setWriteAheadLoggingEnabled(true);}
  @Override public void onCreate(SQLiteDatabase db){
    db.execSQL("CREATE TABLE entries(path TEXT PRIMARY KEY, uri TEXT NOT NULL, record TEXT NOT NULL)");
    db.execSQL("CREATE TABLE directories(path TEXT PRIMARY KEY, version TEXT NOT NULL, saved INTEGER NOT NULL, listing TEXT NOT NULL)");
    createCatalog(db);
  }
  private void createCatalog(SQLiteDatabase db){
    db.execSQL("CREATE TABLE IF NOT EXISTS catalog_directories(path TEXT PRIMARY KEY, version TEXT NOT NULL, saved INTEGER NOT NULL, folder TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'complete')");
    db.execSQL("CREATE TABLE IF NOT EXISTS catalog_entries(path TEXT PRIMARY KEY, parent TEXT NOT NULL, uri TEXT NOT NULL, record TEXT NOT NULL)");
    db.execSQL("CREATE INDEX IF NOT EXISTS catalog_parent ON catalog_entries(parent)");
  }
  @Override public void onUpgrade(SQLiteDatabase db,int old,int next){if(old<2)createCatalog(db);else if(old<3)db.execSQL("ALTER TABLE catalog_directories ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'");}
  String uri(String path){
    try{SQLiteDatabase db=getReadableDatabase();for(String table:new String[]{"entries","catalog_entries"})try(Cursor c=db.query(table,new String[]{"uri"},"path=?",new String[]{path},null,null,null)){if(c.moveToFirst())return c.getString(0);}
      try(Cursor c=db.query("catalog_directories",new String[]{"folder"},"path=?",new String[]{path},null,null,null)){if(c.moveToFirst())return new JSONObject(c.getString(0)).getString("uri");}
    }catch(Exception unavailable){}return null;
  }
  JSONObject catalog(String path){
    try{SQLiteDatabase db=getReadableDatabase();JSONObject result;
      try(Cursor c=db.query("catalog_directories",new String[]{"version","saved","folder","status"},"path=?",new String[]{path},null,null,null)){
        if(!c.moveToFirst())return null;result=new JSONObject().put("version",c.getString(0)).put("saved",c.getLong(1)).put("folder",new JSONObject(c.getString(2))).put("status",c.getString(3));
      }
      JSONArray list=new JSONArray();try(Cursor c=db.query("catalog_entries",new String[]{"record"},"parent=?",new String[]{path},null,null,null)){while(c.moveToNext())list.put(new JSONObject(c.getString(0)));}
      return result.put("items",list);
    }catch(Exception invalid){return null;}
  }
  synchronized void saveCatalog(String path,String version,JSONObject folder,JSONArray list){
    SQLiteDatabase db=null;try{db=getWritableDatabase();db.beginTransaction();
      ContentValues values=new ContentValues();values.put("path",path);values.put("version",version);values.put("saved",System.currentTimeMillis());values.put("folder",folder.toString());values.put("status","complete");
      db.insertWithOnConflict("catalog_directories",null,values,SQLiteDatabase.CONFLICT_REPLACE);
      db.delete("catalog_entries","parent=?",new String[]{path});
      for(int i=0;i<list.length();i++){JSONObject row=list.getJSONObject(i);String name=row.getString("name");
        if(!row.optBoolean("directory")&&!CATALOG_FILE.matcher(name).matches())continue;
        values.clear();values.put("path",row.getString("path"));values.put("parent",path);values.put("uri",row.getString("uri"));values.put("record",row.toString());db.insertWithOnConflict("catalog_entries",null,values,SQLiteDatabase.CONFLICT_REPLACE);
      }
      db.setTransactionSuccessful();
    }catch(Exception ignored){}finally{if(db!=null&&db.inTransaction())db.endTransaction();}
  }
  synchronized void invalidateCatalog(String path){try{getWritableDatabase().execSQL("UPDATE catalog_directories SET saved=0,status='pending' WHERE path=?",new Object[]{path});}catch(Exception ignored){}}
  synchronized void failCatalog(String path,JSONObject folder){try{SQLiteDatabase db=getWritableDatabase();ContentValues values=new ContentValues();values.put("path",path);values.put("version","");values.put("saved",0);values.put("folder",folder.toString());values.put("status","failed");db.insertWithOnConflict("catalog_directories",null,values,SQLiteDatabase.CONFLICT_IGNORE);db.execSQL("UPDATE catalog_directories SET saved=0,status='failed' WHERE path=?",new Object[]{path});}catch(Exception ignored){}}
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
  synchronized void clear(){try{SQLiteDatabase db=getWritableDatabase();db.delete("entries",null,null);db.delete("directories",null,null);db.execSQL("UPDATE catalog_directories SET saved=0,status='pending'");}catch(Exception ignored){}}
}
