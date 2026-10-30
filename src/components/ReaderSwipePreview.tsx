import { useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { ImageAdjustments } from '../../electron/shared/readerPreferences';
import ReaderImageEffects from './ReaderImageEffects';
import ReaderCanvas from './ReaderCanvas';
import ReaderChapter from './ReaderChapter';

export interface SwipePreviewPage {index:number;name:string;url:string;width:number;height:number;canvas?:HTMLCanvasElement;html?:string;native?:boolean;error?:string|null}
function CanvasCopy({source,title,style,onReady,onBytes}:{source:HTMLCanvasElement;title:string;style:CSSProperties;onReady:()=>void;onBytes:(bytes:number)=>void}){
  const copy=useMemo(()=>document.createElement('canvas'),[source]);
  useLayoutEffect(()=>{copy.width=source.width;copy.height=source.height;const context=copy.getContext('2d');if(context){context.drawImage(source,0,0);onBytes(copy.width*copy.height*4);onReady();}return()=>{copy.width=copy.height=0;onBytes(0);};},[source,copy]);
  return <ReaderCanvas canvas={copy} title={title} style={style}/>;
}
export default function ReaderSwipePreview({pages,groupKey,sizes,adjustments,gammaId,onPrepared,onBytes,style,pan}:{pages:SwipePreviewPage[];groupKey:string;sizes:{width:number;height:number}[];adjustments:ImageAdjustments;gammaId:string;onPrepared:(key:string)=>void;onBytes:(key:string,bytes:number)=>void;style:CSSProperties;pan?:{x:number;y:number}}){
  const ready=useRef(new Set<string>()),notify=useRef(onPrepared);notify.current=onPrepared;
  const complete=(index:number,kind:'effects'|'content')=>{ready.current.add(`${index}:${kind}`);if(pages.every(page=>ready.current.has(`${page.index}:effects`)&&(page.native||page.error||ready.current.has(`${page.index}:content`))))notify.current(groupKey);};
  return <div className="reader-swipe-preview" aria-hidden="true" data-swipe-group={groupKey} style={style}>
    <div className="reader-swipe-group" style={pan?{translate:`${pan.x}px ${pan.y}px`}:undefined}>
      {pages.map((page,index)=>{const size=sizes[index];if(!size)return null;const imageStyle={width:size.width,height:size.height,maxWidth:'none',maxHeight:'none'};
        return <div key={page.index} data-swipe-page={page.index} style={{width:size.width,height:size.height}}><ReaderImageEffects settings={adjustments} gammaId={gammaId} sourceKey={`swipe:${groupKey}:${page.index}:${page.url}`} sourceWidth={page.width} sourceHeight={page.height} processable={!page.native&&!page.canvas&&!page.html&&!page.error} sampleable={!/\.gif$/i.test(page.name)} onPrepared={()=>complete(page.index,'effects')} onRasterBytes={bytes=>onBytes(`swipe:${page.index}`,bytes)}>
          {page.error?<div className="reader-page-error" role="alert">{page.error}</div>:page.native?<span className="reader-image reader-native-image" data-native-image={page.url} role="img" aria-label={page.name} style={imageStyle}/>:page.canvas?<CanvasCopy source={page.canvas} title={page.name} style={imageStyle} onReady={()=>complete(page.index,'content')} onBytes={bytes=>onBytes(`swipe-canvas:${page.index}`,bytes)}/>:page.html?<ReaderChapter html={page.html} width={page.width} height={page.height} title={page.name} style={imageStyle} onPrepared={()=>complete(page.index,'content')}/>:<img className="reader-image" src={page.url} alt={page.name} draggable={false} style={imageStyle} onLoad={async event=>{try{await event.currentTarget.decode();complete(page.index,'content');}catch{/* Retain the current complete page. */}}}/>}
        </ReaderImageEffects></div>;
      })}
    </div>
  </div>;
}
