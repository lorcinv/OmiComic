package io.github.lorcinv.omicomic;

/** Container metadata only: BitmapFactory and canvas would discard later frames. */
final class ImageAnimation {
  private static boolean text(byte[] data,int offset,String value){
    if(offset<0||offset+value.length()>data.length)return false;
    for(int i=0;i<value.length();i++)if((data[offset+i]&255)!=value.charAt(i))return false;
    return true;
  }
  static boolean animated(byte[] data){
    if(text(data,0,"GIF87a")||text(data,0,"GIF89a"))return true;
    if(data.length>=30&&text(data,0,"RIFF")&&text(data,8,"WEBP"))return text(data,12,"VP8X")&&(data[20]&2)!=0;
    if(!text(data,0,"\u0089PNG\r\n\u001a\n"))return false;
    for(int offset=8;offset<=data.length-12;){
      long length=((long)(data[offset]&255)<<24)|((long)(data[offset+1]&255)<<16)|((data[offset+2]&255)<<8)|(data[offset+3]&255);
      if(length>data.length-offset-12)return false;
      if(text(data,offset+4,"acTL"))return length==8;
      if(text(data,offset+4,"IDAT")||text(data,offset+4,"IEND"))return false;
      offset+=(int)length+12;
    }
    return false;
  }
}
