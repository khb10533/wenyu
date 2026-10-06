/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 编辑器
 * 剧情卡片 / 素材 / 变量 / 设置 / 试玩 五个页签。
 * ============================================================ */
(function (root) {
  'use strict';

  var WY = root.WY;
  var Store = root.WYStore;

  /* ---------------- DOM 小工具 ---------------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function btn(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }

  function sel(pairs, value, onchange) {
    if (!Array.isArray(pairs)) throw new TypeError('sel(): 第一个参数必须是选项数组，收到 ' + typeof pairs);
    var s = el('select', 'wy-select');
    pairs.forEach(function (p) {
      var o = document.createElement('option');
      o.value = String(p[0]);
      o.textContent = p[1];
      if (String(p[0]) === String(value)) o.selected = true;
      s.appendChild(o);
    });
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }

  function inp(value, oninput, ph) {
    var i = el('input', 'wy-input');
    i.type = 'text';
    i.value = value == null ? '' : String(value);
    if (ph) i.placeholder = ph;
    i.addEventListener('input', function () { oninput(i.value); });
    return i;
  }

  function area(value, oninput, ph) {
    var a = el('textarea', 'wy-area');
    a.value = value == null ? '' : String(value);
    if (ph) a.placeholder = ph;
    a.addEventListener('input', function () {
      oninput(a.value);
      a.style.height = 'auto';
      a.style.height = Math.max(120, a.scrollHeight) + 'px';
    });
    return a;
  }

  function field(label, control, hint) {
    var f = el('div', 'wy-field');
    if (label) f.appendChild(el('label', 'wy-label', label));
    if (control) f.appendChild(control);
    if (hint) f.appendChild(el('div', 'wy-hint', hint));
    return f;
  }

  function section(title) {
    return el('div', 'wy-section-title', title);
  }

  /* ========================================================== */

  var Editor = {
    project: null,
    tab: 'story',
    host: null,
    viewEl: null,
    titleEl: null,
    player: null,
    _saveTimer: null,
    _dirty: false
  };

  /* ---------------- 初始化 ---------------- */

  Editor.init = function (host) {
    var self = this;
    this.host = host;

    var app = el('div', 'wy-app');

    var top = el('div', 'wy-topbar');
    var btnLib = btn('wy-icon-btn', '☰');
    btnLib.title = '工程库';
    btnLib.addEventListener('click', function () { self.openLibrary(); });
    top.appendChild(btnLib);

    this.titleEl = el('div', 'wy-topbar-title', '');
    top.appendChild(this.titleEl);

    var btnMore = btn('wy-icon-btn', '⋯');
    btnMore.title = '更多';
    btnMore.addEventListener('click', function () { self.openMore(); });
    top.appendChild(btnMore);
    app.appendChild(top);

    this.viewEl = el('div', 'wy-view');
    app.appendChild(this.viewEl);

    var bar = el('div', 'wy-tabbar');
    var tabs = [
      ['story', '📖', '剧情'],
      ['chars', '🎭', '角色'],
      ['assets', '🖼', '素材'],
      ['vars', '🔢', '变量'],
      ['codex', '📚', '图鉴'],
      ['config', '⚙', '设置'],
      ['play', '▶', '试玩']
    ];
    this.tabBtns = {};
    tabs.forEach(function (t) {
      var b = btn('wy-tab');
      b.appendChild(el('i', null, t[1]));
      b.appendChild(el('span', null, t[2]));
      b.addEventListener('click', function () { self.setTab(t[0]); });
      self.tabBtns[t[0]] = b;
      bar.appendChild(b);
    });
    app.appendChild(bar);

    host.innerHTML = '';
    host.appendChild(app);

    this.layer = el('div');
    this.layer.id = 'wy-layer';
    document.body.appendChild(this.layer);

    var tw = el('div', 'wy-toast-wrap');
    this.toastWrap = tw;
    document.body.appendChild(tw);
  };

  /* ---------------- 工程载入 / 保存 ---------------- */

  Editor.load = function (project) {
    this.project = project;
    this.setTab('story', true);
    this.updateTitle();
  };

  Editor.updateTitle = function () {
    if (!this.project) return;
    this.titleEl.innerHTML = '';
    this.titleEl.appendChild(document.createTextNode((this.project.meta && this.project.meta.title) || '未命名'));
    var st = WY.stats(this.project);
    this.titleEl.appendChild(el('small', null, st.nodes + ' 个场景 · ' + st.chars + ' 字 · ' + st.endings + ' 个结局'));
  };

  Editor.save = function (immediate) {
    var self = this;
    if (!this.project) return;
    WY.touch(this.project);
    this._dirty = true;
    this.updateTitle();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    var doIt = function () {
      self._saveTimer = null;
      var p = self.project;
      Store.put(p).then(function () {
        self._dirty = false;
      }).catch(function (e) {
        self.toast('保存失败：' + e.message);
      });
    };
    if (immediate) doIt();
    else this._saveTimer = setTimeout(doIt, 500);
  };

  Editor.toast = function (msg, ms) {
    var t = el('div', 'wy-toast', msg);
    this.toastWrap.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2000);
  };

  /* ---------------- 页签 ---------------- */

  /**
   * 关掉所有全屏浮层（场景编辑、舞台编辑器、弹窗）。
   * 切页签时必须清一下，否则从舞台编辑器跳去「角色」页时，
   * 场景浮层会压在新页面上，看着像「点了没反应」。
   */
  Editor.closeAllSheets = function () {
    // 注意：场景浮层是挂在 document.body 上的（不是 #wy-layer），
    // 只扫 layer 会漏掉它，切页签后就会有一层场景浮层压着新页面。
    var roots = [document.body];
    if (this.layer) roots.push(this.layer);
    var sel = '.wy-sheet-full, .wy-modal-mask, .wy-help';
    roots.forEach(function (r) {
      Array.prototype.slice.call(r.querySelectorAll(sel)).forEach(function (e) { e.remove(); });
    });
  };

  Editor.setTab = function (tab, force) {
    if (this.tab === tab && !force) return;
    if (this.tab === 'play' && tab !== 'play') this.teardownPlayer();
    this.closeAllSheets();
    this.tab = tab;
    Object.keys(this.tabBtns).forEach(function (k) {
      this.tabBtns[k].classList.toggle('on', k === tab);
    }, this);
    this.render();
  };

  Editor.render = function () {
    if (!this.project) return;
    var v = this.viewEl;
    v.innerHTML = '';
    v.scrollTop = 0;
    if (this.tab === 'story') this.renderStory(v);
    else if (this.tab === 'chars') this.renderChars(v);
    else if (this.tab === 'assets') this.renderAssets(v);
    else if (this.tab === 'vars') this.renderVars(v);
    else if (this.tab === 'codex') this.renderCodex(v);
    else if (this.tab === 'config') this.renderConfig(v);
    else if (this.tab === 'play') this.renderPlay(v);
  };

  /* ---------------- 剧情列表 ---------------- */

  Editor.brokenNodeIds = function () {
    var map = {};
    WY.validate(this.project).forEach(function (i) {
      if (i.nodeId && i.level === 'error') map[i.nodeId] = true;
    });
    return map;
  };

  Editor.renderStory = function (v) {
    var self = this;
    var p = this.project;

    var bar = el('div', 'wy-row wrap');
    bar.style.marginBottom = '14px';
    var add = btn('wy-btn-ghost primary', '＋ 新场景');
    add.addEventListener('click', function () {
      var n = WY.newNode({ title: '', text: '' });
      p.nodes.push(n);
      self.save(true);
      self.openNode(n.id);
      self.render();
    });
    bar.appendChild(add);

    var chk = btn('wy-btn-ghost', '✓ 检查');
    chk.addEventListener('click', function () { self.showValidation(); });
    bar.appendChild(chk);

    var last = btn('wy-btn-ghost', '结尾');
    last.addEventListener('click', function () {
      if (p.nodes.length) self.openNode(p.nodes[p.nodes.length - 1].id);
    });
    bar.appendChild(last);
    v.appendChild(bar);

    if (!p.nodes.length) {
      v.appendChild(el('div', 'wy-empty-box', '还没有场景，点上面的「＋ 新场景」开始吧。'));
      return;
    }

    var broken = this.brokenNodeIds();

    p.nodes.forEach(function (n, i) {
      var card = el('div', 'wy-card');
      if (n.id === p.config.startNode) card.classList.add('is-start');
      if (broken[n.id]) card.classList.add('is-broken');

      var head = el('div', 'wy-card-head');
      head.appendChild(el('span', 'wy-card-no', '#' + (i + 1)));
      head.appendChild(el('span', 'wy-card-title', n.title || WY.firstLine(n.text) || '空场景'));
      card.appendChild(head);

      if (n.text) card.appendChild(el('div', 'wy-card-text', n.text));

      var tags = el('div', 'wy-card-tags');
      if (n.id === p.config.startNode) tags.appendChild(el('span', 'wy-badge wy-ok', '开场'));
      if (n.ending) tags.appendChild(el('span', 'wy-badge', '结局'));
      if (n.choices && n.choices.length) tags.appendChild(el('span', 'wy-badge', n.choices.length + ' 个选项'));
      else if (n.autoNext) tags.appendChild(el('span', 'wy-badge', '自动继续'));
      else if (!n.ending) tags.appendChild(el('span', 'wy-badge wy-err', '无出路'));
      var actorN = (n.stage && n.stage.actors) ? n.stage.actors.length : 0;
      if (actorN) tags.appendChild(el('span', 'wy-badge', '🎭 ' + actorN));
      if (n.speaker) tags.appendChild(el('span', 'wy-badge', n.speaker));
      if (n.bg) tags.appendChild(el('span', 'wy-badge', '🖼'));
      if (n.bgm) tags.appendChild(el('span', 'wy-badge', '♪'));
      if (broken[n.id]) tags.appendChild(el('span', 'wy-badge wy-err', '有错误'));
      card.appendChild(tags);

      card.addEventListener('click', function () { self.openNode(n.id); });
      v.appendChild(card);
    });
  };

  /* ---------------- 场景编辑 ---------------- */

  Editor.openNode = function (id, tab) {
    var self = this;
    var p = this.project;
    var node = WY.getNode(p, id);
    if (!node) { this.toast('场景不存在'); return; }

    var scrollBack = this.viewEl.scrollTop;
    var sheet = el('div', 'wy-sheet-full');

    var head = el('div', 'wy-sheet-head');
    var back = btn('wy-icon-btn', '‹');
    back.addEventListener('click', function () { sheet.remove(); self.viewEl.scrollTop = scrollBack; self.render(); });
    head.appendChild(back);
    var idx = WY.nodeIndex(p, id);
    head.appendChild(el('div', 't', '场景 #' + (idx + 1) + (node.title ? ' · ' + node.title : '')));
    var del = btn('wy-icon-btn', '🗑');
    del.addEventListener('click', function () {
      self.confirm('删除这个场景？', '指向它的选项会失效（检查功能会提示你）。', function () {
        var pos = WY.nodeIndex(p, id);
        p.nodes.splice(pos, 1);
        if (p.config.startNode === id) p.config.startNode = p.nodes[0] ? p.nodes[0].id : null;
        sheet.remove();
        self.save(true);
        self.render();
      });
    });
    head.appendChild(del);
    sheet.appendChild(head);

    if (tab) this.nodeTab = tab;
    if (!this.nodeTab) this.nodeTab = 'text';

    var body = el('div', 'wy-sheet-body');

    // 换页 / 换场景都走这里，保证页签状态不丢
    var rerender = function (t, otherId) {
      if (t) self.nodeTab = t;
      sheet.remove();
      self.openNode(otherId || id, self.nodeTab);
      self.save();
    };

    // ---- 顶部四个页签：正文 / 演出 / 选项 / 结局 ----
    var st = WY.ensureStage(node);
    var keyCount = st.tracks.reduce(function (a, t) { return a + ((t.keys && t.keys.length) || 0); }, 0);
    var isEnd = !!node.ending;
    var tabDefs = [
      ['text', '正文', (node.text || '').length ? (node.text.length + ' 字') : '还没写'],
      ['stage', '演出', st.actors.length ? (st.actors.length + ' 角色' + (keyCount ? ' · ' + keyCount + ' 帧' : '')) : '无角色'],
      ['choices', '选项', node.choices.length ? (node.choices.length + ' 个') : (node.autoNext ? '自动跳转' : '没有')],
      ['ending', '结局', isEnd ? '✓ 已设置' : '未设置']
    ];
    var tabs = el('div', 'wy-nodetabs');
    tabDefs.forEach(function (d) {
      var b = btn('wy-nodetab' + (self.nodeTab === d[0] ? ' on' : '') + (d[0] === 'ending' && isEnd ? ' is-end' : ''));
      b.dataset.key = d[0];
      b.appendChild(el('span', 'lb', d[1]));
      b.appendChild(el('span', 'sub', d[2]));
      b.addEventListener('click', function () { rerender(d[0]); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    var pane = el('div', 'wy-nodepane');
    body.appendChild(pane);
    if (this.nodeTab === 'stage') this.paneStage(pane, node, id, sheet, rerender);
    else if (this.nodeTab === 'choices') this.paneChoices(pane, node, id, sheet, rerender);
    else if (this.nodeTab === 'ending') this.paneEnding(pane, node, id, sheet, rerender);
    else this.paneText(pane, node, id, sheet, rerender);

    sheet.appendChild(body);
    document.body.appendChild(sheet);
  };

  /* ---------------- 场景编辑 · 四个分区 ---------------- */

  /** 正文 */
  Editor.paneText = function (pane, node, id, sheet, rerender) {
    var self = this;
    var p = this.project;

    pane.appendChild(field('场景备注（只有你自己看得到）', inp(node.title, function (val) {
      node.title = val; self.save(); self.updateTitle();
    }, '例如：森林入口'), '方便在列表里认出这一场，不影响玩家看到的内容。'));

    var ta = area(node.text, function (val) {
      node.text = val;
      self.save();
      self.updateTitle();
      var sub = sheet.querySelector('.wy-nodetab[data-key="text"] .sub');
      if (sub) sub.textContent = val.length ? (val.length + ' 字') : '还没写';
    }, '写这一场发生的事……');
    ta.style.height = Math.max(160, (node.text || '').split('\n').length * 26 + 70) + 'px';
    pane.appendChild(field('正文', ta));

    pane.appendChild(section('其它'));
    if (p.config.startNode === id) {
      pane.appendChild(el('div', 'wy-inline-note', '✓ 这一场就是游戏的开场。'));
    } else {
      var setStart = btn('wy-btn-ghost', '把这一场设为开场');
      setStart.addEventListener('click', function () {
        p.config.startNode = id;
        self.save(true);
        self.toast('已设为开场');
        self.render();
      });
      pane.appendChild(setStart);
    }
  };

  /** 演出：舞台 / 说话人 / 背景 / 音乐 / 进入效果 */
  Editor.paneStage = function (pane, node, id, sheet, rerender) {
    var self = this;
    var p = this.project;
    var st = WY.ensureStage(node);
    var keyCount = st.tracks.reduce(function (a, t) { return a + ((t.keys && t.keys.length) || 0); }, 0);

    // 舞台入口
    var stageBox = el('div', 'wy-sub wy-stageentry');
    var stageHead = el('div', 'wy-sub-head');
    stageHead.appendChild(el('span', 'idx', '🎭'));
    stageHead.appendChild(el('span', null, '舞台演出'));
    stageHead.appendChild(el('span', 'wy-spacer'));
    stageHead.appendChild(el('span', 'wy-badge',
      st.actors.length ? (st.actors.length + ' 个角色 · ' + keyCount + ' 个关键帧') : '还没有角色'));
    stageBox.appendChild(stageHead);
    var stageOpen = btn('wy-btn-ghost primary', st.actors.length ? '打开舞台编辑器' : '＋ 添加角色，做立绘演出');
    stageOpen.style.cssText = 'width:100%;justify-content:center;';
    stageOpen.addEventListener('click', function () {
      self.save(true);
      root.WYStageEditor.open(p, id, function () {
        sheet.remove();
        self.openNode(id, 'stage');
        self.save();
        self.render();
      });
    });
    stageBox.appendChild(stageOpen);
    stageBox.appendChild(el('div', 'wy-hint',
      '在舞台上拖立绘摆位置、打关键帧，做「谁站在哪、什么时候进场退场」。' +
      '画面里那个虚线块是选项的位置，也能直接拖。'));
    pane.appendChild(stageBox);

    // 说话人
    var spk = inp(node.speaker || '', function (v) { node.speaker = v.trim() || null; self.save(); },
      '留空 = 旁白');
    pane.appendChild(field('这一场谁在说话', spk,
      st.actors.length
        ? '填的角色名和舞台上某个角色一致，玩的时候他会亮起来、其他人变暗。名字会自动出现在对话框左上角。'
        : '先在上面加角色，这里填名字才有「谁说话谁亮」的效果。'));

    if (st.actors.length) {
      var chips = el('div', 'wy-row wrap');
      chips.style.marginTop = '-6px';
      st.actors.forEach(function (a) {
        var nm = WY.resolveActor(p, a).name;
        if (!nm) return;
        var c = btn('wy-btn-ghost', nm);
        c.style.cssText = 'font-size:13px;padding:6px 12px;';
        c.addEventListener('click', function () {
          node.speaker = nm;
          spk.value = nm;
          self.save();
          self.toast('这一场是「' + nm + '」在说话');
        });
        chips.appendChild(c);
      });
      var none = btn('wy-btn-ghost', '旁白（不填）');
      none.style.cssText = 'font-size:13px;padding:6px 12px;';
      none.addEventListener('click', function () { node.speaker = null; spk.value = ''; self.save(); });
      chips.appendChild(none);
      pane.appendChild(chips);
    }

    // 背景图
    var imgs = WY.assetsOfType(p, 'image');
    var bgPairs = [['', '（不设置）']].concat(imgs.map(function (a) { return [a.id, a.name]; }));
    var bgField = field('背景图', sel(bgPairs, node.bg || '', function (val) {
      node.bg = val || null; self.save();
    }), imgs.length ? '' : '还没有图片素材，去「素材」页上传。');
    if (node.bg && p.assets[node.bg]) {
      var prev = el('img');
      prev.src = p.assets[node.bg].data;
      prev.style.cssText = 'width:100%;border-radius:10px;margin-top:8px;display:block;';
      bgField.appendChild(prev);
    }
    pane.appendChild(bgField);

    // BGM
    var auds = WY.assetsOfType(p, 'audio');
    var bgmPairs = [['', '（不设置）']].concat(auds.map(function (a) { return [a.id, a.name]; }));
    var bgmField = field('背景音乐', sel(bgmPairs, node.bgm || '', function (val) {
      node.bgm = val || null; self.save();
    }), auds.length ? '' : '还没有音频素材，去「素材」页上传。');
    if (node.bgm && p.assets[node.bgm]) {
      var audition = btn('wy-btn-ghost', '♪ 试听');
      audition.style.marginTop = '8px';
      audition.addEventListener('click', function () { new Audio(p.assets[node.bgm].data).play(); });
      bgmField.appendChild(audition);
    }
    pane.appendChild(bgmField);

    // 进入效果
    pane.appendChild(section('进入这一场时，数值怎么变'));
    pane.appendChild(this.effectEditor(node.onEnter, function structural() {
      rerender('stage');
    }, node));
  };

  /** 选项 */
  Editor.paneChoices = function (pane, node, id, sheet, rerender) {
    var self = this;
    var p = this.project;

    var globalLayout = WY.ensureUI(p).choice.layout;
    var globalLabel = (WY.CHOICE_LAYOUTS.filter(function (o) { return o.id === globalLayout; })[0] || {}).label || globalLayout;
    pane.appendChild(field('这一场的选项出现在哪', sel(
      [['', '跟随全局（' + globalLabel + '）']].concat(
        WY.CHOICE_LAYOUTS.map(function (o) { return [o.id, o.label]; })),
      node.choiceLayout || '',
      function (v) { node.choiceLayout = v || null; self.save(); rerender('choices'); }
    ), '想每一场不一样就单独选；留空就跟着「设置 → 选项的样子」走。'));

    node.choices.forEach(function (c, ci) {
      pane.appendChild(self.choiceCard(node, c, ci, sheet, id));
    });

    var addChoice = btn('wy-btn-ghost primary', '＋ 添加选项');
    addChoice.style.cssText = 'width:100%;justify-content:center;padding:13px;';
    addChoice.addEventListener('click', function () {
      node.choices.push(WY.newChoice({ text: '', to: null }));
      rerender('choices');
    });
    pane.appendChild(addChoice);

    if (!node.choices.length) {
      pane.appendChild(section('没有选项时'));
      var autoPairs = [['', '（不跳转）']].concat(p.nodes.filter(function (n) { return n.id !== id; }).map(function (n) {
        return [n.id, WY.nodeLabel(p, n.id)];
      }));
      pane.appendChild(field('自动跳到', sel(autoPairs, node.autoNext || '', function (val) {
        node.autoNext = val || null; self.save(); self.render();
      }), '玩家点一下正文就进入下一场，适合连续叙述。'));
      pane.appendChild(el('div', 'wy-hint',
        '如果这一场是故事终点，去「结局」页把它设成结局；否则玩家会卡在这里。'));
    }
  };

  /** 结局 */
  Editor.paneEnding = function (pane, node, id, sheet, rerender) {
    var self = this;
    var p = this.project;
    var isEnd = !!node.ending;

    if (!isEnd) {
      pane.appendChild(el('div', 'wy-hint',
        '把这一场设成结局后：玩家读到这里会看到一张结局卡片，然后可以「再玩一次」或回退一步。' +
        '一部作品可以有任意多个结局。'));
      var mk = btn('wy-btn-ghost primary', '✓  把这一场设为结局');
      mk.style.cssText = 'width:100%;justify-content:center;padding:15px;font-size:15px;';
      mk.addEventListener('click', function () {
        node.ending = { title: '', text: '' };
        rerender('ending');
      });
      pane.appendChild(mk);
    } else {
      pane.appendChild(el('div', 'wy-inline-note', '✓ 这一场已经是结局了。'));
      pane.appendChild(field('结局名称', inp(node.ending.title, function (val) {
        node.ending.title = val; self.save(); self.render();
        var sub = sheet.querySelector('.wy-nodetab[data-key="ending"] .sub');
        if (sub) sub.textContent = val ? '✓ ' + val.slice(0, 6) : '✓ 已设置';
      }, '例如：好结局 · 归乡'), '玩家看到的标题，会大大地显示在结局卡片上。不填的话会显示「结局」。'));
      var ea = area(node.ending.text, function (val) { node.ending.text = val; self.save(); }, '给玩家的一段收尾文字');
      ea.style.height = '120px';
      pane.appendChild(field('结局说明', ea, '写给玩家的几句话。不填也可以。'));
      var rm = btn('wy-btn-ghost danger', '取消结局标记');
      rm.addEventListener('click', function () { node.ending = null; rerender('ending'); });
      pane.appendChild(rm);
    }

    // 全部结局一览 —— 免得结局散落在几十个场景里找不到
    var ends = [];
    p.nodes.forEach(function (n, i) {
      if (n.ending) ends.push({ n: n, i: i });
    });
    pane.appendChild(section('本作全部结局（' + ends.length + ' 个）'));
    if (!ends.length) {
      pane.appendChild(el('div', 'wy-hint', '还没有任何结局。故事至少需要一个结局，玩家才走得通。'));
    } else {
      ends.forEach(function (o) {
        var row = el('div', 'wy-menu-item');
        var isCur = o.n.id === id;
        row.appendChild(document.createTextNode((isCur ? '● ' : '') + '#' + (o.i + 1) + '  ' + (o.n.ending.title || '(未命名结局)')));
        row.appendChild(el('small', null, WY.firstLine(o.n.text) || '（这一场没有正文）'));
        if (isCur) row.style.borderColor = 'var(--accent)';
        else row.addEventListener('click', function () { rerender('ending', o.n.id); });
        pane.appendChild(row);
      });
      pane.appendChild(el('div', 'wy-hint', '点任意一个结局可以跳过去编辑它。'));
    }
  };

  /* ---------------- 选项卡片 ---------------- */

  Editor.choiceCard = function (node, c, ci, sheet, nodeId) {
    var self = this;
    var p = this.project;
    var box = el('div', 'wy-sub');

    var head = el('div', 'wy-sub-head');
    head.appendChild(el('span', 'idx', '选项 ' + (ci + 1)));
    head.appendChild(el('span', 'wy-spacer'));
    var up = btn('wy-x', '↑');
    up.addEventListener('click', function () {
      if (ci === 0) return;
      node.choices.splice(ci - 1, 0, node.choices.splice(ci, 1)[0]);
      sheet.remove(); self.openNode(nodeId, 'choices'); self.save();
    });
    var down = btn('wy-x', '↓');
    down.addEventListener('click', function () {
      if (ci >= node.choices.length - 1) return;
      node.choices.splice(ci + 1, 0, node.choices.splice(ci, 1)[0]);
      sheet.remove(); self.openNode(nodeId, 'choices'); self.save();
    });
    var del = btn('wy-x', '✕');
    del.addEventListener('click', function () {
      node.choices.splice(ci, 1);
      rerender();
    });
    head.appendChild(up); head.appendChild(down); head.appendChild(del);
    box.appendChild(head);

    var rerender = function () { sheet.remove(); self.openNode(nodeId, 'choices'); self.save(); };

    box.appendChild(field('玩家看到的文字', inp(c.text, function (val) {
      c.text = val; self.save(); self.render();
    }, '例如：推开那扇门')));

    // 这个选项自己的图片
    var imgs = WY.assetsOfType(p, 'image');
    var imgField = field('这个选项的图片（可选）', sel(
      [['', '（不用图片）']].concat(imgs.map(function (a) { return [a.id, a.name]; })),
      c.img || '', function (val) { c.img = val || null; self.save(); rerender(); }
    ), imgs.length
      ? '选了之后，这张图会成为这个选项的背景；配合下面的「只显示图片」就能做「点这张图继续」。'
      : '还没有图片素材，去「素材」页上传。');
    if (c.img && p.assets[c.img]) {
      var iprev = el('img');
      iprev.src = p.assets[c.img].data;
      iprev.style.cssText = 'width:130px;border-radius:8px;margin-top:8px;display:block;';
      imgField.appendChild(iprev);
    }
    box.appendChild(imgField);

    var imgOnly = el('label', 'wy-check');
    var ioc = document.createElement('input');
    ioc.type = 'checkbox';
    ioc.checked = !!c.hideText;
    ioc.addEventListener('change', function () { c.hideText = ioc.checked; self.save(); });
    imgOnly.appendChild(ioc);
    imgOnly.appendChild(document.createTextNode('只显示图片，不显示文字（整块就是一张图）'));
    box.appendChild(imgOnly);

    // 去向
    var pairs = [['', '（未选择）'], ['__new__', '＋ 新建一个场景并跳过去']].concat(
      p.nodes.map(function (n) { return [n.id, WY.nodeLabel(p, n.id)]; })
    );
    var toSel = sel(pairs, c.to || '', function (val) {
      if (val === '__new__') {
        var n = WY.newNode({ title: '', text: '' });
        p.nodes.push(n);
        c.to = n.id;
        self.save(true);
        sheet.remove();
        self.openNode(n.id, 'choices');
        self.render();
        self.toast('已新建场景，正在编辑它');
        return;
      }
      c.to = val || null;
      self.save();
      self.render();
    });
    box.appendChild(field('选完后去哪里', toSel));

    // 条件
    var condOn = !!(c.condition && c.condition.rules && c.condition.rules.length);
    if (!condOn) {
      var addCond = btn('wy-btn-ghost', '＋ 加上显示条件');
      addCond.style.fontSize = '13px';
      addCond.addEventListener('click', function () {
        var vd = p.config.vars[0];
        c.condition = { logic: 'and', rules: [WY.newRule({ key: vd ? vd.key : '', op: '>=', value: 1 })] };
        sheet.remove(); self.openNode(nodeId, 'choices'); self.save();
      });
      box.appendChild(addCond);
      box.appendChild(el('div', 'wy-hint', '加上条件后，只有满足条件时这个选项才会出现。'));
    } else {
      var cl = el('div', 'wy-row');
      cl.appendChild(el('span', 'wy-label', '条件'));
      cl.appendChild(sel([['and', '全部满足'], ['or', '满足任意一条']], c.condition.logic, function (v) {
        c.condition.logic = v; self.save(); self.render();
      }));
      cl.style.marginBottom = '8px';
      box.appendChild(cl);

      c.condition.rules.forEach(function (r, ri) {
        box.appendChild(self.ruleRow(c.condition.rules, r, ri, function () {
          sheet.remove(); self.openNode(nodeId, 'choices'); self.save();
        }));
      });
      var addRule = btn('wy-btn-ghost', '＋ 再加一条');
      addRule.style.fontSize = '13px';
      addRule.addEventListener('click', function () {
        var vd = p.config.vars[0];
        c.condition.rules.push(WY.newRule({ key: vd ? vd.key : '', op: '>=', value: 1 }));
        sheet.remove(); self.openNode(nodeId, 'choices'); self.save();
      });
      box.appendChild(addRule);
    }

    // 效果
    box.appendChild(el('div', 'wy-label', '选中后的效果'));
    box.appendChild(this.effectEditor(c.effects, function () { rerender(); }, node));

    var onceLabel = el('label', 'wy-check');
    var onceCb = document.createElement('input');
    onceCb.type = 'checkbox';
    onceCb.checked = !!c.once;
    onceCb.addEventListener('change', function () { c.once = onceCb.checked; self.save(); });
    onceLabel.appendChild(onceCb);
    onceLabel.appendChild(document.createTextNode('只能选一次（选过就不再出现）'));
    box.appendChild(onceLabel);

    return box;
  };

  /* ---------------- 规则行 / 效果行 ---------------- */

  Editor.varPairs = function () {
    var p = this.project;
    return p.config.vars.filter(function (v) { return v.key; }).map(function (v) { return [v.key, v.key]; });
  };

  Editor.ruleRow = function (list, r, ri, structural) {
    var self = this;
    var p = this.project;
    var pairs = this.varPairs();
    if (!pairs.length) return el('div', 'wy-hint', '先去「变量」页添加变量。');
    if (!r.key) r.key = pairs[0][0];

    var row = el('div', 'wy-rule');
    row.appendChild(sel(pairs, r.key, function (v) { r.key = v; self.save(); }));
    row.appendChild(sel(WY.OPS.map(function (o) { return [o.id, o.label]; }), r.op, function (v) {
      r.op = v; self.save(); self.render();
    }));
    if (r.op !== 'truthy' && r.op !== 'falsy') {
      var vd = WY.varDef(p, r.key);
      var vi = inp(r.value, function (v) { r.value = v; self.save(); });
      if (vd && vd.type === 'number') vi.inputMode = 'decimal';
      vi.style.flex = '1';
      row.appendChild(vi);
    }
    var x = btn('wy-x', '✕');
    x.addEventListener('click', function () { list.splice(ri, 1); structural(); });
    row.appendChild(x);
    return row;
  };

  Editor.effectEditor = function (effects, structural, node) {
    var self = this;
    var p = this.project;
    var wrap = el('div');
    var pairs = this.varPairs();

    // 用解析后的角色：v8 起名字存在角色定义里，场景里的 actor.name 是空的
    var actors = node ? ((WY.ensureStage(node).actors) || [])
      .map(function (a) { return WY.resolveActor(p, a); })
      .filter(function (a) { return a.name; }) : [];
    var hasVars = pairs.length > 0;
    var hasActors = actors.length > 0;

    if (!hasVars && !hasActors) {
      wrap.appendChild(el('div', 'wy-hint',
        '还没有变量，也还没有角色。去「变量」页加个「好感度」，或者去「演出」页加个角色，就能在这里设效果了。'));
      return wrap;
    }

    effects.forEach(function (e, ei) {
      var row = el('div', 'wy-rule');

      row.appendChild(sel(WY.EFFECT_OPS.map(function (o) { return [o.id, o.label]; }), e.op || 'add', function (v) {
        e.op = v;
        if (v === 'face') { delete e.key; e.value = null; }
        else { delete e.actorId; delete e.face; if (!e.key) e.key = pairs[0] ? pairs[0][0] : ''; }
        self.save();
        self.render();
      }));

      if (e.op === 'face') {
        // ---- 换表情：选角色 + 选表情 ----
        if (!hasActors) {
          row.appendChild(el('span', 'wy-hint', '先去「演出」页加个角色'));
        } else {
          if (!e.actorId || !actors.some(function (a) { return a.id === e.actorId; })) e.actorId = actors[0].id;
          row.appendChild(sel(actors.map(function (a) { return [a.id, a.name]; }), e.actorId, function (v) {
            e.actorId = v;
            e.face = '默认';
            self.save();
            self.render();
          }));
          var act = WY.getActor(node, e.actorId);
          var faceNames = WY.actorFaceNames(act, p);
          if (faceNames.length <= 1) {
            row.appendChild(el('span', 'wy-hint', '这个角色还没有表情差分'));
          } else {
            if (faceNames.indexOf(e.face) < 0) e.face = faceNames[0];
            row.appendChild(sel(faceNames.map(function (n2) { return [n2, n2]; }), e.face, function (v) {
              e.face = v; self.save();
            }));
          }
        }
      } else {
        // ---- 改数值 ----
        if (!hasVars) {
          row.appendChild(el('span', 'wy-hint', '还没有变量'));
        } else {
          if (!e.key) e.key = pairs[0][0];
          row.appendChild(sel(pairs, e.key, function (v) { e.key = v; self.save(); }));
          var vi = inp(e.value, function (v) { e.value = v; self.save(); });
          var vd = WY.varDef(p, e.key);
          if (vd && vd.type === 'number') vi.inputMode = 'decimal';
          row.appendChild(vi);
        }
      }

      var x = btn('wy-x', '✕');
      x.addEventListener('click', function () { effects.splice(ei, 1); structural(); });
      row.appendChild(x);
      wrap.appendChild(row);
    });

    var add = btn('wy-btn-ghost', '＋ 添加效果');
    add.style.fontSize = '13px';
    add.addEventListener('click', function () {
      if (hasVars) effects.push(WY.newEffect({ op: 'add', key: pairs[0][0], value: 1 }));
      else effects.push({ op: 'face', actorId: actors[0].id, face: '默认' });
      structural();
    });
    wrap.appendChild(add);

    if (hasActors) {
      wrap.appendChild(el('div', 'wy-hint',
        '「换表情」用来让角色中途变脸 —— 比如玩家安慰了她，下一场她就笑起来。'));
    }
    return wrap;
  };

  /* ---------------- 素材 ---------------- */

  /* ---------------- 角色 ---------------- */

  /**
   * 角色页：一个角色 = 名字 + 立绘 + 一堆表情差分。
   *
   * 以前这些东西是在每个场景里各填一遍的（同一角色 19 个场景 = 19 份），
   * 现在收在这里统一定义，场景里只是「谁上场」的引用。
   * 所以换个立绘、加个表情，所有用到他的场景一起变。
   */
  Editor.renderChars = function (v) {
    var self = this;
    var p = this.project;
    var chars = WY.charactersOf(p);
    var usage = WY.characterUsage(p);

    var bar = el('div', 'wy-row wrap');
    var add = btn('wy-btn primary', '＋ 新建角色');
    add.addEventListener('click', function () {
      var ch = WY.newCharacter({ name: '角色' + (chars.length + 1) });
      chars.push(ch);
      self.save(true);
      self.render();
      self.toast('建好了，接着给他选张立绘吧');
    });
    bar.appendChild(add);
    if (chars.length) {
      bar.appendChild(el('span', 'wy-hint',
        '共 ' + chars.length + ' 个角色。在这里改，所有场景一起变。'));
    }
    v.appendChild(bar);

    if (!chars.length) {
      v.appendChild(el('div', 'wy-empty-box',
        '还没有角色。\n\n点「＋ 新建角色」，给他起个名字、选一张立绘，' +
        '再把这角色的各个表情（微笑 / 生气 / 害羞…）挂上去。\n\n' +
        '之后在「演出」里加角色时，只要选他 —— 名字和立绘会自动填好，' +
        '「换表情」效果里也能直接挑。'));
      return;
    }

    var images = WY.assetList(p).filter(function (a) { return a.type === 'image'; });
    var imgPairs = [['', '（还没有图片素材）']].concat(
      images.map(function (a) { return [a.id, a.name]; }));

    chars.forEach(function (ch, ci) {
      var used = usage[ch.id] || { scenes: 0, actors: 0 };
      var card = el('div', 'wy-charcard');

      /* ---- 卡头：缩略图 + 名字 ---- */
      var head = el('div', 'wy-charcard-head');
      var thumb = el('div', 'wy-charthumb');
      var sid = ch.sprite || (ch.faces[0] && ch.faces[0].img);
      if (sid && p.assets[sid]) {
        var tim = el('img');
        tim.src = p.assets[sid].data;
        tim.alt = ch.name || '';
        thumb.appendChild(tim);
      } else {
        thumb.appendChild(el('span', 'none', '没立绘'));
      }
      head.appendChild(thumb);

      var hmeta = el('div', 'wy-charmeta');
      var nameIn = inp(ch.name, function (val) {
        ch.name = val;
        // 名字是角色定义的一部分，改一下所有场景跟着变；
        // 这里只存盘不重绘，否则每敲一个字输入框都会失焦。
        self.save();
      }, '角色名，比如：阿萤');
      hmeta.appendChild(nameIn);
      hmeta.appendChild(el('div', 'wy-charcount',
        used.scenes
          ? ('在 ' + used.scenes + ' 个场景里上场过 ' + used.actors + ' 次')
          : '还没在任何场景里上场'));
      head.appendChild(hmeta);

      var delC = btn('wy-x', '✕');
      delC.title = '删掉这个角色';
      delC.addEventListener('click', function () {
        self.confirm('删掉角色「' + (ch.name || '未命名') + '」？',
          used.scenes
            ? ('他已经在 ' + used.scenes + ' 个场景里上场了，那些场景会失去这个角色，需要重新选人。')
            : '还没有场景用到他。',
          function () {
            p.characters = chars.filter(function (x) { return x !== ch; });
            // 场景里的引用一并清掉，免得留下指向空气的引用
            p.nodes.forEach(function (n) {
              ((n.stage && n.stage.actors) || []).forEach(function (a) {
                if (a.character === ch.id) a.character = null;
              });
            });
            self.save(true);
            self.render();
          });
      });
      head.appendChild(delC);
      card.appendChild(head);

      /* ---- 立绘 ---- */
      var spriteField = field('立绘（默认表情）', sel(imgPairs, ch.sprite || '', function (val) {
        ch.sprite = val || null;
        self.save(true);
        self.render();
      }), images.length
        ? '「默认」就是这个角色平时的样子。最好是透明背景的 PNG。'
        : '还没有图片素材 —— 先去「素材」页上传。');
      card.appendChild(spriteField);

      /* ---- 表情差分 ---- */
      var faceSec = el('div', 'wy-charfaces');
      faceSec.appendChild(el('label', 'wy-label',
        '表情差分（' + (ch.faces || []).length + ' 个）—— 剧情里用「换表情」切脸，不用重新画整张立绘'));

      var grid = el('div', 'wy-facegrid');
      (ch.faces || []).forEach(function (fc, fi) {
        var cell = el('div', 'wy-facecell');
        if (fc.img && p.assets[fc.img]) {
          var cim = el('img');
          cim.src = p.assets[fc.img].data;
          cim.alt = fc.name || '';
          cell.appendChild(cim);
        } else {
          cell.appendChild(el('div', 'wy-facecell-none', '没选图'));
        }
        cell.appendChild(el('div', 'wy-facecell-name', fc.name || '未命名'));
        var fx = btn('wy-asset-del', '✕');
        fx.addEventListener('click', function () {
          ch.faces.splice(fi, 1);
          self.save(true);
          self.render();
        });
        cell.appendChild(fx);
        cell.addEventListener('click', function (e) {
          if (e.target === fx) return;
          self.openCharFace(ch, fi);
        });
        grid.appendChild(cell);
      });

      var addFace = btn('wy-facecell wy-faceadd', '＋\n加表情');
      addFace.addEventListener('click', function () {
        ch.faces = ch.faces || [];
        ch.faces.push(WY.newFace({
          name: '表情' + (ch.faces.length + 1),
          img: images[0] ? images[0].id : null
        }));
        self.save(true);
        self.openCharFace(ch, ch.faces.length - 1);
      });
      grid.appendChild(addFace);
      faceSec.appendChild(grid);
      card.appendChild(faceSec);

      card.appendChild(el('div', 'wy-hint',
        '点任意一张表情可以改名字或换图。'));
      v.appendChild(card);
    });
  };

  /** 编辑一个表情：名字 + 用哪张图，都带实时预览 */
  Editor.openCharFace = function (ch, fi) {
    var self = this;
    var p = this.project;
    var fc = (ch.faces || [])[fi];
    if (!fc) return;

    var images = WY.assetList(p).filter(function (a) { return a.type === 'image'; });
    var imgPairs = [['', '（不选图）']].concat(
      images.map(function (a) { return [a.id, a.name]; }));

    var mask = el('div', 'wy-modal-mask');
    var m = el('div', 'wy-modal');
    mask.appendChild(m);
    m.appendChild(el('h3', null, '表情：' + (ch.name || '未命名角色')));

    var prev = el('div', 'wy-facepreview');
    var pim = el('img');
    var refresh = function () {
      if (fc.img && p.assets[fc.img]) {
        pim.src = p.assets[fc.img].data;
        pim.style.display = '';
        prev.classList.remove('empty');
      } else {
        pim.removeAttribute('src');
        pim.style.display = 'none';
        prev.classList.add('empty');
        prev.textContent = '还没选图';
      }
    };
    prev.appendChild(pim);
    refresh();
    m.appendChild(prev);

    m.appendChild(field('表情名', inp(fc.name, function (val) {
      fc.name = val;
      self.save();
    }, '微笑 / 生气 / 害羞 / 惊讶…'), '这个名字就是「换表情」效果里选的那个。'));

    m.appendChild(field('用哪张图', sel(imgPairs, fc.img || '', function (val) {
      fc.img = val || null;
      refresh();
      self.save(true);
      self.render();
    })));

    var ok = btn('wy-menu-item', '完成');
    ok.addEventListener('click', function () {
      mask.remove();
      self.save(true);
      self.render();
    });
    m.appendChild(ok);
    var rm = btn('wy-menu-item', '删掉这个表情');
    rm.addEventListener('click', function () {
      ch.faces.splice(fi, 1);
      mask.remove();
      self.save(true);
      self.render();
    });
    m.appendChild(rm);

    this.layer.appendChild(mask);
  };

  Editor.renderAssets = function (v) {
    var self = this;
    var p = this.project;
    var list = WY.assetList(p);

    var bar = el('div', 'wy-row wrap');
    bar.style.marginBottom = '14px';

    var pick = btn('wy-btn-ghost primary', '＋ 上传图片 / 音频 / 字体');
    var file = el('input');
    file.type = 'file';
    file.accept = 'image/*,audio/*,font/*,.ttf,.otf,.woff,.woff2,.ttc';
    file.multiple = true;
    file.style.display = 'none';
    file.addEventListener('change', function () {
      var files = Array.prototype.slice.call(file.files || []);
      file.value = '';
      if (!files.length) return;
      self.importFiles(files);
    });
    pick.addEventListener('click', function () { file.click(); });
    bar.appendChild(pick);
    bar.appendChild(file);

    if (list.length) {
      var usage = WY.assetUsage(p);
      var orphans = list.filter(function (a) { return !usage[a.id]; });
      if (orphans.length) {
        var cl = btn('wy-btn-ghost', '清掉 ' + orphans.length + ' 个没用到');
        cl.addEventListener('click', function () {
          self.confirm('删除未使用的素材？', '这些素材没有被任何场景引用。', function () {
            orphans.forEach(function (a) { delete p.assets[a.id]; });
            self.save(true);
            self.render();
          });
        });
        bar.appendChild(cl);
      }
    }
    v.appendChild(bar);

    if (!list.length) {
      v.appendChild(el('div', 'wy-empty-box',
        '还没有素材。\n\n上传的图片会出现在「背景图」下拉里，音频会出现在「背景音乐」下拉里。'));
      return;
    }

    var usage2 = WY.assetUsage(p);
    var grid = el('div', 'wy-grid');
    list.forEach(function (a) {
      var box = el('div', 'wy-asset');
      if (a.type === 'image') {
        var img = el('img', 'wy-asset-thumb');
        img.src = a.data;
        img.loading = 'lazy';
        box.appendChild(img);
      } else if (a.type === 'font') {
        var fa = el('div', 'wy-asset-audio', 'Aa');
        fa.style.fontSize = '30px';
        box.appendChild(fa);
      } else {
        var au = el('div', 'wy-asset-audio', '♪');
        au.addEventListener('click', function () { new Audio(a.data).play(); });
        box.appendChild(au);
      }
      if (usage2[a.id]) box.appendChild(el('span', 'wy-asset-used', '使用中'));

      var del = btn('wy-asset-del', '✕');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        self.confirm('删除素材「' + a.name + '」？', '引用它的场景会失去这个图片/音乐。', function () {
          delete p.assets[a.id];
          p.nodes.forEach(function (n) {
            if (n.bg === a.id) n.bg = null;
            if (n.bgm === a.id) n.bgm = null;
            if (n.sfx === a.id) n.sfx = null;
          });
          self.save(true);
          self.render();
        });
      });
      box.appendChild(del);
      box.appendChild(el('div', 'wy-asset-name', a.name + ' · ' + WY.formatBytes(Math.round((a.data || '').length * 0.75))));
      grid.appendChild(box);
    });
    v.appendChild(grid);

    var uiForFont = WY.ensureUI(p);
    if (uiForFont.font && !p.assets[uiForFont.font]) {
      v.appendChild(el('div', 'wy-hint', '注意：设置里选的自定义字体已经被删了，游戏会退回系统字体。'));
    }
    var note = el('div', 'wy-hint');
    note.style.marginTop = '16px';
    var totalBytes = WY.stats(p).assetBytes;
    note.textContent = '全部素材约 ' + WY.formatBytes(totalBytes) +
      (totalBytes > 8 * 1024 * 1024 ? '（偏大，导出的游戏文件也会这么大，分享前建议压缩图片）' : '');
    v.appendChild(note);
  };

  Editor.importFiles = function (files) {
    var self = this;
    var p = this.project;
    var pending = files.length;
    var added = 0;

    files.forEach(function (f) {
      var isImage = /^image\//.test(f.type);
      var isAudio = /^audio\//.test(f.type);
      var isFont = /^font\//.test(f.type) || /\.(ttf|otf|woff2?|ttc)$/i.test(f.name);
      if (!isImage && !isAudio && !isFont) {
        self.toast('跳过不支持的文件：' + f.name);
        pending--; return;
      }
      if (isFont && f.size > 4 * 1024 * 1024) {
        self.toast('字体 ' + f.name + ' 有 ' + WY.formatBytes(f.size) +
          '，内嵌后体积更大，导出的游戏会变重', 3500);
      } else if (f.size > 12 * 1024 * 1024) {
        self.toast(f.name + ' 超过 12MB，可能拖慢 App');
      }
      var done = function () {
        if (--pending > 0) return;
        self.save(true);
        self.render();
        if (added) self.toast('已导入 ' + added + ' 个素材');
      };

      var reader = new FileReader();
      reader.onload = function () {
        var id = WY.uid('a');
        var asset = {
          type: isImage ? 'image' : (isAudio ? 'audio' : 'font'),
          name: f.name.replace(/\.[^.]+$/, '').slice(0, 40),
          mime: f.type,
          data: reader.result
        };
        p.assets[id] = asset;
        added++;
        if (!isImage) { done(); return; }
        // 图片记下宽高 —— 纯图片选项要靠它撑出正确比例
        var probe = new Image();
        probe.onload = function () {
          asset.w = probe.naturalWidth;
          asset.h = probe.naturalHeight;
          done();
        };
        probe.onerror = function () { done(); };
        probe.src = reader.result;
      };
      reader.onerror = function () {
        self.toast('读取失败：' + f.name);
        done();
      };
      reader.readAsDataURL(f);
    });
  };

  /* ---------------- 变量 ---------------- */

  Editor.renderVars = function (v) {
    var self = this;
    var p = this.project;

    var bar = el('div', 'wy-row');
    bar.style.marginBottom = '14px';
    var add = btn('wy-btn-ghost primary', '＋ 新变量');
    add.addEventListener('click', function () {
      p.config.vars.push(WY.newVar({ key: '变量' + (p.config.vars.length + 1), type: 'number', initial: 0 }));
      self.save(true);
      self.render();
    });
    bar.appendChild(add);
    v.appendChild(bar);

    if (!p.config.vars.length) {
      v.appendChild(el('div', 'wy-empty-box', '还没有变量。\n\n变量用来记「好感度」「金币」「是否见过某人」这类状态，之后就能用条件控制剧情走向。'));
      return;
    }

    var head = el('div', 'wy-row');
    head.style.cssText = 'font-size:11px;color:var(--dim);margin:0 4px 6px;';
    head.appendChild(el('span', null, '名称'));
    head.appendChild(el('span', null, '类型'));
    head.appendChild(el('span', null, '初始值'));
    v.appendChild(head);

    p.config.vars.forEach(function (d, i) {
      var row = el('div', 'wy-vrow');
      row.appendChild(inp(d.key, function (val) {
        var old = d.key;
        d.key = val;
        p.nodes.forEach(function (n) {
          (n.onEnter || []).forEach(function (e) { if (e.key === old) e.key = val; });
          (n.choices || []).forEach(function (c) {
            (c.effects || []).forEach(function (e) { if (e.key === old) e.key = val; });
            if (c.condition && c.condition.rules) c.condition.rules.forEach(function (r) { if (r.key === old) r.key = val; });
          });
        });
        self.save();
      }));
      row.appendChild(sel([['number', '数字'], ['string', '文字'], ['bool', '开关']], d.type, function (val) {
        d.type = val; self.save(); self.render();
      }));
      var vi = inp(d.initial, function (val) {
        d.initial = WY.coerce(val, d.type); self.save();
      });
      if (d.type === 'number') vi.inputMode = 'decimal';
      vi.className = 'wy-input val';
      row.appendChild(vi);
      var x = btn('wy-del', '✕');
      x.addEventListener('click', function () {
        self.confirm('删除变量「' + d.key + '」？', '用到它的条件和效果会失去目标。', function () {
          p.config.vars.splice(i, 1);
          self.save(true);
          self.render();
        });
      });
      row.appendChild(x);
      v.appendChild(row);

      var sub = el('div', 'wy-row');
      sub.style.cssText = 'margin:-2px 0 12px 2px;';
      sub.appendChild(el('span', 'wy-label', '玩家看得到吗'));
      var dsel = sel(WY.DISPLAY_MODES.map(function (m) { return [m.id, m.label]; }), WY.varDisplay(d), function (val) {
        d.display = val;
        delete d.show;            // 老字段清掉，免得起歧义
        self.save();
      });
      dsel.style.flex = '1';
      sub.appendChild(dsel);
      v.appendChild(sub);
    });

    v.appendChild(el('div', 'wy-hint',
      '「不显示」= 纯内部数值；「只在图鉴 / 状态里」= 玩家在菜单里的图鉴页能看到（推荐，不会一直挂在屏幕上）；' +
      '「顶部常驻显示」= 一直挂在画面顶上。'));
    v.appendChild(el('div', 'wy-hint', '提示：类型选「开关」适合记「是否见过×」「是否拿到钥匙」。'));
  };

  /* ---------------- 图鉴（人物 / 背包 / 状态） ---------------- */

  var CODEX_ICONS = ['📖', '👤', '🎒', '📊', '🗺', '💡', '🔑', '🏠', '💌', '🎵', '🧭', '⚔️', '🌙', '🔍'];

  Editor.renderCodex = function (v) {
    var self = this;
    var p = this.project;
    var groups = WY.codexGroups(p);
    var listGroups = groups.filter(function (g) { return g.kind === 'list'; });

    // 只要还没有「人物 / 背包」这类列表页，就一直给引导，方便随时补
    if (!listGroups.length) {
      v.appendChild(el('div', 'wy-inline-note',
        '图鉴 = 玩家在游戏里能翻看的资料页。\n\n' +
        '「人物」放角色卡（上面显示好感度）、「背包」放道具、「状态」自动列出你的所有数值。\n' +
        '它取代了以前一直挂在屏幕顶上的变量条 —— 玩家想看的时候点开菜单看就行。'));
    }

    // 快捷新建（同名同类型已存在就直接选中，不重复建）
    var quick = el('div', 'wy-row wrap');
    quick.style.margin = '12px 0 16px';
    [
      ['人物', '👤', 'list'],
      ['背包', '🎒', 'list'],
      ['状态', '📊', 'status']
    ].forEach(function (t) {
      var same = groups.filter(function (g) { return g.name === t[0] && g.kind === t[2]; })[0];
      var b = btn('wy-btn-ghost' + (same ? '' : ' primary'), same ? ('「' + t[0] + '」页已存在') : ('＋ 建一个「' + t[0] + '」页'));
      if (same) b.style.opacity = '.6';
      b.addEventListener('click', function () {
        if (same) { self.codexGroup = same.id; self.render(); self.toast('已经有一个「' + t[0] + '」页了'); return; }
        var g = WY.newCodexGroup({ name: t[0], icon: t[1], kind: t[2], order: groups.length });
        WY.ensureCodex(p).groups.push(g);
        self.codexGroup = g.id;
        self.save(true);
        self.render();
        if (t[2] === 'list') self.openCodexEntry(null, g.id);
      });
      quick.appendChild(b);
    });
    v.appendChild(quick);

    if (!groups.length) return;

    if (!this.codexGroup || !groups.some(function (g) { return g.id === self.codexGroup; })) {
      this.codexGroup = groups[0].id;
    }

    // 分组切换
    var bar = el('div', 'wy-actorbar');
    bar.style.marginBottom = '14px';
    groups.forEach(function (g) {
      var c = btn('wy-actorchip' + (g.id === self.codexGroup ? ' on' : ''));
      c.appendChild(el('span', 'nm', g.icon + ' ' + g.name));
      c.appendChild(el('span', 'kc', g.kind === 'status' ? '数值表' : (WY.codexEntriesOf(p, g.id).length + ' 条')));
      c.addEventListener('click', function () { self.codexGroup = g.id; self.render(); });
      bar.appendChild(c);
    });
    var addG = btn('wy-actorchip wy-add', '＋ 新分组');
    addG.addEventListener('click', function () { self.openCodexGroup(null); });
    bar.appendChild(addG);
    v.appendChild(bar);

    var g = groups.filter(function (x) { return x.id === self.codexGroup; })[0];

    var actions = el('div', 'wy-row wrap');
    actions.style.marginBottom = '14px';
    var editG = btn('wy-btn-ghost', '✎ 编辑这一页');
    editG.addEventListener('click', function () { self.openCodexGroup(g.id); });
    actions.appendChild(editG);
    if (g.kind === 'list') {
      var addE = btn('wy-btn-ghost primary', '＋ 新条目');
      addE.addEventListener('click', function () { self.openCodexEntry(null, g.id); });
      actions.appendChild(addE);
    }
    v.appendChild(actions);

    // 状态型：自动列数值
    if (g.kind === 'status') {
      v.appendChild(el('div', 'wy-hint',
        '这一页会自动列出所有「不隐藏」的数值，不用一条条建。想调整显示哪些，去「变量」页改它们的「玩家看得到吗」。'));
      var vars = WY.statusVars(p);
      if (!vars.length) {
        v.appendChild(el('div', 'wy-empty-box', '还没有可显示的数值。去「变量」页把某个变量设成「只在图鉴 / 状态里」。'));
      } else {
        var box = el('div', 'wy-inline-note');
        box.textContent = '玩家会在这一页看到：' + vars.map(function (d) { return d.key; }).join(' · ');
        v.appendChild(box);
      }
      return;
    }

    // 列表型：条目卡片
    var entries = WY.codexEntriesOf(p, g.id);
    if (!entries.length) {
      v.appendChild(el('div', 'wy-empty-box',
        '这一页还没有条目。\n\n点上面的「＋ 新条目」加一个，比如一个角色卡：配一张立绘、写一段介绍、勾上要显示「好感」。'));
      return;
    }

    entries.forEach(function (e) {
      var card = el('div', 'wy-card');
      var head = el('div', 'wy-card-head');
      if (e.image && p.assets[e.image]) {
        var th = el('img');
        th.src = p.assets[e.image].data;
        th.style.cssText = 'width:34px;height:44px;object-fit:cover;border-radius:7px;flex:none;';
        head.appendChild(th);
      }
      head.appendChild(el('span', 'wy-card-title', e.name || '未命名条目'));
      card.appendChild(head);

      if (e.desc) card.appendChild(el('div', 'wy-card-text', e.desc));

      var tags = el('div', 'wy-card-tags');
      (e.vars || []).forEach(function (k) {
        tags.appendChild(el('span', 'wy-badge', k));
      });
      if (e.image) tags.appendChild(el('span', 'wy-badge', '有配图'));
      if (e.unlock) tags.appendChild(el('span', 'wy-badge wy-warn', '有解锁条件'));
      card.appendChild(tags);

      card.addEventListener('click', function () { self.openCodexEntry(e.id, g.id); });
      v.appendChild(card);
    });
  };

  /** 图鉴列表里给个示例值，方便作者确认变量选对了 */
  Editor.varsPreview = function (key) {
    var d = WY.varDef(this.project, key);
    return d ? d.initial : '?';
  };

  Editor.openCodexEntry = function (entryId, groupId) {
    var self = this;
    var p = this.project;
    var list = WY.ensureCodex(p).entries;
    var entry = entryId ? list.filter(function (e) { return e.id === entryId; })[0] : null;
    var isNew = !entry;
    if (isNew) {
      entry = WY.newCodexEntry({ groupId: groupId, name: '' });
      list.push(entry);
    }

    var sheet = el('div', 'wy-sheet-full');
    var head = el('div', 'wy-sheet-head');
    var back = btn('wy-icon-btn', '‹');
    back.addEventListener('click', function () {
      if (isNew && !entry.name) {
        var pos = list.indexOf(entry);
        if (pos >= 0) list.splice(pos, 1);
      }
      sheet.remove();
      self.save(true);
      self.render();
    });
    head.appendChild(back);
    head.appendChild(el('div', 't', isNew ? '新条目' : '编辑条目'));
    var del = btn('wy-icon-btn', '🗑');
    del.addEventListener('click', function () {
      self.confirm('删除这个条目？', '玩家在图鉴里就看不到它了。', function () {
        var pos = list.indexOf(entry);
        if (pos >= 0) list.splice(pos, 1);
        sheet.remove();
        self.save(true);
        self.render();
      });
    });
    head.appendChild(del);
    sheet.appendChild(head);

    var body = el('div', 'wy-sheet-body');
    var rerender = function () {
      sheet.remove();
      self.openCodexEntry(entry.id, entry.groupId);
      self.save();
    };

    body.appendChild(field('名称', inp(entry.name, function (val) {
      entry.name = val; self.save(); self.render();
    }, '例如：阿萤'), '玩家在图鉴里看到的名字。'));

    body.appendChild(field('属于哪一页', sel(
      WY.codexGroups(p).filter(function (g) { return g.kind === 'list'; })
        .map(function (g) { return [g.id, g.icon + ' ' + g.name]; }),
      entry.groupId || '', function (val) { entry.groupId = val || null; self.save(); self.render(); }
    )));

    var imgs = WY.assetsOfType(p, 'image');
    var picField = field('配图', sel(
      [['', '（不配图）']].concat(imgs.map(function (a) { return [a.id, a.name]; })),
      entry.image || '', function (val) { entry.image = val || null; self.save(); rerender(); }
    ), imgs.length ? '人物卡用立绘，物品用图标，都行。' : '还没有图片素材，去「素材」页上传。');
    if (entry.image && p.assets[entry.image]) {
      var prev = el('img');
      prev.src = p.assets[entry.image].data;
      prev.style.cssText = 'width:110px;border-radius:10px;margin-top:8px;display:block;';
      picField.appendChild(prev);
    }
    body.appendChild(picField);

    var dsc = area(entry.desc, function (val) { entry.desc = val; self.save(); }, '这个人是谁、这个道具有什么来历……');
    dsc.style.height = '110px';
    body.appendChild(field('说明', dsc));

    // 显示哪些变量
    body.appendChild(section('在这张卡上显示哪些数值'));
    if (!p.config.vars.length) {
      body.appendChild(el('div', 'wy-hint', '还没有变量。去「变量」页加一个（比如「好感」），就能在这里勾上了。'));
    } else {
      var chips = el('div', 'wy-row wrap');
      p.config.vars.forEach(function (d) {
        if (!d.key) return;
        var on = (entry.vars || []).indexOf(d.key) >= 0;
        var c = btn('wy-actorchip' + (on ? ' on' : ''), (on ? '✓ ' : '') + d.key);
        c.addEventListener('click', function () {
          entry.vars = entry.vars || [];
          var idx = entry.vars.indexOf(d.key);
          if (idx >= 0) entry.vars.splice(idx, 1); else entry.vars.push(d.key);
          self.save(); rerender();
        });
        chips.appendChild(c);
      });
      body.appendChild(chips);
      body.appendChild(el('div', 'wy-hint', '勾上之后，玩家在图鉴里看到这张卡时，会显示这些数值的实时值。'));
    }

    // 解锁条件
    body.appendChild(section('什么时候解锁'));
    body.appendChild(el('div', 'wy-hint', '不设条件 = 一开始就能看到。设了条件但没满足时，会显示成「？？？」。'));
    body.appendChild(this.conditionBlock(
      function () { return entry.unlock; },
      function (c) { entry.unlock = c; },
      rerender
    ));

    var blurRow = el('label', 'wy-check');
    var blurCb = document.createElement('input');
    blurCb.type = 'checkbox';
    blurCb.checked = entry.blurLocked !== false;
    blurCb.addEventListener('change', function () { entry.blurLocked = blurCb.checked; self.save(); });
    blurRow.appendChild(blurCb);
    blurRow.appendChild(document.createTextNode('没解锁时显示成「？？？」（不勾就直接隐藏）'));
    body.appendChild(blurRow);

    var done = btn('wy-btn-ghost primary', '完成');
    done.style.cssText = 'width:100%;justify-content:center;margin-top:22px;padding:14px;';
    done.addEventListener('click', function () { sheet.remove(); self.save(true); self.render(); });
    body.appendChild(done);

    sheet.appendChild(body);
    document.body.appendChild(sheet);
  };

  Editor.openCodexGroup = function (groupId) {
    var self = this;
    var p = this.project;
    var groups = WY.ensureCodex(p).groups;
    var g = groupId ? groups.filter(function (x) { return x.id === groupId; })[0] : null;
    var isNew = !g;
    if (isNew) g = WY.newCodexGroup({ name: '新分组', icon: '📖', kind: 'list', order: groups.length });

    var body = this.modal(isNew ? '新建分组' : '编辑分组');

    body.appendChild(field('这一页叫什么', inp(g.name, function (val) { g.name = val; }, '人物 / 背包 / 状态…')));

    var iconRow = el('div', 'wy-row wrap');
    CODEX_ICONS.forEach(function (ic) {
      var b = btn('wy-actorchip' + (g.icon === ic ? ' on' : ''), ic);
      b.style.padding = '6px 10px';
      b.addEventListener('click', function () {
        g.icon = ic;
        Array.prototype.forEach.call(iconRow.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
      });
      iconRow.appendChild(b);
    });
    body.appendChild(field('图标', iconRow));

    body.appendChild(field('这一页怎么显示', sel(
      [['list', '条目卡片（人物 / 背包）'], ['status', '数值表（自动列出所有数值）']],
      g.kind, function (val) { g.kind = val; }
    )));

    var sync = btn('wy-menu-item', isNew ? '创建' : '保存');
    sync.style.marginTop = '10px';
    sync.addEventListener('click', function () {
      if (isNew) groups.push(g);
      self.codexGroup = g.id;
      self.closeModal();
      self.save(true);
      self.render();
    });
    body.appendChild(sync);

    if (!isNew) {
      var del = btn('wy-menu-item danger', '删除这一页');
      del.addEventListener('click', function () {
        self.closeModal();
        self.confirm('删除「' + g.name + '」这一页？', '里面的条目也会一起删掉。', function () {
          var entries = WY.ensureCodex(p).entries;
          p.codex.entries = entries.filter(function (e) { return e.groupId !== g.id; });
          p.codex.groups = p.codex.groups.filter(function (x) { return x.id !== g.id; });
          self.codexGroup = null;
          self.save(true);
          self.render();
        });
      });
      body.appendChild(del);
    }
  };

  /** 通用的条件编辑器（选项与图鉴条目共用） */
  Editor.conditionBlock = function (getCond, setCond, rerender) {
    var self = this;
    var p = this.project;
    var wrap = el('div');
    var cond = getCond();

    if (!cond) {
      if (!p.config.vars.length) {
        wrap.appendChild(el('div', 'wy-hint', '先去「变量」页加一个变量，才能设条件。'));
        return wrap;
      }
      var add = btn('wy-btn-ghost', '＋ 加上条件');
      add.style.fontSize = '13px';
      add.addEventListener('click', function () {
        var vd = p.config.vars[0];
        setCond({ logic: 'and', rules: [WY.newRule({ key: vd ? vd.key : '', op: '>=', value: 1 })] });
        self.save();
        rerender();
      });
      wrap.appendChild(add);
      wrap.appendChild(el('div', 'wy-hint', '不设条件就永远可见 / 总是出现。'));
      return wrap;
    }

    var cl = el('div', 'wy-row');
    cl.appendChild(el('span', 'wy-label', '条件'));
    var logicSel = sel([['and', '全部满足'], ['or', '满足任意一条']], cond.logic, function (v) {
      cond.logic = v; self.save(); rerender();
    });
    logicSel.style.flex = '1';
    cl.appendChild(logicSel);
    cl.style.marginBottom = '8px';
    wrap.appendChild(cl);

    cond.rules.forEach(function (r, ri) {
      wrap.appendChild(self.ruleRow(cond.rules, r, ri, function () {
        if (!cond.rules.length) setCond(null);
        self.save();
        rerender();
      }));
    });

    var row = el('div', 'wy-row wrap');
    var add2 = btn('wy-btn-ghost', '＋ 再加一条');
    add2.style.fontSize = '13px';
    add2.addEventListener('click', function () {
      var vd = p.config.vars[0];
      cond.rules.push(WY.newRule({ key: vd ? vd.key : '', op: '>=', value: 1 }));
      self.save(); rerender();
    });
    row.appendChild(add2);
    var rm = btn('wy-btn-ghost danger', '取消条件');
    rm.style.fontSize = '13px';
    rm.addEventListener('click', function () { setCond(null); self.save(); rerender(); });
    row.appendChild(rm);
    wrap.appendChild(row);
    return wrap;
  };

  /* ---------------- 设置 ---------------- */

  Editor.renderConfig = function (v) {
    var self = this;
    var p = this.project;
    var m = p.meta;

    v.appendChild(field('游戏名称', inp(m.title, function (val) { m.title = val; self.save(); }, '我的文字游戏')));

    var author = inp(m.author, function (val) { m.author = val; self.save(); }, '你的名字');
    v.appendChild(field('作者', author));

    v.appendChild(field('简介', area(m.desc, function (val) { m.desc = val; }, '一句话介绍这个故事')));

    // 封面
    v.appendChild(section('封面'));
    if (m.cover && p.assets[m.cover]) {
      var img = el('img');
      img.src = p.assets[m.cover].data;
      img.style.cssText = 'width:150px;border-radius:10px;display:block;margin-bottom:8px;';
      v.appendChild(img);
      var rm = btn('wy-btn-ghost danger', '移除封面');
      rm.addEventListener('click', function () { m.cover = null; self.save(true); self.render(); });
      v.appendChild(rm);
    } else {
      var cf = el('input');
      cf.type = 'file';
      cf.accept = 'image/*';
      cf.style.display = 'none';
      cf.addEventListener('change', function () {
        var f = (cf.files || [])[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var id = WY.uid('a');
          p.assets[id] = { type: 'image', name: '封面', mime: f.type, data: r.result };
          m.cover = id;
          self.save(true);
          self.render();
        };
        r.readAsDataURL(f);
      });
      var cb = btn('wy-btn-ghost', '选择封面图');
      cb.addEventListener('click', function () { cf.click(); });
      v.appendChild(cb);
      v.appendChild(cf);
    }

    // ---- 界面 ----
    var ui = WY.ensureUI(p);
    v.appendChild(section('界面'));
    v.appendChild(el('div', 'wy-inline-note',
      '顶部变量条默认是关的。想给玩家看数值，推荐去「图鉴」页做一个「状态」页 —— ' +
      '玩家想看的时候点开菜单看，不会一直挂在屏幕上。'));

    var hudCount = (p.config.vars || []).filter(function (d) { return WY.varDisplay(d) === 'top'; }).length;
    if (hudCount) {
      v.appendChild(el('div', 'wy-hint', '现在有 ' + hudCount + ' 个变量挂在画面顶上（在「变量」页可以改）。'));
    }

    var fonts = WY.assetList(p).filter(function (a) { return a.type === 'font'; });
    var fontField = field('自定义字体',
      sel([['', '（用系统字体）']].concat(fonts.map(function (a) { return [a.id, a.name]; })),
        ui.font || '', function (val) { ui.font = val || null; self.save(true); self.render(); }),
      fonts.length
        ? '整个游戏（对话框、选项、图鉴）都会用这个字体，导出的 HTML 也带着它。'
        : '还没有字体文件。去「素材」页上传 .ttf / .otf / .woff，再回来这里选。');
    v.appendChild(fontField);
    var fontUp = btn('wy-btn-ghost', '去上传字体');
    fontUp.style.fontSize = '13px';
    fontUp.addEventListener('click', function () { self.setTab('assets'); });
    v.appendChild(fontUp);

    v.appendChild(field('存档位数量', this.rangeInput(ui.saves.slots, 1, 9, function (val) {
      ui.saves.slots = val; self.save();
    }), '不含「自动存档」那一格。'));

    v.appendChild(field('对话框样式', sel(
      WY.BOX_STYLES.map(function (o) { return [o.id, o.label]; }),
      ui.box.style || 'band', function (val) { ui.box.style = val; self.save(); }
    ), '「贴边整条」是大多数 galgame 的样子：一条贴在画面最底下的横条。'));

    v.appendChild(field('对话框最高', this.rangeInput(ui.box.maxHeight, 20, 70, function (val) {
      ui.box.maxHeight = val; self.save();
    }), '对话框固定贴在画面最底下。这里限制它最高占多少 —— 台词太长时会在框内滚动，' +
       '不会一路顶上去把立绘挡住。数字越小，露出来的立绘越多。'));

    v.appendChild(field('屏幕方向', sel(
      WY.ORIENTATIONS.map(function (o) { return [o.id, o.label]; }),
      ui.orientation, function (val) { ui.orientation = val; self.save(true); self.render(); }
    ), '决定舞台画布按什么比例预览；导出的游戏也会尽量锁定这个方向，锁不住就提示玩家转屏。'));

    // 主题
    v.appendChild(section('外观'));
    var t = p.config.theme;
    v.appendChild(field('背景色', this.colorInput(t.bg, function (val) { t.bg = val; self.save(); })));
    v.appendChild(field('文字色', this.colorInput(t.fg, function (val) { t.fg = val; self.save(); })));
    v.appendChild(field('强调色', this.colorInput(t.accent, function (val) { t.accent = val; self.save(); })));
    v.appendChild(field('正文字号', this.rangeInput(t.fontSize, 14, 30, function (val) {
      t.fontSize = val; self.save();
    }), '玩家第一次打开时用这个字号，之后可以在游戏内自己调。'));

    // ---- 界面素材 ----
    v.appendChild(section('界面素材（换成你自己的图）'));
    v.appendChild(el('div', 'wy-hint',
      '留空就用内置样式。填上就整套换成你自己的美术 —— 不然内置的蓝灰色和你的画风会不搭。' +
      '带边框的图建议用「九宫格」，四角不会被拉变形。'));
    var skinImgs = WY.assetsOfType(p, 'image');
    WY.SKIN_SLOTS.forEach(function (slot) {
      var sf = field(slot.label + (slot.hint ? '（' + slot.hint + '）' : ''),
        sel([['', '（用内置样式）']].concat(skinImgs.map(function (a) { return [a.id, a.name]; })),
          (ui.skins || {})[slot.id] || '',
          function (val) { ui.skins[slot.id] = val || null; self.save(true); self.render(); }));
      if (ui.skins[slot.id] && p.assets[ui.skins[slot.id]]) {
        var spv = el('img');
        spv.src = p.assets[ui.skins[slot.id]].data;
        spv.style.cssText = 'max-width:130px;border-radius:8px;margin-top:8px;display:block;';
        sf.appendChild(spv);
      }
      v.appendChild(sf);
    });
    v.appendChild(field('素材怎么铺', sel(
      WY.SKIN_FITS.map(function (o) { return [o.id, o.label]; }),
      ui.skinFit || 'slice',
      function (val) { ui.skinFit = val; self.save(true); self.render(); }
    ), '九宫格保四角，适合带边框的图；拉伸适合纹理和渐变。'));

    // ---- 装饰风格 ----
    v.appendChild(section('装饰风格'));
    v.appendChild(field('想要哪种界面', sel(
      WY.ORNAMENTS.map(function (o) { return [o.id, o.label]; }),
      ui.ornament || 'rune',
      function (val) { ui.ornament = val; self.save(true); self.render(); }
    ), '「异次元」是内置的金线描边 + 角饰 + 辉光 + 转场，纯 CSS 画的，不占体积。' +
       '想走干净路线就选「朴素」，或干脆在下面「界面素材」里整套换成自己的图。'));

    // ---- 尺寸（全部可调）----
    v.appendChild(section('尺寸（想调多大就调多大）'));
    v.appendChild(el('div', 'wy-hint',
      '下面每一项都能单独调。标着「默认」的表示还没动过 —— 拖着滑杆就生效，' +
      '点上面的「▶ 去试玩看看样子」能立刻看到实际效果。'));
    WY.SIZE_FIELDS.forEach(function (sf) {
      var parts = sf.key.split('.');
      var cur = WY.getPath(ui, sf.key);
      var zero = sf.def === 0 ? '默认' : null;
      v.appendChild(field(sf.label + '（' + sf.min + '–' + sf.max + 'px）',
        self.rangeInput(cur, sf.min, sf.max, function (val) {
          ui[parts[0]][parts[1]] = val;
          // 只存盘不重绘：拖动时要保持滑杆焦点，不然拖一下就断
          self.save();
        }, { zeroLabel: zero, def: sf.def }),
        sf.def === 0 ? '「默认」= 跟着整体走，不做特别指定。' : ''));
    });
    var resetSz = btn('wy-btn-ghost', '尺寸全部恢复默认');
    resetSz.addEventListener('click', function () {
      WY.SIZE_FIELDS.forEach(function (sf) {
        var parts = sf.key.split('.');
        ui[parts[0]][parts[1]] = sf.def;
      });
      self.save(true);
      self.render();
      self.toast('尺寸已恢复默认');
    });
    v.appendChild(resetSz);

    // ---- 选项的样子 ----
    var ch = ui.choice;
    v.appendChild(section('选项的样子'));
    v.appendChild(field('出现的位置', sel(WY.CHOICE_LAYOUTS.map(function (o) { return [o.id, o.label]; }), ch.layout,
      function (val) { ch.layout = val; self.save(true); self.render(); }),
      '想摆到任意地方，就选「自由摆放」—— 然后去「演出 → 舞台演出」里，直接把选项块拖到想要的位置。'));
    v.appendChild(field('形状', sel(WY.CHOICE_SHAPES.map(function (o) { return [o.id, o.label]; }), ch.shape,
      function (val) { ch.shape = val; self.save(true); self.render(); })));
    v.appendChild(field('对齐', sel(WY.CHOICE_ALIGNS.map(function (o) { return [o.id, o.label]; }), ch.align,
      function (val) { ch.align = val; self.save(true); self.render(); })));
    v.appendChild(field('宽度', sel(WY.CHOICE_WIDTHS.map(function (o) { return [o.id, o.label]; }), ch.width,
      function (val) { ch.width = val; self.save(true); self.render(); })));

    var choiceImgs = WY.assetsOfType(p, 'image');
    var cbgField = field('选项框素材',
      sel([['', '（用默认样式）']].concat(choiceImgs.map(function (a) { return [a.id, a.name]; })),
        ch.bg || '', function (val) { ch.bg = val || null; self.save(true); self.render(); }),
      choiceImgs.length
        ? '选一张图当所有选项的背景，会被拉伸成选项大小。适合做带花边或木牌的对话按钮。'
        : '还没有图片素材。想要带边框的选项框，先去「素材」页传一张图。');
    if (ch.bg && p.assets[ch.bg]) {
      var cprev = el('img');
      cprev.src = p.assets[ch.bg].data;
      cprev.style.cssText = 'width:100%;border-radius:10px;margin-top:8px;display:block;';
      cbgField.appendChild(cprev);
    }
    v.appendChild(cbgField);

    if (ch.bg) {
      v.appendChild(field('素材怎么铺', sel(
        WY.CHOICE_BGFITS.map(function (o) { return [o.id, o.label]; }),
        ch.bgFit || 'slice', function (val) { ch.bgFit = val; self.save(true); self.render(); }
      ), '带圆角的边框图要用「九宫格」，直接拉伸会把角拉变形。'));
    }

    var previewC = btn('wy-btn-ghost primary', '▶ 去试玩看看样子');
    previewC.addEventListener('click', function () { self.setTab('play'); });
    v.appendChild(previewC);

    // 起始场景
    v.appendChild(section('开场'));
    var startPairs = p.nodes.map(function (n) { return [n.id, WY.nodeLabel(p, n.id)]; });
    v.appendChild(field('开局从哪一场开始', sel(startPairs, p.config.startNode, function (val) {
      p.config.startNode = val; self.save(true); self.render();
    })));

    // 数据
    v.appendChild(section('数据'));
    var info = el('div', 'wy-inline-note');
    var st = WY.stats(p);
    info.textContent = st.nodes + ' 个场景 / ' + st.choices + ' 个选项 / ' + st.endings +
      ' 个结局 / ' + st.chars + ' 字 / ' + st.assets + ' 个素材（' + WY.formatBytes(st.assetBytes) + '）';
    v.appendChild(info);

    var row = el('div', 'wy-row wrap');
    row.style.marginTop = '12px';
    var b1 = btn('wy-btn-ghost', '导出工程文件');
    b1.addEventListener('click', function () { root.WYIO.exportProject(self.project, self); });
    row.appendChild(b1);

    var b2 = btn('wy-btn-ghost primary', '导出可分享的游戏');
    b2.addEventListener('click', function () { root.WYIO.exportStandalone(self.project, self); });
    row.appendChild(b2);
    v.appendChild(row);

    v.appendChild(el('div', 'wy-hint',
      '「工程文件」(.wy) 只有装了本工具的人能打开继续改；「可分享的游戏」是单个 HTML 文件，别人用手机浏览器打开就能直接玩，什么都不用装。'));

    var dangerRow = el('div', 'wy-row wrap');
    dangerRow.style.marginTop = '22px';
    var b3 = btn('wy-btn-ghost danger', '清空所有存档');
    b3.addEventListener('click', function () {
      self.confirm('清空这个游戏的所有存档？', '包括自动存档。', function () {
        Store.clearSaves(p.id);
        self.toast('已清空存档');
      });
    });
    dangerRow.appendChild(b3);
    v.appendChild(dangerRow);
  };

  Editor.colorInput = function (value, onchange) {
    var wrap = el('div', 'wy-row');
    var c = el('input');
    c.type = 'color';
    c.value = value || '#000000';
    c.style.cssText = 'width:52px;height:38px;padding:2px;border-radius:10px;border:1px solid var(--line);background:none;';
    c.addEventListener('input', function () { onchange(c.value); });
    wrap.appendChild(c);
    var t = inp(value, function (v) { if (/^#[0-9a-f]{6}$/i.test(v)) { c.value = v; onchange(v); } });
    wrap.appendChild(t);
    return wrap;
  };

  /**
   * 一行滑杆。
   * opts: { step, unit, zeroLabel, def }
   *
   * 坑：原来是 value || 18 —— 0 是合法值（尺寸类字段里 0 = 跟随默认），
   * 会被 || 吃成 18，于是「默认」永远显示成 18px。
   */
  Editor.rangeInput = function (value, min, max, onchange, opts) {
    opts = opts || {};
    var step = opts.step || 1;
    var unit = opts.unit === undefined ? 'px' : opts.unit;
    var wrap = el('div', 'wy-row');
    var r = el('input');
    r.type = 'range';
    r.min = String(min); r.max = String(max); r.step = String(step);
    var n0 = Number(value);
    var v0 = (value === null || value === undefined || value === '' || isNaN(n0))
      ? min : Math.max(min, Math.min(max, n0));
    r.value = String(v0);
    r.style.cssText = 'flex:1;accent-color:var(--accent);';
    var out = el('span', null, '');
    out.style.cssText = 'width:72px;text-align:right;color:var(--dim);font-size:13px;';
    var show = function (v) {
      // 对「0 = 跟随默认」的字段，显示「默认」比显示 0px 好懂
      out.textContent = (v === 0 && opts.zeroLabel) ? opts.zeroLabel : (v + unit);
    };
    show(v0);
    r.addEventListener('input', function () {
      var v = Number(r.value);
      show(v);
      onchange(v);
    });
    wrap.appendChild(r);
    wrap.appendChild(out);
    return wrap;
  };

  /* ---------------- 试玩 ---------------- */

  Editor.renderPlay = function () {
    var self = this;
    if (this.player) return;
    var issues = WY.validate(this.project).filter(function (i) { return i.level === 'error'; });
    if (issues.length) {
      this.toast('有 ' + issues.length + ' 个错误，先修一下');
      this.setTab('story', true);
      this.showValidation();
      return;
    }
    var host = el('div', 'wy-playhost');
    document.body.appendChild(host);
    this.playHost = host;
    this.player = root.WYPlayer.create(host, this.project, {
      gameId: this.project.id,
      onExit: function () { self.setTab('story'); }
    });
  };

  Editor.teardownPlayer = function () {
    if (this.player) { this.player.destroy(); this.player = null; }
    if (this.playHost) { this.playHost.remove(); this.playHost = null; }
  };

  /* ---------------- 校验面板 ---------------- */

  Editor.showValidation = function () {
    var self = this;
    var issues = WY.validate(this.project);
    var body = this.modal('检查结果');
    if (!issues.length) {
      body.appendChild(el('div', 'wy-inline-note', '✓ 没问题，故事是通的。'));
      return;
    }
    issues.forEach(function (it) {
      var row = el('div', 'wy-menu-item');
      row.style.cursor = it.nodeId ? 'pointer' : 'default';
      var tag = el('span', 'wy-badge ' + (it.level === 'error' ? 'wy-err' : 'wy-warn'),
        it.level === 'error' ? '错误' : '提醒');
      row.appendChild(tag);
      row.appendChild(document.createTextNode(' ' + it.text));
      if (it.nodeId) {
        row.addEventListener('click', function () {
          self.closeModal();
          self.openNode(it.nodeId);
        });
      }
      body.appendChild(row);
    });
    body.appendChild(el('div', 'wy-hint', '点任意一条可以直接跳到那个场景。'));
  };

  /* ---------------- 弹窗 ---------------- */

  Editor.modal = function (title) {
    var self = this;
    this.closeModal();
    var mask = el('div', 'wy-modal-mask');
    var m = el('div', 'wy-modal');
    var h = el('h3', null, title);
    m.appendChild(h);
    mask.appendChild(m);
    mask.addEventListener('click', function (e) { if (e.target === mask) self.closeModal(); });
    this.layer.appendChild(mask);
    this._modal = mask;
    return m;
  };

  Editor.closeModal = function () {
    if (this._modal) { this._modal.remove(); this._modal = null; }
  };

  Editor.confirm = function (title, desc, onYes, yesLabel) {
    var self = this;
    var body = this.modal(title);
    if (desc) body.appendChild(el('div', 'wy-hint', desc));
    body.appendChild(el('div', null, ' '));
    var yes = btn('wy-menu-item danger', yesLabel || '确定删除');
    yes.addEventListener('click', function () { self.closeModal(); onYes(); });
    body.appendChild(yes);
    var no = btn('wy-menu-item', '取消');
    no.addEventListener('click', function () { self.closeModal(); });
    body.appendChild(no);
  };

  Editor.prompt = function (title, value, onOk) {
    var self = this;
    var body = this.modal(title);
    var i = inp(value, function () {});
    body.appendChild(i);
    var ok = btn('wy-menu-item', '确定');
    ok.style.marginTop = '12px';
    ok.addEventListener('click', function () { self.closeModal(); onOk(i.value); });
    body.appendChild(ok);
    setTimeout(function () { i.focus(); i.select(); }, 60);
  };

  /* ---------------- 更多菜单 ---------------- */

  Editor.openMore = function () {
    var self = this;
    var body = this.modal('更多');

    var items = [
      ['📤  导出工程文件', '给别人继续编辑（.wy，需要装本工具）', function () { root.WYIO.exportProject(self.project, self); }],
      ['🎮  导出可分享的游戏', '单个 HTML，别人浏览器直接玩', function () { root.WYIO.exportStandalone(self.project, self); }],
      ['📥  导入文件', '打开 .wy 工程或 .html 游戏', function () { root.WYIO.pickImport(self); }],
      ['📁  工程库', '切换 / 新建 / 删除工程', function () { self.openLibrary(); }],
      ['✏️  重命名', '改这个工程的存档名', function () {
        self.prompt('重命名工程', self.project.meta.title, function (v) {
          if (v.trim()) { self.project.meta.title = v.trim(); self.save(true); self.updateTitle(); }
        });
      }],
      ['💾  立即保存', '强制写入本地存储', function () { self.save(true); self.toast('已保存'); }],
      ['ℹ️  关于', '版本与使用说明', function () { self.openAbout(); }]
    ];

    items.forEach(function (it) {
      var b = btn('wy-menu-item');
      b.appendChild(document.createTextNode(it[0]));
      b.appendChild(el('small', null, it[1]));
      b.addEventListener('click', function () { self.closeModal(); it[2](); });
      body.appendChild(b);
    });
  };

  Editor.openAbout = function () {
    var body = this.modal('关于文游工坊');
    var p = el('div', 'wy-hint');
    p.style.fontSize = '13px';
    p.innerHTML = '';
    [
      '一、写剧情',
      '在「剧情」页新建场景，写正文。加选项，每个选项选一个去向，故事就分岔了。',
      '',
      '二、加图片和音乐',
      '在「素材」页上传，回到场景里就能在下拉框里选。',
      '',
      '三、放角色（galgame 那套）',
      '场景编辑器顶部切到「演出」页 →「舞台演出」→ 添加角色。可以拖立绘摆位置、用一键预设做出场退场、打关键帧。填了「谁在说话」，玩的时候他就亮着、其他人变暗。',
      '',
      '四、设结局',
      '场景编辑器顶部切到「结局」页 → 点「把这一场设为结局」，再填结局名。一部作品可以有多个结局，那一页下面会列出全部结局。',
      '',
      '五、加数值',
      '在「变量」页建变量（比如「好感度」），在选项上设「效果」增减它，再用「显示条件」决定某个选项出不出现。',
      '',
      '六、给别人玩',
      '「导出可分享的游戏」会生成一个 HTML 文件。别人用手机浏览器打开这个文件就能直接玩，不用装任何东西。',
      '',
      '数据全部存在这台手机上，不联网、不上传。'
    ].forEach(function (line) {
      p.appendChild(document.createTextNode(line));
      p.appendChild(document.createElement('br'));
    });
    body.appendChild(p);
  };

  /* ---------------- 工程库 ---------------- */

  Editor.openLibrary = function () {
    var self = this;
    var body = this.modal('工程库');
    body.appendChild(el('div', 'wy-hint', '加载中…'));

    Store.summaries().then(function (list) {
      body.innerHTML = '';
      body.appendChild(el('h3', null, '工程库'));

      var nb = btn('wy-menu-item');
      nb.appendChild(document.createTextNode('＋  新建一个工程'));
      nb.addEventListener('click', function () {
        self.closeModal();
        var p = WY.newProject();
        Store.put(p).then(function () { self.load(p); self.setTab('story', true); self.toast('新建成功'); });
      });
      body.appendChild(nb);

      var ib = btn('wy-menu-item');
      ib.appendChild(document.createTextNode('📥  从文件导入'));
      ib.appendChild(el('small', null, '.wy 工程文件 或 别人分享的 .html 游戏'));
      ib.addEventListener('click', function () { self.closeModal(); root.WYIO.pickImport(self); });
      body.appendChild(ib);

      // ---- 示例 ----
      body.appendChild(el('div', 'wy-section-title', '示例'));

      var demoLink = document.createElement('a');
      demoLink.className = 'wy-menu-item';
      demoLink.href = './demo.html';
      demoLink.target = '_blank';
      demoLink.rel = 'noopener';
      demoLink.appendChild(document.createTextNode('▶  试玩示例《雾港三日》'));
      demoLink.appendChild(el('small', null, '19 场景 · 3 个结局 · 3 个立绘角色 · 带关键帧演出'));
      demoLink.addEventListener('click', function () { self.closeModal(); });
      body.appendChild(demoLink);

      var demoImp = btn('wy-menu-item');
      demoImp.appendChild(document.createTextNode('📥  把示例导入成我的工程'));
      demoImp.appendChild(el('small', null, '打开来照着改，不影响原来的示例文件'));
      demoImp.addEventListener('click', function () {
        self.closeModal();
        root.WYIO.importFromUrl('./demo.wy', self);
      });
      body.appendChild(demoImp);

      if (!list.length) {
        body.appendChild(el('div', 'wy-hint', '还没有其它工程。'));
        return;
      }

      list.forEach(function (s) {
        var row = el('div', 'wy-menu-item');
        var isCur = self.project && s.id === self.project.id;
        row.appendChild(document.createTextNode((isCur ? '● ' : '') + (s.title || '未命名')));
        var meta = s.stats.nodes + ' 场景 · ' + s.stats.chars + ' 字 · ' +
          (s.updatedAt ? s.updatedAt.slice(0, 16).replace('T', ' ') : '');
        row.appendChild(el('small', null, meta));

        var acts = el('div', 'wy-row');
        acts.style.marginTop = '9px';
        var open = btn('wy-btn-ghost primary', isCur ? '正在编辑' : '打开');
        if (isCur) open.setAttribute('disabled', 'disabled');
        open.addEventListener('click', function (e) {
          e.stopPropagation();
          self.closeModal();
          Store.get(s.id).then(function (p) {
            if (!p) { self.toast('这个工程读不出来了'); return; }
            self.load(WY.normalize(p));
          });
        });
        acts.appendChild(open);

        var dup = btn('wy-btn-ghost', '复制');
        dup.addEventListener('click', function (e) {
          e.stopPropagation();
          Store.get(s.id).then(function (p) {
            var copy = WY.normalize(p);
            copy.id = WY.uid('p');
            copy.meta.title = (copy.meta.title || '未命名') + ' 副本';
            Store.put(copy).then(function () { self.toast('已复制'); self.openLibrary(); });
          });
        });
        acts.appendChild(dup);

        var rm = btn('wy-btn-ghost danger', '删除');
        rm.addEventListener('click', function (e) {
          e.stopPropagation();
          self.closeModal();
          self.confirm('删除工程「' + s.title + '」？', '删了就找不回来了。', function () {
            Store.del(s.id).then(function () {
              if (self.project && self.project.id === s.id) {
                return Store.all().then(function (all) {
                  if (all.length) { self.load(WY.normalize(all[0])); }
                  else { var np = WY.newProject(); return Store.put(np).then(function () { self.load(np); }); }
                });
              }
            }).then(function () { self.toast('已删除'); self.render(); });
          });
        });
        acts.appendChild(rm);
        row.appendChild(acts);
        body.appendChild(row);
      });
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(el('h3', null, '工程库'));
      body.appendChild(el('div', 'wy-hint', '读取失败：' + e.message));
    });
  };

  root.WYEditor = Editor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
