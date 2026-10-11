// Generated disposable documents; never point the device test at a personal library.
const fs = require('node:fs');
const { Resvg } = require('@resvg/resvg-js');
const { zip } = require('../helpers/documentFixtures.cjs');
const directory = '.cache/android-fixtures';
fs.mkdirSync(`${directory}/Picture Book`, { recursive: true });
const images = [1, 2, 3].map(index => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="${['#e2e8ee','#d2dedf','#e9dfd1'][index-1]}"/><rect x="70" y="70" width="660" height="1060" rx="30" fill="none" stroke="#586c82" stroke-width="3"/><text x="400" y="350" text-anchor="middle" font-family="Arial" font-size="56" fill="#455d76">OmiComic</text><text x="400" y="650" text-anchor="middle" font-family="Arial" font-size="180" fill="#455d76">0${index}</text><text x="400" y="870" text-anchor="middle" font-family="Arial" font-size="28" fill="#455d76">ANDROID READING TEST</text></svg>`;
  const image = new Resvg(svg).render().asPng();
  fs.writeFileSync(`${directory}/Picture Book/0${index}.png`, image);
  return [`0${index}.png`, image];
});
fs.writeFileSync(`${directory}/Comic.cbz`, zip(images));
fs.writeFileSync(`${directory}/Disposable.cbz`, zip(images.slice(0,1)));
fs.copyFileSync('tests/fixtures/documents/three-pages.pdf', `${directory}/Document.pdf`);
fs.writeFileSync(`${directory}/Story.epub`, zip([
  ['META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
  ['OPS/book.opf','<package><metadata><title>Omi &amp; Comic</title></metadata><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'],
  ['OPS/a.xhtml','<h1>Android Chapter One</h1><p>Offline EPUB</p><script>window.top.hacked=true</script>'],
  ['OPS/b.xhtml','<h1>Android Chapter Two</h1><p>Progress saved</p>'],
]));
fs.writeFileSync(`${directory}/Unsafe.epub`, zip([
  ['META-INF/container.xml','<!DOCTYPE container [<!ENTITY xxe SYSTEM "file:///system/build.prop">]><container><rootfiles><rootfile full-path="&xxe;"/></rootfiles></container>'],
]));
console.log(directory);
