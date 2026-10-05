/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 启动流程
 * ============================================================ */
(function (root) {
  'use strict';

  var WY = root.WY;
  var Store = root.WYStore;
  var Editor = root.WYEditor;

  function loadingEl(msg) {
    var e = document.getElementById('wy-loading') || document.querySelector('.wy-loading');
    if (e) e.textContent = msg;
    return e;
  }

  function hideLoading() {
    var e = document.getElementById('wy-loading') || document.querySelector('.wy-loading');
    if (e) e.remove();
  }

  function fatal(err) {
    console.error(err);
    hideLoading();
    var d = document.createElement('div');
    d.className = 'wy-welcome';
    var h = document.createElement('h1');
    h.textContent = '打不开了';
    var p = document.createElement('p');
    p.textContent = String(err && err.message || err);
    var tip = document.createElement('ul');
    [
      '如果是第一次打开，可能是浏览器不支持 IndexedDB。',
      '试试换成 Chrome / Edge 打开本页面。',
      '本工具的数据只存在本机，不会上传。'
    ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; tip.appendChild(li); });
    d.appendChild(h); d.appendChild(p); d.appendChild(tip);
    document.body.appendChild(d);
  }

  function welcome() {
    var prefs = Store.prefs();
    if (prefs.seenWelcome) return;
    Store.setPrefs({ seenWelcome: true });

    var standalone = false;
    try { standalone = root.matchMedia('(display-mode: standalone)').matches || root.navigator.standalone; } catch (e) {}

    var d = document.createElement('div');
    d.className = 'wy-welcome';

    var h = document.createElement('h1');
    h.textContent = '文游工坊';
    var p = document.createElement('p');
    p.textContent = '在手机上做文字冒险游戏，不用写代码。';
    d.appendChild(h);
    d.appendChild(p);

    var ul = document.createElement('ul');
    [
      '在「剧情」页写正文、加选项，故事就分岔了。',
      '在「素材」页传图片和音乐，选进场景里。',
      '在「变量」页做「好感度」这类数值，用条件控制剧情。',
      '做完点「导出可分享的游戏」，得到一个 HTML 文件，谁都能打开玩。'
    ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    d.appendChild(ul);

    if (!standalone) {
      var tip = document.createElement('p');
      tip.style.cssText = 'background:rgba(90,169,255,.12);border:1px solid rgba(90,169,255,.3);border-radius:12px;padding:12px;font-size:13px;';
      tip.textContent = '小提示：点浏览器菜单里的「添加到主屏幕」，它就会像 App 一样有图标、全屏打开，而且断网也能用。';
      d.appendChild(tip);
    }

    var b = document.createElement('button');
    b.className = 'wy-btn-ghost primary';
    b.type = 'button';
    b.style.cssText = 'justify-content:center;padding:14px;font-size:16px;';
    b.textContent = '开始创作';
    b.addEventListener('click', function () { d.remove(); });
    d.appendChild(b);

    document.body.appendChild(d);
  }

  function createFresh() {
    var p = WY.newProject();
    return Store.put(p).then(function () {
      Editor.load(p);
      return p;
    });
  }

  var booted = false;

  function boot() {
    // 幂等保护：某些环境（或脚本被重复载入）会触发多次 DOMContentLoaded，
    // 没有这道闸门就会渲染出两套界面。
    if (booted) return;
    booted = true;
    if (!Store.available()) { fatal(new Error('当前浏览器不支持 IndexedDB')); return; }

    var host = document.createElement('div');
    host.id = 'app-host';
    document.body.appendChild(host);

    Editor.init(host);
    root.WYIO.installDrop(Editor);

    // 记住最近编辑的工程
    var origLoad = Editor.load;
    Editor.load = function (p) {
      origLoad.call(Editor, p);
      try { Store.setPrefs({ lastProjectId: p.id }); } catch (e) {}
    };

    loadingEl('正在读取工程…');

    Store.summaries().then(function (list) {
      var prefs = Store.prefs();
      var target = null;
      if (prefs.lastProjectId) {
        target = list.filter(function (s) { return s.id === prefs.lastProjectId; })[0] || null;
      }
      if (!target && list.length) target = list[0];
      if (!target) return createFresh();
      return Store.get(target.id).then(function (p) {
        if (!p) return createFresh();
        Editor.load(WY.normalize(p));
      });
    }).then(function () {
      hideLoading();
      welcome();
    }).catch(fatal);
  }

  /* ---------------- 后台保存 / 生命周期 ---------------- */

  function flush() {
    if (Editor && Editor._dirty && Editor.project) {
      Editor.save(true);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flush();
  });
  root.addEventListener('pagehide', flush);
  root.addEventListener('beforeunload', flush);

  /* ---------------- PWA ---------------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    root.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        console.log('[wenyu] service worker 已注册:', reg.scope);
      }).catch(function (e) {
        console.warn('[wenyu] service worker 注册失败:', e.message);
      });
    });
  }

  /* ---------------- 全局错误提示 ---------------- */

  root.addEventListener('error', function (e) {
    if (!Editor || !Editor.toast) return;
    if (e && e.message) Editor.toast('出错了：' + e.message, 4000);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
