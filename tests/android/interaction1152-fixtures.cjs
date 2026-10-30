const fs=require('node:fs'),path=require('node:path');
const {mobiFixture}=require('../helpers/mobiFixture.cjs');
const {zip}=require('../helpers/documentFixtures.cjs');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC','base64');
fs.writeFileSync(path.join(out,'Reader1152.mobi'),mobiFixture(['<p>第 1 页</p><img recindex="1">','<h1>第二章</h1><p>你好，Omi。原始文件保持不变。</p>'],[png]));
fs.writeFileSync(path.join(out,'Reader1152.epub'),zip([
 ['META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'],
 ['book.opf','<package><manifest><item id="p" href="page.xhtml" media-type="application/xhtml+xml"/><item id="i" href="page.png" media-type="image/png"/></manifest><spine><itemref idref="p"/></spine></package>'],
 ['page.xhtml','<html><head></head><body><p>第 52 页</p><img src="page.png"/></body></html>'],['page.png',png]
]));
