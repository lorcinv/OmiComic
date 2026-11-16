package io.github.lorcinv.omicomic;
import java.io.*;
import java.nio.file.*;
import java.util.zip.CRC32;
public final class ImageInputChecks {
  interface Checked{void run()throws Exception;}
  static void rejects(Checked task)throws Exception{try{task.run();throw new AssertionError("Expected IOException");}catch(IOException expected){}}
  public static void main(String[] args)throws Exception{
    for(String name:new String[]{"animated.gif","animated.webp","animated.png","animated.apng","metadata.png","static.webp","static.png"}){
      Path path=Paths.get(args[0],name);try(ImageInput input=new ImageInput(Files.newInputStream(path),Files.size(path),ImageInput.MAX_ANIMATION,null)){
        ImageAnimation.Info info=ImageAnimation.inspect(input);if((info!=null)==name.startsWith("static"))throw new AssertionError(name);
        if(info!=null)try(ImageInput frames=new ImageInput(Files.newInputStream(path),Files.size(path),ImageInput.MAX_ANIMATION,null)){
          byte[] preview=AnimationPreview.firstFrame(frames,info.mime);if(preview.length>64*1024*1024)throw new AssertionError("unbounded preview");
          if(!info.mime.equals("image/webp")){java.awt.image.BufferedImage bitmap=javax.imageio.ImageIO.read(new ByteArrayInputStream(preview));if(bitmap==null||bitmap.getWidth()!=info.width||bitmap.getHeight()!=info.height)throw new AssertionError("first frame "+name);}
        }
      }
    }
    byte[] bytes={1,2,3};CRC32 crc=new CRC32();crc.update(bytes);
    try(ImageInput input=new ImageInput(new ByteArrayInputStream(bytes),3,3,crc.getValue())){if(input.skip(3)!=3||input.read()!=-1)throw new AssertionError("bounded skip");}
    rejects(()->{try(ImageInput input=new ImageInput(new ByteArrayInputStream(bytes),-1,2,null)){while(input.read()!=-1){}}});
    rejects(()->{try(ImageInput input=new ImageInput(new ByteArrayInputStream(bytes),3,3,0L)){input.read(new byte[3]);}});
    rejects(()->{try(ImageInput input=new ImageInput(new ByteArrayInputStream(bytes),4,4,null)){while(input.read()!=-1){}}});
    final boolean[] closed={false};try(ImageInput input=new ImageInput(new ByteArrayInputStream(bytes),3,3,null).own(()->closed[0]=true)){input.read();}
    if(!closed[0])throw new AssertionError("source leaked on early cancellation");
    System.out.println("Android streamed metadata, byte limits, CRC, truncation and close checks passed");
  }
}
