package io.github.lorcinv.omicomic;
import java.nio.file.*;
public final class ImageAnimationChecks {
  public static void main(String[] args)throws Exception {
    for(String name:new String[]{"animated.gif","animated.webp","animated.png","animated.apng","metadata.png","static.webp","static.png"}){
      boolean actual=ImageAnimation.animated(Files.readAllBytes(Paths.get(args[0],name)));
      if(actual==name.startsWith("static"))throw new AssertionError(name);
    }
    if(ImageAnimation.animated(new byte[0]))throw new AssertionError("empty");
    System.out.println("Android animation detection: 8 checks passed");
  }
}
