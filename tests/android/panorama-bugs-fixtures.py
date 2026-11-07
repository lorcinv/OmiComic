"""The same 64-page synthetic artwork in CBZ and PDF for scrolling checks."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile
root=Path(sys.argv[1] if len(sys.argv)>1 else '.cache/bug1187/fixtures');root.mkdir(parents=True,exist_ok=True)
image=(Path(__file__).resolve().parents[1]/'fixtures/images/panorama-800x1200.jpg').read_bytes()
with zipfile.ZipFile(root/'Panorama.cbz','w') as archive:
    for index in range(64):
        entry=zipfile.ZipInfo(f'{index+1:03}.jpg',(2026,11,7,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(entry,image)
objects=[b'',b'<< /Type /Catalog /Pages 2 0 R >>',b'',b'<< /Type /XObject /Subtype /Image /Width 800 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+str(len(image)).encode()+b' >>\nstream\n'+image+b'\nendstream']
kids=[]
for index in range(64):
    page=len(objects);kids.append(f'{page} 0 R');objects.append(b'');stream=len(objects)
    content=b'q 600 0 0 900 0 0 cm /Im0 Do Q'
    objects.append(f'<< /Length {len(content)} >>\nstream\n'.encode()+content+b'\nendstream')
    objects[page]=f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 900] /Resources << /XObject << /Im0 3 0 R >> >> /Contents {stream} 0 R >>'.encode()
objects[2]=f'<< /Type /Pages /Count 64 /Kids [{" ".join(kids)}] >>'.encode()
output=b'%PDF-1.4\n';offsets=[0]
for i,body in enumerate(objects[1:],1):offsets.append(len(output));output+=f'{i} 0 obj\n'.encode()+body+b'\nendobj\n'
offset=len(output)
output+=f'xref\n0 {len(objects)}\n0000000000 65535 f \n'.encode()+b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets[1:])+f'trailer\n<< /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{offset}\n%%EOF\n'.encode()
(root/'Panorama.pdf').write_bytes(output)
manifest=[{'name':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in (root/'Panorama.cbz',root/'Panorama.pdf')]
(root/'panorama-fixtures.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest))
