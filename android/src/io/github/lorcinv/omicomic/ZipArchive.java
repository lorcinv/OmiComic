package io.github.lorcinv.omicomic;

import java.io.*;
import java.nio.charset.*;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** Independent ZIP/ZIP64 central-directory reader. No shared file cursor, no whole-book extraction. */
final class ZipArchive {
  static final long MAX_TOTAL=8L*1024*1024*1024,MAX_IMAGE=64L*1024*1024;
  static final int MAX_ENTRIES=30000;
  static final class Entry {
    final String name;final long offset,packed,size,crc;final int method,flags;final Long modified;
    Entry(String name,long offset,long packed,long size,long crc,int method,int flags,Long modified){this.name=name;this.offset=offset;this.packed=packed;this.size=size;this.crc=crc;this.method=method;this.flags=flags;this.modified=modified;}
  }
  final LinkedHashMap<String,Entry> entries=new LinkedHashMap<>();
  private static int u16(byte[] b,int p){return (b[p]&255)|((b[p+1]&255)<<8);}
  private static long u32(byte[] b,int p){return ((long)u16(b,p))|((long)u16(b,p+2)<<16);}
  private static long u64(byte[] b,int p)throws IOException{long v=u32(b,p)|(u32(b,p+4)<<32);if(v<0)throw new IOException("ZIP64 文件过大。");return v;}
  private static void check(long at,long count,long end)throws IOException{if(at<0||count<0||at>end-count)throw new IOException("ZIP 目录或图片数据不完整。");}
  private static final class DirectoryReader {
    final SeekableSource source;final long end;long start=-1;byte[] buffer=new byte[0];
    DirectoryReader(SeekableSource source,long end){this.source=source;this.end=end;}
    byte[] read(long at,int count)throws IOException{
      check(at,count,end);
      if(start<0||at<start||at+count>start+buffer.length){start=at;buffer=source.readAt(at,(int)Math.min(end-at,Math.max(65536,count)));}
      return Arrays.copyOfRange(buffer,(int)(at-start),(int)(at-start)+count);
    }
  }
  static ZipArchive open(SeekableSource source)throws IOException {
    long length=source.size();if(length<22)return null;
    byte[] tail=source.readAt(Math.max(0,length-65557),(int)Math.min(65557,length));int end=-1;
    for(int p=tail.length-22;p>=0;p--)if(u32(tail,p)==0x06054b50L&&p+22+u16(tail,p+20)==tail.length){end=p;break;}
    if(end<0)return null;
    long endOffset=length-tail.length+end;
    if(u16(tail,end+4)!=0||u16(tail,end+6)!=0)throw new IOException("暂不支持分卷 ZIP。");
    long count=u16(tail,end+10),centralSize=u32(tail,end+12),central=u32(tail,end+16);
    if(count==65535||centralSize==0xffffffffL||central==0xffffffffL){
      if(endOffset<20)throw new IOException("ZIP64 目录缺失。");
      byte[] locator=source.readAt(endOffset-20,20);
      if(u32(locator,0)!=0x07064b50L||u32(locator,4)!=0||u32(locator,16)!=1)throw new IOException("ZIP64 分卷或目录无效。");
      long record=u64(locator,8);check(record,56,endOffset-20);byte[] z=source.readAt(record,56);
      if(u32(z,0)!=0x06064b50L||u32(z,16)!=0||u32(z,20)!=0)throw new IOException("ZIP64 目录无效。");
      count=u64(z,32);centralSize=u64(z,40);central=u64(z,48);endOffset=record;
    }
    if(count>MAX_ENTRIES)throw new IOException("压缩包条目过多。");
    check(central,centralSize,endOffset);long cursor=central,total=0;ZipArchive index=new ZipArchive();DirectoryReader directory=new DirectoryReader(source,central+centralSize);
    for(int n=0;n<count;n++){
      check(cursor,46,central+centralSize);byte[] header=directory.read(cursor,46);
      if(u32(header,0)!=0x02014b50L)throw new IOException("ZIP 目录损坏。");
      int flags=u16(header,8),method=u16(header,10),nameLength=u16(header,28),extraLength=u16(header,30),comment=u16(header,32);
      if((flags&1)!=0)throw new IOException("此压缩包已加密，暂不支持密码漫画。");
      long packed=u32(header,20),size=u32(header,24),offset=u32(header,42),crc=u32(header,16);
      check(cursor+46,(long)nameLength+extraLength+comment,central+centralSize);
      byte[] bytes=directory.read(cursor+46,nameLength+extraLength);
      String name=new String(bytes,0,nameLength,(flags&2048)!=0?StandardCharsets.UTF_8:Charset.forName("CP437"));
      // Some older writers store UTF-8 names without the language flag. Preserve
      // those names when the entire byte sequence is valid UTF-8; otherwise CP437.
      if((flags&2048)==0)try{name=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes,0,nameLength)).toString();}catch(CharacterCodingException legacy){}
      Long modified=dosTime(u16(header,14),u16(header,12));
      for(int p=nameLength;p+4<=bytes.length;){int kind=u16(bytes,p),len=u16(bytes,p+2);p+=4;if(p+len>bytes.length)throw new IOException("ZIP 附加信息损坏。");
        if(kind==1){int q=p;
          if(size==0xffffffffL){if(q+8>p+len)throw new IOException("ZIP64 大小缺失。");size=u64(bytes,q);q+=8;}
          if(packed==0xffffffffL){if(q+8>p+len)throw new IOException("ZIP64 长度缺失。");packed=u64(bytes,q);q+=8;}
          if(offset==0xffffffffL){if(q+8>p+len)throw new IOException("ZIP64 位置缺失。");offset=u64(bytes,q);}
        }else if(kind==0x7075&&len>=5&&bytes[p]==1){CRC32 nameCrc=new CRC32();nameCrc.update(bytes,0,nameLength);if(nameCrc.getValue()==u32(bytes,p+1))name=new String(bytes,p+5,len-5,StandardCharsets.UTF_8);}
        else if(kind==0x5455&&len>=5&&(bytes[p]&1)!=0)modified=u32(bytes,p+1)*1000;
        p+=len;
      }
      if(size<0||size>MAX_TOTAL-total)throw new IOException("压缩包展开内容超过手机端读取上限。");total+=size;
      check(offset,30,central);
      // Other ZIP methods retain the libarchive compatibility path for the entire book.
      if(method!=0&&method!=8)return null;
      if(NativeArchives.image(name)&&size<=MAX_IMAGE){
        if(index.entries.put(name,new Entry(name,offset,packed,size,crc,method,flags,modified))!=null)throw new IOException("压缩包中存在重复的图片路径。");
      }
      cursor+=46L+nameLength+extraLength+comment;
    }
    return index;
  }
  private static Long dosTime(int date,int time){
    if(date==0)return null;
    Calendar calendar=new GregorianCalendar();calendar.clear();calendar.set(1980+(date>>9),((date>>5)&15)-1,date&31,(time>>11)&31,(time>>5)&63,(time&31)*2);return calendar.getTimeInMillis();
  }
  byte[] read(SeekableSource source,String name,long limit)throws IOException{
    Entry e=entries.get(name);if(e==null)throw new FileNotFoundException("压缩包图片已不存在。");
    if(e.size>limit||e.size>Integer.MAX_VALUE)throw new IOException("文件内容超过手机端读取上限。");
    byte[] header=source.readAt(e.offset,30);
    if(u32(header,0)!=0x04034b50L||u16(header,8)!=e.method||(u16(header,6)&1)!=0)throw new IOException("ZIP 图片索引已失效，请刷新目录。");
    long start=e.offset+30+u16(header,26)+u16(header,28);check(start,e.packed,source.size());
    byte[] data=new byte[(int)e.size];Inflater inflater=e.method==8?new Inflater(true):null;
    try(InputStream raw=source.stream(start,e.packed);InputStream input=inflater==null?raw:new InflaterInputStream(raw,inflater,65536)){
      int done=0;while(done<data.length){int n=input.read(data,done,data.length-done);if(n<0)throw new EOFException("ZIP 图片数据不完整。");done+=n;}
      if(input.read()!=-1)throw new IOException("ZIP 图片展开长度不符。");
      CRC32 crc=new CRC32();crc.update(data);if(crc.getValue()!=e.crc)throw new IOException("ZIP 图片校验失败。");return data;
    }finally{if(inflater!=null)inflater.end();}
  }
  byte[] serialize(){
    JSONArray rows=new JSONArray();for(Entry e:entries.values())rows.put(new JSONArray().put(e.name).put(e.offset).put(e.packed).put(e.size).put(e.crc).put(e.method).put(e.flags).put(e.modified==null?JSONObject.NULL:e.modified));
    return rows.toString().getBytes(StandardCharsets.UTF_8);
  }
  static ZipArchive restore(byte[] bytes,long length){
    if(bytes==null)return null;try{JSONArray rows=new JSONArray(new String(bytes,StandardCharsets.UTF_8));if(rows.length()>MAX_ENTRIES)return null;ZipArchive zip=new ZipArchive();
      for(int i=0;i<rows.length();i++){JSONArray r=rows.getJSONArray(i);Entry e=new Entry(r.getString(0),r.getLong(1),r.getLong(2),r.getLong(3),r.getLong(4),r.getInt(5),r.getInt(6),r.isNull(7)?null:r.getLong(7));
        check(e.offset,30,length);if(!NativeArchives.image(e.name)||e.packed<0||e.packed>length||e.size<0||e.size>MAX_IMAGE||(e.method!=0&&e.method!=8)||(e.flags&1)!=0||zip.entries.put(e.name,e)!=null)return null;}
      return zip;
    }catch(Exception invalid){return null;}
  }
}
