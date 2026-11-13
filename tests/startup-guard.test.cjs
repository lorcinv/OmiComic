const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const script=readFileSync('public/boot-guard.js','utf8');
function setup(html='<div id="root"></div>') {
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://omi.local/index.html'});
  dom.window.eval(script);return dom;
}
test('a module error before React displays actionable recovery without exposing raw errors',()=>{
  const dom=setup();dom.window.dispatchEvent(new dom.window.ErrorEvent('error',{message:'private/path'}));
  assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/WebView/);
  assert.ok(!dom.window.document.body.textContent.includes('private/path'));dom.window.close();
});
test('resource load errors show recovery; later application errors do not overwrite a mounted reader',()=>{
  const dom=setup();const element=dom.window.document.createElement('script');dom.window.document.body.append(element);element.dispatchEvent(new dom.window.Event('error'));
  assert.ok(dom.window.document.querySelector('[role="alert"]'));dom.window.close();
  const loaded=setup('<div id="root"><main>Reader</main></div>');loaded.window.dispatchEvent(new loaded.window.ErrorEvent('error'));
  assert.equal(loaded.window.document.getElementById('root').textContent,'Reader');loaded.window.close();
});
