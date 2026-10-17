const fs=require('node:fs'),path=require('node:path');
const base=path.resolve('.cache/android-mobile-fixtures/Mobile113');
const page=path.resolve('.cache/android-update-fixtures/Update112/Pages/1.png');
function chain(root,depth){let current=path.join(base,root);for(let i=1;i<=depth;i++)current=path.join(current,'L'+String(i).padStart(2,'0'));fs.mkdirSync(current,{recursive:true});fs.copyFileSync(page,path.join(current,'cover.png'));}
chain('Deep24',24);chain('Wide120/Z-last',12);
for(let i=0;i<120;i++){const dir=path.join(base,'Wide120','Empty'+String(i).padStart(3,'0'));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'readme.txt'),'No readable pages.');}
fs.mkdirSync(path.join(base,'Pages'),{recursive:true});
for(let i=1;i<=12;i++)fs.copyFileSync(page,path.join(base,'Pages',i+'.png'));
console.log(base);
