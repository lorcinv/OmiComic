package io.github.lorcinv.omicomic;

import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class PageOrderTest {
  @Test public void nativeDirectoryAndArchiveOrderKeepsFormatLabelsWithTheirNumbers() {
    List<String> expected=Arrays.asList("00013.jpg","00014.jpg","00015.jpg","00016-GIF.gif","00017-GIF.gif","00018-GIF.gif","00019.jpg","00020.jpg","00021- GIF.gif","00022-GIF.gif","00023-GIF.gif","00024.jpg","00025.jpg","00026.jpg");
    List<String> actual=new ArrayList<>(expected);Collections.reverse(actual);
    actual.sort(LocalLibrary::natural);
    assertEquals(expected,actual);
  }
}
