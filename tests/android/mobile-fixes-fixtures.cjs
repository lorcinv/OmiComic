// Neutral images only; push into the dedicated disposable OmiSmoke emulator.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve('.cache/android-mobile-fixes-fixtures/Fixes116');
const image=path.resolve('.cache/android-update-fixtures/Update112/Pages/1.png');
const copy=(dir,name='1.png')=>{fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(image,path.join(dir,name));};
for(let i=1;i<=64;i++)copy(path.join(base,'Pages64'),i+'.png');
for(let i=1;i<=51;i++)copy(path.join(base,'Book'+String(i).padStart(2,'0')));
copy(path.join(base,'Branch','Sub','Comic'));
fs.mkdirSync(path.join(base,'ArchiveLeaf'),{recursive:true});
fs.copyFileSync('.cache/android-update-fixtures/Update112/Sorted.cbz',path.join(base,'ArchiveLeaf','Book.cbz'));
console.log(base);
