import {test,expect,type Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const railOf=(page:Page)=>page.locator('.mobile-reader-filmstrip');
async function setup(page:Page){
  await page.goto('/tests/fixtures/filmstrip.html');
  await expect(railOf(page)).toBeVisible();
  await expect.poll(()=>railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(1920,0);
  await page.evaluate(()=>{
    (window as any).__scrollTrace=[];(window as any).__scrollAt=performance.now();(window as any).__nativePans=0;(window as any).__seeks=[];
    const rail=document.querySelector('.mobile-reader-filmstrip') as HTMLElement,scrollTo=rail.scrollTo.bind(rail);
    rail.scrollTo=(...args:any[])=>{(window as any).__seeks.push(args);(scrollTo as any)(...args);};
    rail.addEventListener('pointercancel',()=>{(window as any).__nativePans++;});
    rail.addEventListener('scroll',event=>{
      (window as any).__scrollAt=performance.now();
      (window as any).__scrollTrace.push((event.target as HTMLElement).scrollLeft);
    });
  });
}
async function swipe(page:Page,{from=.85,to=.15,duration=96,hold=0}={}){
  const rail=railOf(page),before=await rail.evaluate(el=>el.scrollLeft),r=(await rail.boundingBox())!;
  const session=await page.context().newCDPSession(page),y=r.y+r.height*.4,steps=Math.max(4,Math.round(duration/16));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*from,y}]});
  for(let i=1;i<=steps;i++){
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*(from+(to-from)*i/steps),y}]});
    await page.waitForTimeout(duration/steps);
  }
  if(hold)await page.waitForTimeout(hold);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const released=await rail.evaluate(el=>el.scrollLeft);await session.detach();
  return {before,released};
}
async function settle(page:Page){
  await page.waitForFunction(()=>performance.now()-(window as any).__scrollAt>220);
  return railOf(page).evaluate(el=>el.scrollLeft);
}
async function selectedFollows(page:Page){
  await expect.poll(()=>railOf(page).evaluate(el=>{
    const r=el.getBoundingClientRect(),p=el.querySelector('[aria-pressed="true"]')?.getBoundingClientRect();
    return p?Math.abs(p.x+p.width/2-r.x-r.width/2):999;
  })).toBeLessThanOrEqual(48.5);
}

test('fast touch scrolling stays native and does not schedule a release seek',async({page})=>{
  await setup(page);const {before,released}=await swipe(page);
  const stopped=await settle(page);
  expect(released-before).toBeGreaterThan(96);
  expect(stopped).toBeGreaterThanOrEqual(released);
  expect(await page.evaluate(()=>(window as any).__nativePans)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).__seeks)).toEqual([]);
  await selectedFollows(page);
  expect(await page.locator('.mobile-filmstrip-page').count()).toBeLessThan(15);
  const trace=await page.evaluate(()=>(window as any).__scrollTrace as number[]);
  expect(trace.every((left,i)=>i===0||left>=trace[i-1]-1)).toBe(true);
  await page.screenshot({path:'test-results/filmstrip-native-fling.png'});
});

test('a held drag stops where released without snapping or a delayed recenter',async({page})=>{
  await setup(page);const {released}=await swipe(page,{duration:320,hold:240});
  expect(Math.abs(released/96-Math.round(released/96))).toBeGreaterThan(.05);
  expect(await settle(page)).toBeCloseTo(released,0);
  await page.waitForTimeout(600);
  expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(released,0);
  await selectedFollows(page);
});

test('successive fast flicks and a reverse flick remain responsive during slow reader updates',async({page})=>{
  await setup(page);await page.evaluate(()=>{(window as any).__delay=400;(window as any).__paired=true;});
  const start=await railOf(page).evaluate(el=>el.scrollLeft);
  for(let i=0;i<3;i++)await swipe(page);
  const forward=await settle(page);expect(forward-start).toBeGreaterThan(6*96);
  const {before,released}=await swipe(page,{from:.15,to:.85});
  const reversed=await settle(page);
  expect(before-released).toBeGreaterThan(96);expect(reversed).toBeLessThan(before-192);
  await page.waitForTimeout(600);
  expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(reversed,0);
  await selectedFollows(page);
});

test('external progress jumps interrupt inertia and keep the first and last pages reachable',async({page})=>{
  await setup(page);await swipe(page);
  for(const index of[1900,2499,0,1600,1]){
    await page.evaluate(index=>(window as any).__jump(index),index);
    await expect.poll(()=>railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(index*96,0);
    await page.waitForTimeout(180);
    expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(index*96,0);
    await selectedFollows(page);
  }
});

test('mouse dragging still moves the strip without a release snap',async({page})=>{
  await setup(page);const r=(await railOf(page).boundingBox())!,before=await railOf(page).evaluate(el=>el.scrollLeft);
  await page.mouse.move(r.x+r.width*.8,r.y+r.height*.4);await page.mouse.down();
  await page.mouse.move(r.x+r.width*.2,r.y+r.height*.4,{steps:12});await page.mouse.up();
  expect(await settle(page)).toBeGreaterThan(before+96);await selectedFollows(page);
});
test('late panorama feedback cannot pull a manually positioned strip back and external turns use a tolerant band',async({page})=>{
  await setup(page);const {released}=await swipe(page,{duration:320,hold:240});await settle(page);
  await page.waitForTimeout(250);await page.evaluate(()=>(window as any).__report(15));await page.waitForTimeout(400);
  expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(released,0);
  await page.mouse.click(300,300);await page.evaluate(()=>(window as any).__report(30));
  await expect.poll(()=>railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(29*96,0);
  expect(await railOf(page).locator('[aria-pressed="true"]').getAttribute('aria-label')).toContain('31');
});
test('the tolerant band keeps a large selected thumbnail entirely on screen',async({page})=>{
  await setup(page);await page.evaluate(()=>(window as any).__width(240));await page.waitForTimeout(100);
  await page.evaluate(()=>(window as any).__report(30));await expect(railOf(page).locator('[aria-pressed="true"]')).toHaveAttribute('aria-label',/第 31 页/);
  const selected=(await railOf(page).locator('[aria-pressed="true"]').boundingBox())!,r=(await railOf(page).boundingBox())!;
  expect(selected.x).toBeGreaterThanOrEqual(r.x);expect(selected.x+selected.width).toBeLessThanOrEqual(r.x+r.width);
});
test('a progress tap stays centered while the previous body page is finishing',async({page})=>{
  await setup(page);await page.evaluate(()=>(window as any).__pendingJump(75));await page.waitForTimeout(150);
  expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(75*96,0);
  await page.waitForTimeout(300);expect(await railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(75*96,0);
  const next=railOf(page).getByRole('button',{name:'第 75 页：74.png',exact:true});await next.tap();
  await expect.poll(()=>railOf(page).evaluate(el=>el.scrollLeft)).toBeCloseTo(74*96,0);
});
