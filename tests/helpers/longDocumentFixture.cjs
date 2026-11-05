const zlib = require('node:zlib');
const {zip} = require('./documentFixtures.cjs');

const fixtures=new Map();
function longDocumentFixture(width=1600,height=12000) {
  const key=`${width}x${height}`;
  if (fixtures.has(key)) return fixtures.get(key);
  const raw=Buffer.alloc((width*3+1)*height);
  const colors=[[212,88,88],[91,181,116],[72,139,189],[177,147,82],[155,103,179]];
  for(let y=0;y<height;y++)Buffer.alloc(width*3,Buffer.from(colors[Math.floor(y/(height/5))])).copy(raw,y*(width*3+1)+1);
  function crc32(data){let crc=-1;for(const b of data){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^-1)>>>0;}
  function chunk(type,data){const name=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([head,name,data,tail]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  const epub=zip([['mimetype','application/epub+zip'],['META-INF/container.xml','<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'],['content.opf','<package><metadata><meta name="fixed-layout" content="true"/></metadata><manifest><item id="p" href="p.xhtml" media-type="application/xhtml+xml"/><item id="i" href="long.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="p"/></spine></package>'],['p.xhtml',`<html><body><svg viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" xlink:href="long.png"/></svg></body></html>`],['long.png',png]],false);
  const fixture={png,epub,width,height};fixtures.set(key,fixture);return fixture;
}
module.exports={longDocumentFixture};
