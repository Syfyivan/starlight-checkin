/* Deliberately a classic ES5 script: still works if an app module cannot parse. */
(function () {
  'use strict';
  var finished = false, failure = '', timer;
  function isLoading() { return document.getElementById('startup-loading'); }
  function show(reason) {
    if (finished) return;
    var box = isLoading();
    if (!box) return;
    clearTimeout(timer);
    var title = document.getElementById('startup-message');
    var hint = document.getElementById('startup-hint');
    var core = /(?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent);
    var old = core && Number(core[1]) < 80;
    title.textContent = old ? '手机的网页组件需要更新一下' : '小屋这次没能打开';
    hint.textContent = old
      ? '请在手机应用商店更新 Android System WebView（安卓系统网页组件）。也可以先用手机浏览器打开小屋。'
      : reason === 'timeout'
        ? '加载等得有点久，换个网络或重新连接试试。'
        : '页面没有顺利启动，请重新连接；仍打不开时，可以先用手机浏览器进入。';
    document.getElementById('startup-actions').hidden = false;
    document.getElementById('startup-detail').textContent = '启动提示：' + (old ? 'webview-old' : reason) + (core ? ' · 内核 ' + core[1] : '');
  }
  function fail(reason) { failure = reason; if (document.readyState !== 'loading') show(reason); }
  window.StarlightStartup = { ready: function () { finished = true; clearTimeout(timer); } };
  window.addEventListener('error', function (event) {
    if ((event.target && event.target.tagName === 'SCRIPT') || event.error || event.message) fail('script');
  }, true);
  window.addEventListener('unhandledrejection', function () { fail('script'); });
  document.addEventListener('DOMContentLoaded', function () {
    var retry = document.getElementById('startup-retry');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
    var address = document.getElementById('startup-url');
    if (address) address.value = location.origin + location.pathname;
    if (failure) show(failure);
  });
  timer = setTimeout(function () { show('timeout'); }, 30000);
}());
