const { Resvg } = require('@resvg/resvg-js');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'resources/icon.svg'));
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = sizes.map(width => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((png, index) => {
  const position = 6 + index * 16;
  header[position] = sizes[index] === 256 ? 0 : sizes[index];
  header[position + 1] = header[position];
  header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(png.length, position + 8); header.writeUInt32LE(offset, position + 12);
  offset += png.length;
});
fs.writeFileSync(path.join(root, 'resources/icon.ico'), Buffer.concat([header, ...images]));
fs.writeFileSync(path.join(root, 'resources/icon.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng());
console.log('Generated OmiComic icon: SVG, 512px PNG, multi-resolution Windows ICO.');

const icnsParts = [[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']].map(([width, type]) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  const chunk = Buffer.alloc(8); chunk.write(type); chunk.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([chunk, png]);
});
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8 + icnsParts.reduce((n,b)=>n+b.length,0),4);
fs.writeFileSync(path.join(root, 'resources/icon.icns'), Buffer.concat([icnsHeader, ...icnsParts]));
