const fs=require('node:fs'),path=require('node:path');
// Small, original pages keep the gesture fixture independent of book content.
function pdf(count=100){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let index=0;index<count;index++){
    const page=objects.length+1,stream=page+1;kids.push(page+' 0 R');
    const content=`0.85 0.9 0.96 rg 0 0 400 600 re f BT /F1 30 Tf 0.15 0.25 0.4 rg 50 300 Td (Omi preview ${index+1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
  let result='%PDF-1.4\n',offsets=[0];
  for(let index=0;index<objects.length;index++){offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${objects[index]}\nendobj\n`;}
  const start=Buffer.byteLength(result);result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(result);
}
if(require.main===module){const target=path.resolve(process.argv[2]||'.cache/omi1173/Preview1173.pdf');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,pdf());console.log(target);}
module.exports={pdf};
