package io.github.lorcinv.omicomic;

import android.content.ContentResolver;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** User-selected JSON documents are independent of comic-directory grants. */
final class DataBackupFiles {
  static final int MAX_BYTES = 64 * 1024 * 1024;
  static String read(ContentResolver resolver, Uri uri) throws Exception {
    try (InputStream input = resolver.openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      if (input == null) throw new IOException("无法打开备份文件。");
      byte[] chunk = new byte[16384]; int count;
      while ((count = input.read(chunk)) != -1) {
        if (output.size() + count > MAX_BYTES) throw new IOException("备份文件超过 64 MB，无法导入。");
        output.write(chunk, 0, count);
      }
      return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }
  }
  static void write(ContentResolver resolver, Uri uri, String text) throws Exception {
    byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
    try (OutputStream output = resolver.openOutputStream(uri, "wt")) {
      if (output == null) throw new IOException("无法写入备份文件。");
      output.write(bytes); output.flush();
    }
  }
}
