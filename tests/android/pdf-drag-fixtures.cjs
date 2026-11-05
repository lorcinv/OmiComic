const fs=require('node:fs'),zlib=require('node:zlib');
const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const kids=[];
for(let n=0;n<6;n++){
  const [w,h]=[[1024,1024],[1920,1080],[600,850],[4000,2500],[1400,2000],[1920,1080]][n],page=objects.length;objects.push(null);const stream=objects.length;
  let content=`1 1 1 rg 0 0 ${w} ${h} re f\n`;
  for(let i=0;i<5000;i++){const x=((i*37)%1000)/1000*w,y=((i*71)%1000)/1000*h;content+=`${(i%100)/100} ${((i*3)%100)/100} ${((i*7)%100)/100} RG 0.35 w ${x.toFixed(2)} ${y.toFixed(2)} m ${(x+w*.05).toFixed(2)} ${(y+h*.06).toFixed(2)} ${(x-w*.1).toFixed(2)} ${(y+h*.03).toFixed(2)} ${(x+w*.12).toFixed(2)} ${(y+h*.09).toFixed(2)} c S\n`;}
  content+=`0 0 0 rg BT /F1 36 Tf 50 100 Td (Complex small PDF page ${n+1}) Tj ET`;
  const data=zlib.deflateSync(Buffer.from(content));objects.push(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`),data,Buffer.from('\nendstream')]));
  objects[page]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`;kids.push(`${page} 0 R`);
}
objects[2]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
for(let i=1;i<objects.length;i++){offsets.push(length);const value=Buffer.concat([Buffer.from(`${i} 0 obj\n`),Buffer.isBuffer(objects[i])?objects[i]:Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);chunks.push(value);length+=value.length;}
chunks.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
fs.writeFileSync(process.argv[2]||'Complex.pdf',Buffer.concat(chunks));
