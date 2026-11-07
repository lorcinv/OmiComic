"""Verify production EPUB ZIP reads without a device; Android/JNI timing is separate."""
from pathlib import Path
import json
import os
import struct
import subprocess
import warnings
import zipfile

project = Path.cwd().resolve()
root = project / '.cache/experience1186/epub-host'
root.mkdir(parents=True, exist_ok=True)
(root / 'classes').mkdir(exist_ok=True)
fixtures = root / 'fixtures'
fixtures.mkdir(exist_ok=True)
source = project / 'android/src/io/github/lorcinv/omicomic'
java_home = project / '.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1'


def fixture(name, method=zipfile.ZIP_DEFLATED, zip64=False, duplicate=False):
    path = fixtures / name
    with zipfile.ZipFile(path, 'w', compression=method) as archive:
        archive.writestr('image.png', bytes([1, 2, 3, 4]))
        archive.writestr('folder/', b'')
        with archive.open('chapter.xhtml', 'w', force_zip64=zip64) as output:
            output.write(b'<html><body><p>EPUB chapter</p></body></html>')
        if duplicate:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                archive.writestr('chapter.xhtml', b'duplicate')
    return path


normal = fixture('normal.zip')
fixture('local-zip64.zip', zip64=True)
fixture('unsupported.zip', method=zipfile.ZIP_BZIP2)
fixture('duplicate.zip', duplicate=True)
(fixtures / 'not-zip.bin').write_bytes(b'not a ZIP' * 8)
original = normal.read_bytes()
end = original.rindex(b'PK\x05\x06')
entry_count = struct.unpack_from('<H', original, end + 10)[0]
directory_size, directory_offset = struct.unpack_from('<II', original, end + 12)
zip64_end = struct.pack('<IQHHIIQQQQ', 0x06064b50, 44, 45, 45, 0, 0, entry_count, entry_count, directory_size, directory_offset)
zip64_locator = struct.pack('<IIQI', 0x07064b50, 0, end, 1)
legacy_end = bytearray(original[end:])
struct.pack_into('<HHII', legacy_end, 8, 65535, 65535, 0xffffffff, 0xffffffff)
(fixtures / 'directory-zip64.zip').write_bytes(original[:end] + zip64_end + zip64_locator + legacy_end)
with zipfile.ZipFile(normal) as archive:
    chapter = archive.getinfo('chapter.xhtml')
central = original.index(b'PK\x01\x02')
while True:
    length = struct.unpack_from('<H', original, central + 28)[0]
    if original[central + 46:central + 46 + length] == b'chapter.xhtml':
        break
    extra, comment = struct.unpack_from('<HH', original, central + 30)
    central += 46 + length + extra + comment
for name, at, fmt, value in [
    ('bad-crc.zip', central + 16, '<I', chapter.CRC ^ 1),
    ('encrypted.zip', central + 8, '<H', 1),
    ('bad-directory.zip', central, '<I', 0),
    ('bad-offset.zip', central + 42, '<I', len(original) + 100),
]:
    content = bytearray(original)
    struct.pack_into(fmt, content, at, value)
    (fixtures / name).write_bytes(content)
content = bytearray(original)
length, extra = struct.unpack_from('<HH', content, chapter.header_offset + 26)
content[chapter.header_offset + 30 + length + extra + chapter.compress_size // 2] ^= 0x40
(fixtures / 'bad-payload.zip').write_bytes(content)

adapters = {
    'SeekableSource.java': r'''package io.github.lorcinv.omicomic;
import java.io.*;import android.os.ParcelFileDescriptor;
final class SeekableSource implements Closeable {
 final File file;final RandomAccessFile input;long readCalls,readBytes;boolean closed;
 SeekableSource(File file)throws IOException{this.file=file;input=new RandomAccessFile(file,"r");}
 long size(){try{return input.length();}catch(IOException e){throw new RuntimeException(e);}}
 synchronized byte[] readAt(long offset,int count)throws IOException{if(closed)throw new IOException("Closed");byte[] bytes=new byte[count];input.seek(offset);input.readFully(bytes);readCalls++;readBytes+=count;return bytes;}
 InputStream stream(long offset,long length)throws IOException{if(closed)throw new IOException("Closed");RandomAccessFile reader=new RandomAccessFile(file,"r");reader.seek(offset);return new InputStream(){long remaining=length;
  public int read()throws IOException{byte[] b=new byte[1];return read(b,0,1)<0?-1:b[0]&255;}
  public int read(byte[] b,int start,int count)throws IOException{if(count==0)return 0;if(remaining==0)return -1;int n=reader.read(b,start,(int)Math.min(remaining,count));if(n<0)throw new EOFException();remaining-=n;return n;}
  public void close()throws IOException{reader.close();}};}
 ParcelFileDescriptor duplicate()throws IOException{throw new IOException("JNI unavailable in host harness");}
 public void close()throws IOException{closed=true;input.close();}
}''',
    'DiskCache.java': r'''package io.github.lorcinv.omicomic;
import java.util.*;final class DiskCache{final Map<String,byte[]> values=new HashMap<>();byte[] get(String key){return values.get(key);}void put(String key,byte[] bytes){values.put(key,bytes);}}
''',
}
local = (source / 'LocalLibrary.java').read_text(encoding='utf-8')
start = local.index('  static int natural(')
end = local.index('\n  }', start) + 4
adapters['LocalLibrary.java'] = 'package io.github.lorcinv.omicomic; final class LocalLibrary {\n' + local[start:end] + '\n}'
for name, content in adapters.items():
    (root / name).write_text(content, encoding='utf-8')
dependencies = [project / '.cache/android-zip-host/json-20240303.jar', project / '.cache/android-tools/android-35/android.jar', project / 'android/build/native/classes.jar']
for dependency in dependencies:
    if not dependency.is_file():
        raise RuntimeError(f'Missing existing host test prerequisite: {dependency}')
classpath = os.pathsep.join(map(str, dependencies))
subprocess.run([str(java_home / 'bin/javac.exe'), '--release', '8', '-encoding', 'UTF-8', '-cp', classpath, '-d', str(root / 'classes'), *[str(root / name) for name in adapters], str(source / 'NativeArchives.java'), str(source / 'ZipArchive.java'), str(project / 'tests/android/EpubZipChecks.java')], check=True)
result = subprocess.run([str(java_home / 'bin/java.exe'), '-Dfile.encoding=UTF-8', '-cp', str(root / 'classes') + os.pathsep + classpath, 'io.github.lorcinv.omicomic.EpubZipChecks', str(fixtures), str(project / '.cache/experience1186/fixtures/StartupDeep.epub')], check=True, text=True, encoding='utf-8', capture_output=True)
parsed = json.loads(result.stdout)
(root / 'results.json').write_text(json.dumps(parsed, indent=2), encoding='utf-8')
print(result.stdout)
