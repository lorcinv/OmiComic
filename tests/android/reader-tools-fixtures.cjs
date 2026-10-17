// Additional disposable fixtures within the already-authorized OmiSmoke test library.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {zip}=require('../helpers/documentFixtures.cjs');
const base=path.resolve('.cache/android-update-fixtures/Update112');
fs.mkdirSync(path.join(base,'Pages'),{recursive:true});
for(const [name,source,date] of [['1.png','01.png','2022-01-01'],['2.png','02.png','2020-01-01'],['10.png','03.png','2021-01-01']]){
  const target=path.join(base,'Pages',name);
  fs.copyFileSync(path.join('.cache/android-fixtures/Picture Book',source),target);
  const time=new Date(date+'T12:00:00Z');fs.utimesSync(target,time,time);
}
const archive=path.join(base,'Sorted.cbz');
if(fs.existsSync(archive))fs.unlinkSync(archive);
execFileSync(require('7zip-bin-full').path7z,['a','-tzip',archive,'1.png','2.png','10.png'],{cwd:path.join(base,'Pages'),stdio:'pipe'});
fs.mkdirSync(path.join(base,'Collection','Child'),{recursive:true});
fs.copyFileSync(path.join(base,'Pages/1.png'),path.join(base,'Collection/Child/1.png'));
fs.copyFileSync(archive,path.join(base,'Collection/Book.cbz'));
fs.copyFileSync(path.join(base,'Pages/2.png'),path.join(base,'Collection/page.png'));
fs.writeFileSync(path.join(base,'Collection/notes.txt'),'Not a comic');
fs.copyFileSync('tests/fixtures/documents/three-pages.pdf',path.join(base,'Document.pdf'));
fs.writeFileSync(path.join(base,'Covered.epub'),zip([
  ['META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
  ['OPS/book.opf','<package><manifest><item id="cover" href="cover.png" properties="cover-image"/><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'],
  ['OPS/cover.png',fs.readFileSync(path.join(base,'Pages/1.png'))],
  ['OPS/a.xhtml','<h1>Android Chapter One</h1><p>Display adjustments</p>'],
  ['OPS/b.xhtml','<h1>Android Chapter Two</h1>'],
]));
console.log(base);
