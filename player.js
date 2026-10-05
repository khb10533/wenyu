/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 播放器
 * 负责：正文逐字显示、选项、条件分支、变量、背景图、BGM、存档、结局。
 * 编辑器试玩与导出的独立游戏共用这一份代码。
 * ============================================================ */
(function (root) {
  'use strict';

  var WY = root.WY;
  var Store = root.WYStore;

  var SPEEDS = { slow: 34, normal: 16, fast: 6, instant: 0 };
  var SPEED_LABELS = { slow: '慢', normal: '正常', fast: '快', instant: '瞬间' };
  var MAX_HISTORY = 60;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function btn(cls, text) {
    var b = el('button', cls || 'wy-btn', text);
    b.type = 'button';
    return b;
  }

  /* ========================================================== */

  function Player(host, project, opts) {
    opts = opts || {};
    this.host = host;
    this.project = project;
    this.opts = opts;
    this.gameId = opts.gameId || project.id || 'local';
    this.storeOn = opts.storage !== false;
    this.onExit = opts.onExit || null;
    this.embed = !!opts.embed;

    var prefs = (Store && Store.prefs && Store.prefs()) || {};
    var themeFS = (project.config && project.config.theme && project.config.theme.fontSize) || 18;
    this.settings = {
      fontSize: typeof prefs.playerFontSize === 'number' ? prefs.playerFontSize : themeFS,
      speed: SPEEDS[prefs.playerSpeed] !== undefined ? prefs.playerSpeed : 'normal',
      muted: !!prefs.playerMuted
    };

    this.vars = WY.initialVars(project);
    this.faces = {};          // 每个角色此刻用的是哪张脸
    this.used = {};
    this.history = [];
    this.node = null;
    this.typing = null;
    this.pendingNext = null;
    this.needGesture = false;
    this.destroyed = false;

    this.build();
    this.applyUI();
    this.start();
  }

  /* ---------------- DOM ---------------- */

  Player.prototype.build = function () {
    var self = this;
    var p = el('div', 'wy-player' + (this.embed ? ' wy-embed' : ''));
    this.root = p;
    this.applyTheme();

    this.bg = el('div', 'wy-bg');
    p.appendChild(this.bg);
    p.appendChild(el('div', 'wy-scrim'));

    // 立绘层：夹在背景和文字之间
    this.stageHost = el('div', 'wy-stage-host');
    p.appendChild(this.stageHost);

    var top = el('div', 'wy-top');
    if (this.onExit) {
      this.btnExit = btn('wy-ibtn', '‹');
      this.btnExit.title = '返回';
      this.btnExit.addEventListener('click', function (e) { e.stopPropagation(); self.exit(); });
      top.appendChild(this.btnExit);
    }
    this.titleEl = el('div', 'wy-title', (this.project.meta && this.project.meta.title) || '');
    top.appendChild(this.titleEl);
    this.btnMenu = btn('wy-ibtn', '☰');
    this.btnMenu.title = '菜单';
    this.btnMenu.addEventListener('click', function (e) { e.stopPropagation(); self.openMenu(); });
    top.appendChild(this.btnMenu);
    p.appendChild(top);

    this.hud = el('div', 'wy-hud');
    p.appendChild(this.hud);

    this.main = el('div', 'wy-main');
    this.textbox = el('div', 'wy-textbox');
    this.nameEl = el('div', 'wy-namebar');
    this.textbox.appendChild(this.nameEl);
    this.textEl = el('span');
    this.caret = el('span', 'wy-caret');
    this.textbox.appendChild(this.textEl);
    this.textbox.appendChild(this.caret);
    this.hint = el('div', 'wy-next-hint');
    this.choicesEl = el('div', 'wy-choices');

    this.main.appendChild(this.textbox);
    this.main.appendChild(this.hint);
    this.main.addEventListener('click', function () { self.onTap(); });
    p.appendChild(this.main);

    // 选项放在 main 外面：中间的「悬浮」布局才不会被滚动容器裁掉
    p.appendChild(this.choicesEl);

    // 图鉴 / 存档这类整页界面挂这里
    this.screenHost = el('div', 'wy-screen-host');
    p.appendChild(this.screenHost);

    // 竖屏游戏被横着拿时的提示
    this.rotateHint = el('div', 'wy-rotate-hint');
    var hintInner = el('div', 'wy-rotate-inner');
    this.rotateHintText = el('div', 'wy-rotate-text', '↻  请把手机竖过来');
    hintInner.appendChild(this.rotateHintText);
    hintInner.appendChild(el('div', 'wy-rotate-sub', '点一下可以不管它，先这么玩'));
    this.rotateHint.appendChild(hintInner);
    this.rotateHint.addEventListener('click', function (e) {
      e.stopPropagation();
      self._rotateDismissed = true;
      self.root.classList.remove('wy-need-rotate');
    });
    p.appendChild(this.rotateHint);

    this.sheetHost = el('div');
    p.appendChild(this.sheetHost);

    this.audio = null;
    this.currentBgm = null;

    this.host.innerHTML = '';
    this.host.appendChild(p);
  };

  /** 选项出现在哪：单场设置优先，否则用全局 */
  Player.prototype.applyChoiceLayout = function (layout) {
    var c = this.root.classList;
    ['below', 'center', 'bottom', 'free'].forEach(function (k) { c.toggle('wy-ch-' + k, layout === k); });
    this.choiceLayout = layout;
  };

  Player.prototype.applyUI = function () {
    var self = this;
    var ui = WY.ensureUI(this.project);
    var c = this.root.classList;
    this.applyChoiceLayout(ui.choice.layout);
    ['bar', 'card', 'plain', 'numbered'].forEach(function (k) { c.toggle('wy-shape-' + k, ui.choice.shape === k); });
    c.toggle('wy-choicebg-slice', ui.choice.bgFit === 'slice');
    c.toggle('wy-choicebg-img', !!(bg && bg.data));

    // 固定比例画布：横屏游戏按 16:9 渲染，装不下就在四周留边。
    // 网页没法强制手机转屏 —— 这才是让横屏游戏真正能玩的办法。
    c.toggle('wy-fit-portrait', ui.orientation === 'portrait');
    c.toggle('wy-fit-landscape', ui.orientation === 'landscape');
    this.choicesEl.classList.toggle('wy-align-center', ui.choice.align === 'center');
    this.root.style.setProperty('--wy-choice-w',
      ui.choice.width === 'wide' ? '80%' : (ui.choice.width === 'narrow' ? '60%' : '100%'));

    var bg = ui.choice.bg ? this.project.assets[ui.choice.bg] : null;
    this.root.style.setProperty('--wy-choice-img', (bg && bg.data) ? 'url("' + bg.data + '")' : 'none');

    // 自由摆放的坐标
    this.root.style.setProperty('--wy-choice-x', (ui.choice.x * 100) + '%');
    this.root.style.setProperty('--wy-choice-y', (ui.choice.y * 100) + '%');

    // 对话框最高占多少：钉在底部，超出就在框里滚，免得长台词顶上去挡住立绘
    this.root.style.setProperty('--wy-box-max', (ui.box.maxHeight || 40) + '%');
    // 对话框样式：贴边整条 / 悬浮卡片
    c.toggle('wy-box-band', ui.box.style !== 'card');
    c.toggle('wy-box-card', ui.box.style === 'card');

    // 界面素材：作者把自己的图换上去（对话框底、名牌、选项框、图鉴卡、存档格、面板）
    var skins = ui.skins || {};
    WY.SKIN_SLOTS.forEach(function (slot) {
      var a = skins[slot.id] ? self.project.assets[skins[slot.id]] : null;
      var on = !!(a && a.data);
      c.toggle('wy-skin-' + slot.id, on);
      self.root.style.setProperty('--wy-skin-' + slot.id, on ? 'url("' + a.data + '")' : 'none');
    });
    c.toggle('wy-skinfit-slice', ui.skinFit !== 'stretch');
    c.toggle('wy-skinfit-stretch', ui.skinFit === 'stretch');

    this.applyFont(ui.font);
    this.applyOrientation(ui.orientation);
  };

  /** 竖屏 / 横屏：先尽力锁定，锁不住就提示玩家转一下 */
  Player.prototype.applyOrientation = function (want) {
    var self = this;
    want = want || 'portrait';

    if (this._rotateCheck) {
      root.removeEventListener('resize', this._rotateCheck);
      root.removeEventListener('orientationchange', this._rotateCheck);
      this._rotateCheck = null;
    }
    this.root.classList.remove('wy-need-rotate');
    if (this._rotateWant !== want) this._rotateDismissed = false;
    this._rotateWant = want;
    this.rotateHintText.textContent = '↻  请把手机' + (want === 'landscape' ? '横过来' : '竖过来');
    if (want === 'auto') return;

    // screen.orientation.lock 只有全屏 / 已安装 PWA 才生效，失败就算了
    try {
      if (root.screen && root.screen.orientation && root.screen.orientation.lock) {
        var pr = root.screen.orientation.lock(want);
        if (pr && pr.catch) pr.catch(function () {});
      }
    } catch (e) {}

    var check = function () {
      if (self._rotateDismissed) {
        self.root.classList.remove('wy-need-rotate');
        return;
      }
      // 只在手机尺寸上提示，桌面宽屏不要一直被挡住
      if (Math.min(root.innerWidth || 9999, root.innerHeight || 9999) > 620) {
        self.root.classList.remove('wy-need-rotate');
        return;
      }
      var isLand = (root.innerWidth || 0) > (root.innerHeight || 0);
      self.root.classList.toggle('wy-need-rotate', isLand !== (want === 'landscape'));
    };
    this._rotateCheck = check;
    root.addEventListener('resize', check);
    root.addEventListener('orientationchange', check);
    check();
  };

  /** 作者自己传的字体（@font-face + dataURL） */
  Player.prototype.applyFont = function (assetId) {
    if (this._fontStyle) { this._fontStyle.remove(); this._fontStyle = null; }
    this.root.style.removeProperty('--wy-font');
    if (!assetId) return;
    var a = this.project.assets ? this.project.assets[assetId] : null;
    if (!a || !a.data) return;
    try {
      var st = document.createElement('style');
      st.textContent = '@font-face{font-family:"WYUserFont";font-display:swap;src:url("' + a.data + '");}';
      document.head.appendChild(st);
      this._fontStyle = st;
      this.root.style.setProperty('--wy-font', '"WYUserFont"');
    } catch (e) {}
  };

  Player.prototype.applyTheme = function () {
    var t = (this.project.config && this.project.config.theme) || {};
    var s = this.root.style;
    s.setProperty('--wy-bg', t.bg || '#0f1115');
    s.setProperty('--wy-fg', t.fg || '#e9edf2');
    s.setProperty('--wy-accent', t.accent || '#5aa9ff');
    s.setProperty('--wy-fs', this.settings.fontSize + 'px');
    if (t.font) s.setProperty('--wy-font', t.font);
  };

  Player.prototype.toast = function (msg, ms) {
    var self = this;
    if (this._toast) this._toast.remove();
    var t = el('div', 'wy-toast', msg);
    this._toast = t;
    this.root.appendChild(t);
    setTimeout(function () {
      if (self._toast === t) { t.remove(); self._toast = null; }
    }, ms || 1600);
  };

  /* ---------------- 生命周期 ---------------- */

  Player.prototype.start = function () {
    var startId = this.project.config.startNode;
    if (WY.nodeIndex(this.project, startId) < 0) startId = this.project.nodes[0] && this.project.nodes[0].id;
    if (!startId) { this.textEl.textContent = '这个游戏还没有任何场景。'; return; }
    this.goto(startId, { noHistory: true });
  };

  Player.prototype.restart = function () {
    this.stopAudio();
    this.vars = WY.initialVars(this.project);
    this.faces = {};
    this.used = {};
    this.history = [];
    this.start();
    this.toast('已从头开始');
  };

  Player.prototype.destroy = function () {
    this.destroyed = true;
    if (this._autoTimer) clearTimeout(this._autoTimer);
    if (this.stageView && root.WYStage) root.WYStage.stop(this.stageView);
    this.stageView = null;
    if (this._fontStyle) { this._fontStyle.remove(); this._fontStyle = null; }
    if (this._rotateCheck) {
      root.removeEventListener('resize', this._rotateCheck);
      root.removeEventListener('orientationchange', this._rotateCheck);
      this._rotateCheck = null;
    }
    this.stopTyping();
    this.stopAudio();
    if (this.host) this.host.innerHTML = '';
  };

  Player.prototype.exit = function () {
    if (this.onExit) this.onExit();
  };

  /* ---------------- 存档快照 ---------------- */

  Player.prototype.snapshot = function () {
    return {
      node: this.node ? this.node.id : null,
      vars: JSON.parse(JSON.stringify(this.vars)),
      faces: JSON.parse(JSON.stringify(this.faces)),
      used: JSON.parse(JSON.stringify(this.used))
    };
  };

  Player.prototype.restore = function (s) {
    if (!s || !s.node) return false;
    var n = WY.getNode(this.project, s.node);
    if (!n) return false;
    this.vars = JSON.parse(JSON.stringify(s.vars || {}));
    this.faces = JSON.parse(JSON.stringify(s.faces || {}));
    this.used = JSON.parse(JSON.stringify(s.used || {}));
    this.render(n, { skipEffects: true });
    return true;
  };

  /* ---------------- 核心：进入场景 ---------------- */

  Player.prototype.goto = function (id, o) {
    o = o || {};
    var n = WY.getNode(this.project, id);
    if (!n) { this.toast('这个选项指向的场景不存在'); return; }
    if (!o.noHistory) {
      this.history.push(this.snapshot());
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
    this.render(n);
  };

  Player.prototype.goBack = function () {
    if (!this.history.length) { this.toast('已经是最开始了'); return; }
    var s = this.history.pop();
    this.restore(s);
    this.toast('回退一步');
  };

  Player.prototype.render = function (node, o) {
    o = o || {};
    var self = this;
    this.node = node;
    this.pendingNext = null;
    this.hint.textContent = '';
    this.choicesEl.innerHTML = '';
    this.root.classList.remove('wy-has-choices');
    this.closeScreen();
    this.main.classList.remove('wy-center');

    if (!o.skipEffects) {
      var before = JSON.parse(JSON.stringify(this.vars));
      WY.applyEffects(this.project, this.vars, node.onEnter, this.faces);
      this.flashChanged(before);
    }

    this.applyChoiceLayout(WY.effectiveChoiceLayout(this.project, node));
    this.renderBg(node.bg);
    this.renderStage(node);
    this.playBgm(node.bgm);
    this.renderHud();
    this.autoSave();

    this.renderText(node.text || '', function () { self.afterText(node); });
  };

  /** 渲染立绘、说话人名牌，并从 0 播一遍关键帧动画 */
  Player.prototype.renderStage = function (node) {
    if (this.stageView && root.WYStage) root.WYStage.stop(this.stageView);
    this.stageView = null;

    var speaker = String(node.speaker == null ? '' : node.speaker).trim();
    this.nameEl.textContent = speaker;
    this.textbox.classList.toggle('has-name', !!speaker);

    if (!this.stageHost || !root.WYStage) return;

    var st = WY.ensureStage(node);
    var visible = st.actors.filter(function (a) { return WY.actorHasStage(node, a.id); }, this);
    if (!visible.length) {
      this.stageHost.innerHTML = '';
      this.stageHost.classList.remove('wy-stagebox');
      this.stageHost.style.display = 'none';
      return;
    }
    this.stageHost.style.display = '';
    this.stageView = root.WYStage.mount(this.stageHost, this.project, node, {
      withBg: false, faces: this.faces
    });
    root.WYStage.setSpeaker(this.stageView, speaker);
    root.WYStage.play(this.stageView);
  };

  Player.prototype.afterText = function (node) {
    var self = this;

    // 结局：只要 ending 对象在就演，标题/说明可以留空
    var end = node.ending;
    if (end) {
      this.main.classList.add('wy-center');
      this.textbox.style.display = 'none';
      var card = el('div', 'wy-ending');
      card.appendChild(el('div', 'wy-ending-tag', '结 局'));
      card.appendChild(el('div', 'wy-ending-title', end.title || node.title || '结局'));
      if (end.text) card.appendChild(el('div', 'wy-ending-text', end.text));
      var acts = el('div', 'wy-ending-actions');
      var again = btn('wy-btn wy-primary', '再玩一次');
      again.addEventListener('click', function (e) { e.stopPropagation(); self.restart(); });
      var back = btn('wy-btn', '回退一步');
      back.addEventListener('click', function (e) { e.stopPropagation(); self.goBack(); });
      acts.appendChild(again);
      if (this.history.length) acts.appendChild(back);
      card.appendChild(acts);
      this.choicesEl.appendChild(card);
      return;
    }

    var avail = WY.availableChoices(this.project, node, this.vars, this.used);
    if (avail.length) {
      this.renderChoices(avail);
      return;
    }

    if (node.autoNext) {
      this.pendingNext = function () { self.goto(node.autoNext); };
      this.hint.textContent = '点一下继续 ▾';
      return;
    }

    // 作者没给出路
    this.pendingNext = null;
    this.hint.textContent = '（这里没有后续，故事断了）';
  };

  Player.prototype.renderChoices = function (list) {
    var self = this;
    var ui = WY.ensureUI(this.project);
    var layout = WY.effectiveChoiceLayout(this.project, this.node);
    var free = layout === 'free';
    var mid = (list.length - 1) / 2;

    this.choicesEl.innerHTML = '';
    this.root.classList.add('wy-has-choices');
    list.forEach(function (c, i) {
      var b = btn('wy-choice', c.hideText ? '' : (c.text || '（未填选项文字）'));
      b.style.animationDelay = (i * 55) + 'ms';

      // 自由摆放：每个选项可以有自己的位置，没设就按整块的位置依次排开
      if (free) {
        var cx = typeof c.x === 'number' ? c.x : ui.choice.x;
        var cy = typeof c.y === 'number' ? c.y : (ui.choice.y + (i - mid) * 0.12);
        b.style.left = (cx * 100) + '%';
        b.style.top = (cy * 100) + '%';
      }

      // 选项自己的图片统一用 CSS 变量传，这样「拉伸」和「九宫格」两种铺法都能用
      var asset = c.img ? self.project.assets[c.img] : null;
      if (asset && asset.data) {
        b.style.setProperty('--wy-choice-img', 'url("' + asset.data + '")');
        if (c.hideText) {
          // 整块就是一张图
          b.classList.add('wy-choice-imgonly');
          var size = WY.assetSize(asset);
          if (size) b.style.aspectRatio = size.w + ' / ' + size.h;
          b.setAttribute('aria-label', c.text || '选项');
        } else {
          b.classList.add('wy-choice-hasimg');
        }
      }
      if (c.hideText && !(asset && asset.data)) {
        // 只显示图片但没配图，退回文字，免得玩家点不到
        b.textContent = c.text || '（这个选项还没配图）';
      }

      b.addEventListener('click', function (e) { e.stopPropagation(); self.choose(c); });
      self.choicesEl.appendChild(b);
    });
  };

  Player.prototype.choose = function (c) {
    var before = JSON.parse(JSON.stringify(this.vars));
    WY.applyEffects(this.project, this.vars, c.effects, this.faces);
    if (c.once) this.used[c.id] = true;
    this.flashChanged(before);
    this.renderHud();
    if (c.to) this.goto(c.to);
    else this.toast('这个选项还没设置去向');
  };

  /* ---------------- 正文逐字 ---------------- */

  Player.prototype.renderText = function (text, done) {
    var self = this;
    this.stopTyping();
    this.textbox.style.display = '';
    this.textEl.textContent = '';
    this.caret.style.display = 'inline-block';

    var speed = SPEEDS[this.settings.speed];
    if (!text) {
      this.caret.style.display = 'none';
      done();
      return;
    }
    if (!speed) {
      this.textEl.textContent = text;
      this.caret.style.display = 'none';
      done();
      return;
    }
    var t = { i: 0, text: text, done: done, timer: 0 };
    this.typing = t;
    t.timer = setInterval(function () {
      if (self.destroyed) { clearInterval(t.timer); return; }
      t.i += 1;
      self.textEl.textContent = text.slice(0, t.i);
      // 框内超长了就跟着往下滚，读的人不用手动拨
      if (self.textbox.scrollHeight > self.textbox.clientHeight) {
        self.textbox.scrollTop = self.textbox.scrollHeight;
      }
      if (t.i >= text.length) self.finishTyping();
    }, speed);
  };

  Player.prototype.finishTyping = function () {
    var t = this.typing;
    if (!t) return;
    clearInterval(t.timer);
    this.typing = null;
    this.textEl.textContent = t.text;
    this.caret.style.display = 'none';
    if (t.done) t.done();
  };

  Player.prototype.stopTyping = function () {
    if (this.typing) { clearInterval(this.typing.timer); this.typing = null; }
    this.caret.style.display = 'none';
  };

  Player.prototype.onTap = function () {
    if (this.needGesture) { this.needGesture = false; this.playBgm(this.currentBgmId); }
    if (this.typing) { this.finishTyping(); return; }
    if (this.pendingNext) { var f = this.pendingNext; this.pendingNext = null; f(); }
  };

  /* ---------------- 背景图 / 音乐 ---------------- */

  Player.prototype.assetData = function (id) {
    if (!id) return null;
    var a = this.project.assets && this.project.assets[id];
    return a && a.data ? a.data : null;
  };

  Player.prototype.renderBg = function (id) {
    var data = this.assetData(id);
    if (data) {
      this.bg.style.backgroundImage = 'url("' + data + '")';
      this.bg.classList.add('wy-on');
    } else {
      this.bg.classList.remove('wy-on');
      this.bg.style.backgroundImage = '';
    }
  };

  Player.prototype.playBgm = function (id) {
    this.currentBgmId = id || null;
    var data = this.assetData(id);
    if (!data) { this.stopAudio(); return; }
    if (this.currentBgm === id && this.audio && !this.audio.paused) return;

    this.stopAudio();
    if (this.settings.muted) return;

    var a = new Audio(data);
    a.loop = true;
    a.volume = 0.55;
    this.audio = a;
    this.currentBgm = id;
    var self = this;
    var play = a.play();
    if (play && play.catch) {
      play.catch(function () { self.needGesture = true; });
    }
  };

  Player.prototype.stopAudio = function () {
    if (this.audio) {
      try { this.audio.pause(); } catch (e) {}
      this.audio = null;
    }
    this.currentBgm = null;
  };

  Player.prototype.playSfx = function (id) {
    var data = this.assetData(id);
    if (!data || this.settings.muted) return;
    try { new Audio(data).play(); } catch (e) {}
  };

  /* ---------------- 变量 HUD ---------------- */

  Player.prototype.renderHud = function () {
    var self = this;
    // 只有作者显式设成「顶部常驻」的变量才挂在顶上 —— 默认不挂
    var defs = (this.project.config.vars || []).filter(function (d) {
      return d.key && WY.varDisplay(d) === 'top';
    });
    if (!defs.length) { this.hud.innerHTML = ''; return; }

    var same = this.hud.childElementCount === defs.length &&
      defs.every(function (d, i) {
        var c = self.hud.children[i];
        return c && c.dataset.key === d.key;
      });
    if (!same) {
      this.hud.innerHTML = '';
      defs.forEach(function (d) {
        var c = el('span', 'wy-chip');
        c.dataset.key = d.key;
        c.appendChild(el('span', null, d.key));
        c.appendChild(el('b', null, String(self.vars[d.key])));
        self.hud.appendChild(c);
      });
      return;
    }
    defs.forEach(function (d, i) {
      var c = self.hud.children[i];
      var b = c && c.querySelector('b');
      if (b) b.textContent = String(self.vars[d.key]);
    });
  };

  Player.prototype.flashChanged = function (before) {
    var self = this;
    var defs = (this.project.config.vars || []).filter(function (d) {
      return d.key && WY.varDisplay(d) === 'top';
    });
    defs.forEach(function (d) {
      if (before[d.key] === self.vars[d.key]) return;
      var idx = defs.indexOf(d);
      var c = self.hud.children[idx];
      if (!c) return;
      c.classList.remove('wy-flash');
      void c.offsetWidth;
      c.classList.add('wy-flash');
    });
  };

  /* ---------------- 存档 / 读档 ---------------- */

  Player.prototype.slotInfo = function (slot) {
    if (!Store) return null;
    var all = Store.listSaves(this.gameId);
    return all[slot] || null;
  };

  Player.prototype.saveTo = function (slot, onDone) {
    if (!Store) return;
    var self = this;
    var node = this.node;
    var data = WY.assign(this.snapshot(), {
      at: WY.nowISO(),
      where: node ? (node.title || WY.firstLine(node.text) || '第 ' + (WY.nodeIndex(this.project, node.id) + 1) + ' 幕') : '',
      projectTitle: (this.project.meta && this.project.meta.title) || '',
      thumb: null
    });
    var finish = function (thumb) {
      if (thumb) data.thumb = thumb;
      var ok = Store.putSave(self.gameId, slot, data);
      if (slot !== 'auto') self.toast(ok ? '已存档' : '存档失败（存储空间可能已满）');
      if (onDone) onDone();
    };
    this.captureThumb().then(finish).catch(function () { finish(null); });
  };

  /** 每进入一个新场景就悄悄写一次自动存档 */
  Player.prototype.autoSave = function () {
    var self = this;
    if (!this.storeOn || !Store) return;
    if (this._autoTimer) clearTimeout(this._autoTimer);
    this._autoTimer = setTimeout(function () {
      if (self.destroyed || !self.node) return;
      var node = self.node;
      var data = WY.assign(self.snapshot(), {
        at: WY.nowISO(),
        where: node.title || WY.firstLine(node.text) || '',
        projectTitle: (self.project.meta && self.project.meta.title) || ''
      });
      self.captureThumb().then(function (thumb) {
        if (thumb) data.thumb = thumb;
        Store.putSave(self.gameId, 'auto', data);
      }).catch(function () { Store.putSave(self.gameId, 'auto', data); });
    }, 350);
  };

  Player.prototype.loadFrom = function (slot) {
    if (!Store) return;
    var s = Store.listSaves(this.gameId)[slot];
    if (!s) { this.toast('这个档位是空的'); return; }
    this.history = [];
    this.restore(s);
    this.toast('已读档');
  };

  /* ---------------- 面板 ---------------- */

  Player.prototype.closeSheet = function () {
    this.sheetHost.innerHTML = '';
  };

  Player.prototype.makeSheet = function (title) {
    var self = this;
    this.closeSheet();
    var wrap = el('div', 'wy-sheet');
    var body = el('div', 'wy-sheet-body');
    var head = el('div', 'wy-sheet-title');
    head.appendChild(el('span', null, title));
    var x = btn('wy-ibtn', '✕');
    x.addEventListener('click', function (e) { e.stopPropagation(); self.closeSheet(); });
    head.appendChild(x);
    body.appendChild(head);
    wrap.appendChild(body);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) self.closeSheet(); });
    this.sheetHost.appendChild(wrap);
    return body;
  };

  Player.prototype.openMenu = function () {
    var self = this;
    this.closeScreen();
    var body = this.makeSheet('菜单');

    var mk = function (label, fn) {
      var b = btn('wy-btn', label);
      b.style.cssText = 'display:block;width:100%;margin-bottom:9px;text-align:left;padding:14px 16px;';
      b.addEventListener('click', function (e) { e.stopPropagation(); self.closeSheet(); fn(); });
      body.appendChild(b);
    };

    // 图鉴入口：作者定义了几个有内容的分组，菜单里就出现几个
    var groups = WY.codexMenu(this.project);
    groups.forEach(function (g) {
      mk(g.icon + '  ' + g.name, function () { self.openCodex(g.id); });
    });
    if (groups.length) body.appendChild(el('div', 'wy-menu-sep'));

    mk('💾  存档', function () { self.openSaveScreen('save'); });
    mk('📂  读档', function () { self.openSaveScreen('load'); });
    mk('↶  回退一步', function () { self.goBack(); });
    mk('🔧  设置', function () { self.openSettings(); });
    mk('↺  从头开始', function () {
      if (root.confirm('确定要重新开始吗？当前进度会被清掉（存档不受影响）。')) self.restart();
    });
    if (this.onExit) mk('←  返回编辑器', function () { self.exit(); });
  };

  /* ---------------- 整页界面（图鉴 / 存档） ---------------- */

  Player.prototype.closeScreen = function () {
    if (this.screenHost) this.screenHost.innerHTML = '';
  };

  /** 全屏页面：左上角返回（回菜单）、右上角关闭 */
  Player.prototype.makeScreen = function (title, subtitle) {
    var self = this;
    this.closeSheet();
    this.closeScreen();
    var scr = el('div', 'wy-screen');
    var head = el('div', 'wy-screen-head');

    var back = btn('wy-icon-btn', '‹');
    back.addEventListener('click', function (e) { e.stopPropagation(); self.closeScreen(); self.openMenu(); });
    head.appendChild(back);

    var t = el('div', 'wy-screen-title');
    t.appendChild(el('span', null, title));
    if (subtitle) t.appendChild(el('small', null, subtitle));
    head.appendChild(t);

    var x = btn('wy-icon-btn', '✕');
    x.addEventListener('click', function (e) { e.stopPropagation(); self.closeScreen(); });
    head.appendChild(x);

    scr.appendChild(head);
    var body = el('div', 'wy-screen-body');
    scr.appendChild(body);
    this.screenHost.appendChild(scr);
    return body;
  };

  /* ---------------- 图鉴：人物 / 背包 / 状态 ---------------- */

  Player.prototype.openCodex = function (groupId) {
    var self = this;
    var group = null;
    WY.codexGroups(this.project).forEach(function (g) { if (g.id === groupId) group = g; });
    if (!group) return;

    var body = this.makeScreen(group.icon + '  ' + group.name,
      group.kind === 'status' ? '当前所有数值' : null);

    // 状态型：直接列数值表
    if (group.kind === 'status') {
      var vars = WY.statusVars(this.project);
      if (!vars.length) { body.appendChild(el('div', 'wy-empty', '还没有可显示的数值。')); return; }
      var list = el('div', 'wy-status-list');
      vars.forEach(function (d) {
        var row = el('div', 'wy-status-row');
        row.appendChild(el('span', 'k', d.key));
        row.appendChild(el('b', 'v', String(self.vars[d.key])));
        list.appendChild(row);
      });
      body.appendChild(list);
      return;
    }

    // 列表型：条目卡片
    var entries = WY.codexEntriesOf(this.project, group.id);
    if (!entries.length) { body.appendChild(el('div', 'wy-empty', '这一页还是空的。')); return; }

    var wrap = el('div', 'wy-codex-list');
    entries.forEach(function (e) {
      var unlocked = WY.codexEntryVisible(self.vars, e);
      var card = el('div', 'wy-codex-card' + (unlocked ? '' : ' wy-locked'));

      var pic = el('div', 'wy-codex-pic');
      var asset = unlocked || !e.blurLocked ? (e.image ? self.project.assets[e.image] : null) : null;
      if (asset && asset.data) {
        var img = document.createElement('img');
        img.src = asset.data;
        img.alt = e.name || '';
        pic.appendChild(img);
      } else {
        pic.appendChild(el('div', 'wy-codex-blank', unlocked ? '没有配图' : '？'));
      }
      card.appendChild(pic);

      var info = el('div', 'wy-codex-info');
      info.appendChild(el('div', 'wy-codex-name', unlocked ? (e.name || '未命名') : '？？？'));

      if (unlocked) {
        var shown = (e.vars || []).filter(function (k) { return !!WY.varDef(self.project, k); });
        if (shown.length) {
          var vbox = el('div', 'wy-codex-vars');
          shown.forEach(function (k) {
            var c = el('span', 'wy-cv');
            c.appendChild(el('span', null, k));
            c.appendChild(el('b', null, String(self.vars[k])));
            vbox.appendChild(c);
          });
          info.appendChild(vbox);
        }
        if (e.desc) info.appendChild(el('div', 'wy-codex-desc', e.desc));
      } else {
        info.appendChild(el('div', 'wy-codex-desc', '还没有遇到。'));
      }

      card.appendChild(info);
      wrap.appendChild(card);
    });
    body.appendChild(wrap);
  };

  /* ---------------- 存档界面 ---------------- */

  Player.prototype.loadImage = function (data) {
    var self = this;
    if (!data) return Promise.reject(new Error('no data'));
    if (!this._imgCache) this._imgCache = {};
    if (this._imgCache[data]) return Promise.resolve(this._imgCache[data]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { self._imgCache[data] = img; resolve(img); };
      img.onerror = function () { reject(new Error('图片解码失败')); };
      img.src = data;
    });
  };

  /** 把当前画面（背景 + 立绘）画成一张小缩略图存进存档 */
  Player.prototype.captureThumb = function () {
    var self = this;
    return new Promise(function (resolve) {
      var W = 168, H = 298, ctx = null, cv = null;
      try {
        cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        ctx = cv.getContext('2d');
      } catch (e) { ctx = null; }
      if (!ctx) { resolve(null); return; }

      var node = self.node;
      var theme = (self.project.config && self.project.config.theme) || {};
      ctx.fillStyle = theme.bg || '#0f1115';
      ctx.fillRect(0, 0, W, H);

      var bgData = self.assetData(node && node.bg);
      var stageList = (node && node.stage) ? WY.stageAt(node, 999999) : [];

      var bgJob = bgData ? self.loadImage(bgData).catch(function () { return null; }) : Promise.resolve(null);
      var spriteJobs = stageList.map(function (item) {
        var d = self.assetData(item.actor.sprite);
        if (!d) return Promise.resolve(null);
        return self.loadImage(d).then(function (img) { return { img: img, props: item.props }; })
          .catch(function () { return null; });
      });

      Promise.all([bgJob].concat(spriteJobs)).then(function (res) {
        try {
          var bgImg = res[0];
          if (bgImg && bgImg.width) {
            var sc = Math.max(W / bgImg.width, H / bgImg.height);
            var dw = bgImg.width * sc, dh = bgImg.height * sc;
            ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
          }
          // 按图层顺序依次画，顺序不能乱
          for (var i2 = 1; i2 < res.length; i2++) {
            var it = res[i2];
            if (!it || !it.img || !it.img.height) continue;
            var p = it.props;
            var h = H * 0.9 * p.scale;
            var w = it.img.width * (h / it.img.height);
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
            ctx.translate(p.x * W, H - (1 - p.y) * H);
            if (p.flip) ctx.scale(-1, 1);
            ctx.drawImage(it.img, -w / 2, -h, w, h);
            ctx.restore();
          }
          resolve(cv.toDataURL('image/jpeg', 0.68));
        } catch (err) { resolve(null); }
      }).catch(function () { resolve(null); });
    });
  };

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(5, 16).replace('T', ' ');
    var p2 = function (x) { return x < 10 ? '0' + x : String(x); };
    return (d.getMonth() + 1) + '/' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  Player.prototype.openSaveScreen = function (mode) {
    var self = this;
    var ui = WY.ensureUI(this.project);
    var isSave = mode === 'save';
    var body = this.makeScreen(isSave ? '存档' : '读档',
      isSave ? '选一个位置存下当前进度' : '选一个存档继续');

    if (!Store) { body.appendChild(el('div', 'wy-empty', '这个环境不支持存档。')); return; }

    var saves = Store.listSaves(this.gameId);
    var slots = [];
    var count = Math.max(1, Math.min(9, (ui.saves && ui.saves.slots) || 3));
    for (var i = 1; i <= count; i++) slots.push(String(i));
    slots.push('auto');

    var wrap = el('div', 'wy-save-list');
    slots.forEach(function (slot) {
      var sv = saves[slot];
      var isAuto = slot === 'auto';
      var card = el('div', 'wy-save-slot' + (sv ? '' : ' wy-slot-empty') + (isAuto ? ' wy-slot-auto' : ''));

      var thumb = el('div', 'wy-save-thumb');
      if (sv && sv.thumb) {
        var im = document.createElement('img');
        im.src = sv.thumb;
        im.alt = '';
        thumb.appendChild(im);
      } else {
        thumb.appendChild(el('div', 'wy-save-noimg', isAuto ? 'AUTO' : slot));
      }
      card.appendChild(thumb);

      var info = el('div', 'wy-save-info');
      info.appendChild(el('div', 'wy-save-name', isAuto ? '自动存档' : ('存档位 ' + slot)));
      info.appendChild(el('div', 'wy-save-where', sv ? (sv.where || '（没有记下场景名）') : '空'));
      info.appendChild(el('div', 'wy-save-time', sv ? fmtTime(sv.at) : ''));
      if (sv && sv.vars) {
        var keys = Object.keys(sv.vars).slice(0, 4);
        if (keys.length) {
          var vs = el('div', 'wy-save-vars');
          keys.forEach(function (k) {
            var c = el('span', 'wy-cv');
            c.appendChild(el('span', null, k));
            c.appendChild(el('b', null, String(sv.vars[k])));
            vs.appendChild(c);
          });
          info.appendChild(vs);
        }
      }
      card.appendChild(info);

      var acts = el('div', 'wy-save-acts');
      if (isSave) {
        if (!isAuto) {
          var sb = btn('wy-btn' + (sv ? '' : ' wy-primary'), sv ? '覆盖' : '存入');
          sb.addEventListener('click', function (e) {
            e.stopPropagation();
            self.saveTo(slot, function () { self.openSaveScreen('save'); });
          });
          acts.appendChild(sb);
        }
      } else if (sv) {
        var lb = btn('wy-btn wy-primary', '读取');
        lb.addEventListener('click', function (e) {
          e.stopPropagation();
          self.closeScreen();
          self.loadFrom(slot);
        });
        acts.appendChild(lb);
        var db = btn('wy-btn', '删');
        db.addEventListener('click', function (e) {
          e.stopPropagation();
          Store.dropSave(self.gameId, slot);
          self.openSaveScreen('load');
        });
        acts.appendChild(db);
      }
      card.appendChild(acts);
      wrap.appendChild(card);
    });
    body.appendChild(wrap);
  };

  Player.prototype.openSettings = function () {
    var self = this;
    var body = this.makeSheet('设置');

    // 字号
    var f1 = el('div', 'wy-field');
    var l1 = el('div', 'wy-field-label');
    l1.appendChild(el('span', null, '字号'));
    var v1 = el('span', null, this.settings.fontSize + 'px');
    l1.appendChild(v1);
    f1.appendChild(l1);
    var r1 = el('input', 'wy-range');
    r1.type = 'range';
    r1.min = '14'; r1.max = '30'; r1.step = '1';
    r1.value = String(this.settings.fontSize);
    r1.addEventListener('input', function () {
      self.settings.fontSize = Number(r1.value);
      v1.textContent = r1.value + 'px';
      self.root.style.setProperty('--wy-fs', r1.value + 'px');
    });
    r1.addEventListener('change', function () {
      if (Store) Store.setPrefs({ playerFontSize: self.settings.fontSize });
    });
    f1.appendChild(r1);
    body.appendChild(f1);

    // 速度
    var f2 = el('div', 'wy-field');
    f2.appendChild(el('div', 'wy-field-label', '文字速度'));
    var seg = el('div', 'wy-seg');
    Object.keys(SPEED_LABELS).forEach(function (k) {
      var b = btn('wy-btn' + (self.settings.speed === k ? ' on' : ''), SPEED_LABELS[k]);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        self.settings.speed = k;
        if (Store) Store.setPrefs({ playerSpeed: k });
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
      });
      seg.appendChild(b);
    });
    f2.appendChild(seg);
    body.appendChild(f2);

    // 音乐
    var f3 = el('div', 'wy-field');
    f3.appendChild(el('div', 'wy-field-label', '背景音乐'));
    var seg2 = el('div', 'wy-seg');
    [['on', '开'], ['off', '关']].forEach(function (pair) {
      var on = (pair[0] === 'on') !== self.settings.muted;
      var b = btn('wy-btn' + (on ? ' on' : ''), pair[1]);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        self.settings.muted = pair[0] === 'off';
        if (Store) Store.setPrefs({ playerMuted: self.settings.muted });
        Array.prototype.forEach.call(seg2.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
        if (self.settings.muted) self.stopAudio();
        else self.playBgm(self.currentBgmId);
      });
      seg2.appendChild(b);
    });
    f3.appendChild(seg2);
    body.appendChild(f3);

    // 变量一览
    if ((this.project.config.vars || []).length) {
      var f4 = el('div', 'wy-field');
      f4.appendChild(el('div', 'wy-field-label', '当前变量'));
      var box = el('div');
      box.style.cssText = 'font-size:13px;opacity:.8;line-height:2;';
      this.project.config.vars.forEach(function (d) {
        if (!d.key) return;
        var row = el('div');
        row.textContent = d.key + '：' + String(self.vars[d.key]);
        box.appendChild(row);
      });
      f4.appendChild(box);
      body.appendChild(f4);
    }
  };

  /* ---------------- 入口 ---------------- */

  var WYPlayer = {
    create: function (host, project, opts) { return new Player(host, project, opts); },
    Player: Player
  };

  root.WYPlayer = WYPlayer;
  if (typeof module !== 'undefined' && module.exports) module.exports = WYPlayer;

  /* 导出的独立游戏会自动调用这里 */
  if (typeof document !== 'undefined') {
    root.addEventListener('DOMContentLoaded', function () {
      if (!root.__WY_GAME__) return;
      var host = document.getElementById('game') || document.body;
      try {
        var proj = WY.normalize(root.__WY_GAME__);
        root.__WY_PLAYER__ = WYPlayer.create(host, proj, { gameId: proj.id, embed: true });
      } catch (e) {
        host.innerHTML = '<div class="wy-empty">游戏数据损坏：' + WY.escapeHtml(e.message) + '</div>';
      }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
