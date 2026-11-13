/* ES5 classic script: it must run even if the app module cannot parse. */
(function () {
  var timer;
  function show(message) {
    var root = document.getElementById('root');
    if (!root || root.textContent || root.children.length) return;
    var panel = document.createElement('section');
    panel.setAttribute('role', 'alert');
    panel.style.cssText = 'padding:32px 24px;color:#243344;background:#f5f2eb;line-height:1.7;font:16px sans-serif;min-height:100vh;box-sizing:border-box';
    var title = document.createElement('h2');
    title.textContent = 'OmiComic 未能启动';
    var detail = document.createElement('p');
    detail.textContent = message;
    var help = document.createElement('p');
    help.textContent = '安卓设备请从系统官方应用商店更新 Android System WebView 或 Chrome，然后重新打开。若仍失败，请向开发者提供设备型号、安卓版本及下方内核版本。无需卸载应用或清除阅读数据。';
    var version = document.createElement('p');
    var match = /(?:Chrome|Chromium)\/([0-9.]+)/.exec(navigator.userAgent);
    version.textContent = 'WebView / Chromium: ' + (match ? match[1] : '未知');
    var retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = '重新打开';
    retry.style.cssText = 'padding:10px 18px;font:inherit';
    retry.onclick = function () { window.location.reload(); };
    panel.appendChild(title);panel.appendChild(detail);panel.appendChild(help);panel.appendChild(version);panel.appendChild(retry);
    root.appendChild(panel);
    window.clearTimeout(timer);
  }
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target === window || (target && target.tagName === 'SCRIPT'))
      show('界面加载失败，可能是系统网页内核过旧或应用资源未正确加载。');
  }, true);
  window.addEventListener('unhandledrejection', function () {
    show('界面初始化失败，请重新打开后重试。');
  });
  timer = window.setTimeout(function () {
    show('界面未能完成初始化，请重新打开后重试。');
  }, 20000);
}());
