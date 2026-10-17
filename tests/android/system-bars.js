const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await window.omicomic.updateSettings({colorTheme:'night'});
document.documentElement.dataset.colorTheme='night';
await pause(1200);
window.__omiShot='android118-night-system-bars';
while(window.__omiShot)await pause(80);
return {theme:document.documentElement.dataset.colorTheme};
