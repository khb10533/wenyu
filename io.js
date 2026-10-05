/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 导入 / 导出
 *   .wy    —— 工程文件（JSON），给装了本工具的人继续编辑
 *   .html  —— 独立游戏，任何人用浏览器打开就能玩，零安装
 * ============================================================ */
(function (root) {
  'use strict';

  var WY = root.WY;

  /* ---------------- 下载 / 分享 ---------------- */

  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 5000);
  }

  function canShareFiles() {
    try {
      if (!navigator.canShare || !navigator.share) return false;
      var f = new File([new Blob(['x'])], 'x.txt', { type: 'text/plain' });
      return navigator.canShare({ files: [f] });
    } catch (e) { return false; }
  }

  /** 优先给「分享给…」，否则直接下载 */
  function deliver(filename, blob, editor, note) {
    if (editor && editor.closeModal) editor.closeModal();

    if (canShareFiles()) {
      var body = editor.modal('导出成功');
      body.appendChild(el('div', 'wy-hint', note || ('已生成：' + filename)));

      var share = el('button', 'wy-menu-item');
      share.type = 'button';
      share.appendChild(document.createTextNode('📤  分享给…'));
      share.appendChild(el('small', null, '直接发到微信 / QQ / 其它应用'));
      share.addEventListener('click', function () {
        var file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        navigator.share({ files: [file], title: filename }).catch(function () {});
        editor.closeModal();
      });
      body.appendChild(share);

      var save = el('button', 'wy-menu-item');
      save.type = 'button';
      save.appendChild(document.createTextNode('💾  保存到手机'));
      save.appendChild(el('small', null, '一般会存到「下载」文件夹'));
      save.addEventListener('click', function () {
        download(filename, blob);
        editor.closeModal();
        if (editor.toast) editor.toast('已开始下载');
      });
      body.appendChild(save);
      return;
    }

    download(filename, blob);
    if (editor && editor.toast) editor.toast('已开始下载：' + filename, 2600);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------- 导出工程 .wy ---------------- */

  function exportProject(project, editor) {
    WY.touch(project);
    var text = JSON.stringify(project, null, 1);
    var name = WY.safeFileName(project.meta.title, 'game') + '.wy';
    var blob = new Blob([text], { type: 'application/json' });
    deliver(name, blob, editor, '工程文件 ' + name + '（' + WY.formatBytes(blob.size) + '）');
  }

  /* ---------------- 导出独立游戏 .html ---------------- */

  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('读取 ' + url + ' 失败（HTTP ' + r.status + '）');
      return r.text();
    });
  }

  function buildStandalone(project, formatJs, storeJs, stageJs, playerJs, fallbackCss, playerCss) {
    var title = (project.meta && project.meta.title) || '文字游戏';
    var author = (project.meta && project.meta.author) || '';
    var desc = (project.meta && project.meta.desc) || '';
    var theme = (project.config && project.config.theme) || {};

    // 防止正文里出现 </script> 把数据块截断
    var data = JSON.stringify(project).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
      '<meta name="theme-color" content="' + (theme.bg || '#0f1115') + '">',
      '<meta name="description" content="' + WY.escapeHtml(desc || title) + '">',
      '<meta name="author" content="' + WY.escapeHtml(author || '柳漪春涛') + '">',
      '<meta name="generator" content="文游工坊 · 柳漪春涛">',
      '<title>' + WY.escapeHtml(title) + '</title>',
      '<style>',
      'html,body{margin:0;padding:0;height:100%;background:' + (theme.bg || '#0f1115') + ';overflow:hidden;}',
      'body{-webkit-text-size-adjust:100%;}',
      '#game{position:fixed;inset:0;}',
      fallbackCss,
      playerCss,
      '</style>',
      '</head>',
      '<body>',
      '<div id="game"></div>',
      '<script id="wy-game-data" type="application/json">' + data + '<\/script>',
      '<script>',
      '(function(){try{window.__WY_GAME__=JSON.parse(document.getElementById("wy-game-data").textContent);}',
      'catch(e){document.getElementById("game").innerHTML=\'<div style="padding:40px;color:#e9edf2;font-family:sans-serif">游戏数据损坏：\'+e.message+\'</div>\';}})();',
      '<\/script>',
      '<script>' + formatJs + '<\/script>',
      '<script>' + storeJs + '<\/script>',
      '<script>' + stageJs + '<\/script>',
      '<script>' + playerJs + '<\/script>',
      (author ? '<script>/* 作者：' + author.replace(/\*\//g, '*\\/') + ' */<\/script>' : ''),
      '</body>',
      '</html>'
    ].join('\n');
  }

  function exportStandalone(project, editor) {
    if (editor && editor.toast) editor.toast('正在打包…');
    var st = WY.stats(project);
    Promise.all([
      fetchText('./format.js'),
      fetchText('./store.js'),
      fetchText('./stage.js'),
      fetchText('./player.js'),
      fetchText('./fallback.css'),
      fetchText('./player.css')
    ]).then(function (parts) {
      var html = buildStandalone(project, parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
      var name = WY.safeFileName(project.meta.title, 'game') + '.html';
      var blob = new Blob([html], { type: 'text/html' });
      deliver(name, blob, editor,
        '已生成 ' + name + '（' + WY.formatBytes(blob.size) + '，含 ' + st.nodes + ' 个场景）。' +
        '发给别人，用手机浏览器打开就能玩。');
    }).catch(function (e) {
      if (editor && editor.toast) editor.toast('打包失败：' + e.message, 4000);
      console.error(e);
    });
  }

  /* ---------------- 导入 ---------------- */

  function parseImported(text, filename) {
    var trimmed = text.replace(/^\uFEFF/, '').trim();

    // 独立游戏 HTML：优先找数据块
    if (/^</.test(trimmed)) {
      var m = trimmed.match(/<script[^>]*id=["']wy-game-data["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) throw new Error('这个 HTML 里没有找到文游数据块（可能不是本工具导出的游戏）');
      return { data: JSON.parse(m[1]), kind: 'game' };
    }

    // JSON 工程
    var obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('无法识别的文件格式');
    if (obj.format && obj.format !== WY.FORMAT) {
      throw new Error('这是别的工具的文件（format=' + obj.format + '），本工具打不开');
    }
    if (!Array.isArray(obj.nodes)) throw new Error('文件里没有找到场景数据，可能不是文游工程');
    return { data: obj, kind: 'project' };
  }

  function applyImport(text, filename, editor) {
    var parsed;
    try {
      parsed = parseImported(text, filename);
    } catch (e) {
      editor.toast('导入失败：' + e.message, 4000);
      return;
    }

    var project;
    try {
      project = WY.normalize(parsed.data);
    } catch (e) {
      editor.toast('导入失败：' + e.message, 4000);
      return;
    }

    // 总是当作新工程导入，避免覆盖手头这份
    var srcId = project.id;
    project.id = WY.uid('p');
    project.meta.createdAt = WY.nowISO();
    project.meta.updatedAt = WY.nowISO();

    root.WYStore.get(srcId).then(function (existing) {
      if (existing) project.meta.title = (project.meta.title || '未命名') + '（导入）';
      return root.WYStore.put(project);
    }).then(function () {
      editor.load(project);
      editor.setTab('story', true);
      var st = WY.stats(project);
      editor.toast('已导入：' + st.nodes + ' 个场景 · ' + st.chars + ' 字', 2600);
    }).catch(function (e) {
      editor.toast('保存失败：' + e.message, 4000);
    });
  }

  /** 从网址导入（给「把示例导入成我的工程」用） */
  function importFromUrl(url, editor) {
    if (editor && editor.toast) editor.toast('正在载入…', 1200);
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      applyImport(text, String(url).split('/').pop(), editor);
    }).catch(function (e) {
      if (!editor || !editor.toast) return;
      // 上线包故意不含 .wy 工程文件，所以线上点这个是会 404 的
      var msg = /404/.test(String(e.message))
        ? '这个站点没有附带示例工程文件（不影响正常使用）'
        : ('载入失败：' + e.message);
      editor.toast(msg, 4500);
    });
  }

  function pickImport(editor) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wy,.json,.html,.htm,application/json,text/html';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var f = (input.files || [])[0];
      input.remove();
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { applyImport(String(reader.result), f.name, editor); };
      reader.onerror = function () { editor.toast('读取文件失败'); };
      reader.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
  }

  /** 拖拽导入（桌面浏览器上也顺手） */
  function installDrop(editor) {
    ['dragover', 'drop'].forEach(function (evt) {
      document.addEventListener(evt, function (e) {
        if (evt === 'dragover') { e.preventDefault(); return; }
        e.preventDefault();
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () { applyImport(String(reader.result), f.name, editor); };
        reader.readAsText(f);
      });
    });
  }

  root.WYIO = {
    exportProject: exportProject,
    exportStandalone: exportStandalone,
    pickImport: pickImport,
    importFromUrl: importFromUrl,
    applyImport: applyImport,
    parseImported: parseImported,
    buildStandalone: buildStandalone,
    download: download,
    deliver: deliver,
    installDrop: installDrop
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.WYIO;
})(typeof globalThis !== 'undefined' ? globalThis : this);
