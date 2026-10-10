export function installMock({count}: {count:number}) {

  const ok = (data: any) => ({ok:true,data});
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC';
  const settings = {cardSize:'medium',pageSize:60,sortMode:'name-asc',sortDirection:'asc',folderFirst:true,hideBookshelfItemsInLibrary:false,showProgressBar:true,showProgressText:true,progressTextMode:'page',progressBarThickness:'normal',readerDefaultFitMode:'fit-height',readerPageMode:'single',readerDefaultFlow:'horizontal',readerDefaultPanorama:false,readerDefaultImmersive:false,doublePageFirstSingle:true,doublePageDirection:'left-to-right',smartDetectSpreadPage:true,wheelPageTurn:true,immersiveAutoHide:false,immersiveAutoHideDelay:3000,readerHideFooterControls:false,readerHideImmersiveProgress:false,readerMemoryCacheSizeMb:64,readerPreloadPages:2,readerImageLoadConcurrency:4,bookSwitchButtonOpacity:40,organizeDrawerOpacity:90,bookshelfNoteHoverDelayMs:1000,recentOpenedLimit:50,tagSearchMode:'fuzzy',confirmBeforeDeleteTags:true,confirmBeforeBatchDelete:{favorites:true,bookmarks:true,recent:true}};
  const recent = ['First','Second','Third','Fourth'].map((title,i)=>({resourceKey:`folder:/comics/${title}`,sourcePath:`/comics/${title}`,sourceType:'folder',title,currentPageIndex:i,totalPages:count,updatedAt:Date.now()-i}));
  const data = {version:1,library:{roots:[{path:'/comics',name:'Comics',addedAt:0,lastOpenedAt:0}],lastActiveRootPath:'/comics',lastCurrentPath:'/comics'},settings,readingProgress:{},recentOpened:recent,removedRecentResourceKeys:[],favorites:[],bookmarks:[],resourceMeta:{},tagOrder:[],bookshelves:[],virtualFolders:[]};
  const file=(name:string,type='folder',base='/comics')=>({id:`${base}/${name}`,path:`${base}/${name}`,name,type,extension:type==='image'?'png':'',size:68,modifiedAt:0});
  const items=[file('Parent'),file('Book'),...Array.from({length:count},(_,i)=>file(`page${i}.png`,'image'))];
  const pages=Array.from({length:count},(_,index)=>({index,name:`page${index}.png`,sourcePath:`/comics/Book/page${index}.png`,type:'folder-image'}));
  (window as any).__previewCalls=0;(window as any).__saved=[];
  (window as any).omicomic = new Proxy({
   takeExternalOpen:async()=>ok(null),onExternalOpen:()=>()=>{},
   getAppInfo:async()=>({name:'OmiComic',version:'test',platform:'linux'}),getAppData:async()=>ok(data),
   updateSettings:async(input:any)=>{Object.assign(settings,input);return ok(settings);},
   getThumbnail:async()=>ok({url:image}),getReadablePageCount:async()=>ok(count),getReadingProgress:async()=>ok(null),
   listDirectory:async(path:string)=>ok({path,parentPath:path==='/comics'?null:'/comics',items:path==='/comics'?items:[file('Nested','folder',path)],total:path==='/comics'?items.length:1}),
   getResourcePages:async({path}:any)=>path.includes('Parent')?{ok:false,error:{code:'NO_IMAGES',message:'未在该文件夹中找到可阅读图片。'}}:ok({key:`folder:${path}`,resourceKey:`folder:${path}`,title:'Book',sourcePath:path,sourceType:'folder',pages,total:pages.length}),
   getPageImage:async(input:any)=>{if(input.preview)(window as any).__previewCalls++;return ok({url:image,width:800,height:1200});},
   checkResourcePath:async({path}:any)=>ok({path,exists:true,readable:true}),
   saveReadingProgress:async(input:any)=>{(window as any).__saved.push(input);return ok(input);},
   updateResourceMeta:async(input:any)=>{data.resourceMeta[input.resourceKey]=input;return ok(input);},
   getRecentOpened:async()=>ok(recent),getFavorites:async()=>ok([]),getBookmarks:async()=>ok([]),
   isWindowMaximized:async()=>ok(false),isFullscreen:async()=>ok(false),
  },{get(target:any,key:string){return target[key]||(()=>Promise.resolve(ok(null)));}});

}
