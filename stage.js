/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 舞台
 *   WYStage       —— 立绘渲染 + 关键帧播放（编辑器与播放器共用）
 *   WYStageEditor —— 可视化舞台编辑器（对着图拖立绘、打关键帧）
 * ============================================================ */
(function (root) {
  'use strict';

  var WY = root.WY;

  /* ---------------- 小工具 ---------------- */

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
    if (!Array.isArray(pairs)) throw new TypeError('sel(): 第一个参数必须是选项数组');
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
  function field(label, control, hint) {
    var f = el('div', 'wy-field');
    if (label) f.appendChild(el('label', 'wy-label', label));
    if (control) f.appendChild(control);
    if (hint) f.appendChild(el('div', 'wy-hint', hint));
    return f;
  }
  function section(title) { return el('div', 'wy-section-title', title); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ============================================================
   * WYStage —— 舞台渲染与播放
   * ============================================================ */

  function spriteData(project, actor) {
    var a = actor && actor.sprite && project.assets ? project.assets[actor.sprite] : null;
    return a && a.data ? a.data : null;
  }

  /** 这个角色此刻该用哪张图（可能因为表情差分换掉） */
  function actorSrc(view, actor) {
    var faceName = view.faces ? view.faces[actor.id] : null;
    var imgId = WY.actorFaceImage(actor, faceName);
    var a = imgId && view.project.assets ? view.project.assets[imgId] : null;
    return a && a.data ? a.data : null;
  }

  /** 换脸：把每个立绘的 src 换成当前表情对应的图 */
  function applyFaces(view, faces) {
    view.faces = faces || {};
    view.actors.forEach(function (actor) {
      var img = view.sprites[actor.id];
      if (!img) return;
      var src = actorSrc(view, actor);
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  /** 在 host 里搭出背景 + 立绘层，返回一个 view 对象 */
  function mount(host, project, node, opts) {
    opts = opts || {};
    host.innerHTML = '';
    host.classList.add('wy-stagebox');
    host.classList.toggle('wy-editable', !!opts.editable);

    var bg = null;
    if (opts.withBg !== false) {
      bg = el('div', 'wy-bg');
      host.appendChild(bg);
      host.appendChild(el('div', 'wy-scrim'));
    }

    var stageEl = el('div', 'wy-stage');
    host.appendChild(stageEl);

    // 情绪气泡层（在立绘之上）
    var bubbleLayer = el('div', 'wy-bubbles');
    host.appendChild(bubbleLayer);

    var hint = el('div', 'wy-stageempty');
    host.appendChild(hint);

    var view = {
      host: host, bg: bg, stageEl: stageEl, bubbleLayer: bubbleLayer, hint: hint,
      project: project, node: node, faces: opts.faces || {},
      sprites: {}, actors: [], bubbles: [], editable: !!opts.editable, raf: 0, t: 0
    };

    // 气泡：可以是静态图，也可以是 GIF 动图
    (node.bubbles || []).forEach(function (b) {
      var a = b.img ? project.assets[b.img] : null;
      var wrap = el('div', 'wy-bubble');
      wrap.dataset.bubbleId = b.id;
      wrap.style.left = (b.x * 100) + '%';
      wrap.style.top = (b.y * 100) + '%';
      wrap.style.width = (17 * (b.scale || 1)) + '%';
      if (b.flip) wrap.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      var im = document.createElement('img');
      im.className = 'wy-anim-' + (b.anim || 'none');
      im.draggable = false;
      im.alt = '';
      if (a && a.data) im.setAttribute('src', a.data);
      wrap.appendChild(im);
      bubbleLayer.appendChild(wrap);
      view.bubbles.push({ data: b, el: wrap, img: im });
    });

    var st = WY.ensureStage(node);
    st.actors.forEach(function (actor) {
      var img = document.createElement('img');
      img.className = 'wy-sprite';
      img.draggable = false;
      img.alt = actor.name || '';
      img.dataset.actorId = actor.id;
      stageEl.appendChild(img);
      view.sprites[actor.id] = img;
      view.actors.push(actor);
      var data = actorSrc(view, actor);
      if (data) img.setAttribute('src', data);
    });

    if (bg) setBackground(view, node.bg);
    applyTime(view, 0);
    return view;
  }

  function setBackground(view, assetId) {
    if (!view.bg) return;
    var a = assetId && view.project.assets ? view.project.assets[assetId] : null;
    if (a && a.data) {
      view.bg.style.backgroundImage = 'url("' + a.data + '")';
      view.bg.classList.add('wy-on');
    } else {
      view.bg.style.backgroundImage = '';
      view.bg.classList.remove('wy-on');
    }
  }

  /** 把舞台推进到 t 毫秒 */
  function applyTime(view, t, ease) {
    view.t = t;
    var list = WY.stageAt(view.node, t, ease);
    var seen = {};
    list.forEach(function (item, i) {
      var img = view.sprites[item.actor.id];
      if (!img) return;
      seen[item.actor.id] = true;
      var p = item.props;
      img.style.display = '';
      img.style.zIndex = String(i + 1);
      img.style.left = (p.x * 100) + '%';
      img.style.bottom = ((1 - p.y) * 100) + '%';
      img.style.opacity = String(p.opacity);
      img.style.transform = 'translateX(-50%) scale(' + (p.scale * (p.flip ? -1 : 1)) + ',' + p.scale + ')';
    });
    Object.keys(view.sprites).forEach(function (id) {
      if (!seen[id]) view.sprites[id].style.display = 'none';
    });
    // 气泡按时间出现 / 消失
    var shown = {};
    WY.bubblesAt(view.node, t).forEach(function (b) { shown[b.id] = true; });
    view.bubbles.forEach(function (item) {
      item.el.style.display = shown[item.data.id] ? '' : 'none';
    });

    var n = list.length;
    view.hint.textContent = n ? '' : (view.actors.length ? '' : '还没有角色。点下面的「＋ 添加角色」。');
    view.hint.style.display = view.actors.length ? 'none' : '';
    return list;
  }

  /** 说话的人亮，其他人暗 */
  function setSpeaker(view, speakerName) {
    var speaker = String(speakerName == null ? '' : speakerName).trim();
    var matched = false;
    if (speaker) {
      view.actors.forEach(function (a) { if (a.name === speaker) matched = true; });
    }
    view.actors.forEach(function (a) {
      var img = view.sprites[a.id];
      if (!img) return;
      var dim = matched && a.dim !== false && a.name !== speaker;
      img.classList.toggle('wy-dim', !!dim);
    });
  }

  function stop(view) {
    if (view && view.raf) { cancelAnimationFrame(view.raf); view.raf = 0; }
  }

  /** 从 0 播到最后一个关键帧 */
  function play(view, opts) {
    opts = opts || {};
    stop(view);
    var dur = WY.stageDuration(view.node);
    if (!dur) { applyTime(view, 0); if (opts.onEnd) opts.onEnd(); return; }
    var t0 = (root.performance || Date).now();
    var tick = function (now) {
      if (!view.host || !view.host.isConnected) return;
      var t = (now || (root.performance || Date).now()) - t0;
      applyTime(view, Math.min(t, dur), opts.ease);
      if (opts.onFrame) opts.onFrame(Math.min(t, dur));
      if (t < dur) view.raf = requestAnimationFrame(tick);
      else { view.raf = 0; if (opts.onEnd) opts.onEnd(); }
    };
    view.raf = requestAnimationFrame(tick);
  }

  /** 某个角色在 t 时刻的状态（没有关键帧则返回默认落位） */
  function propsAt(node, actorId, t) {
    var track = WY.getTrack(node, actorId);
    var p = WY.trackPropsAt(track, t);
    return p || WY.assign({}, WY.STAGE_DEFAULTS);
  }

  /** 在 t 时刻写入（或更新）某个角色的关键帧 */
  function writeKey(node, actorId, t, patch) {
    var track = WY.getTrack(node, actorId, true);
    var found = null;
    for (var i = 0; i < track.keys.length; i++) {
      if (Math.abs(track.keys[i].at - t) <= 60) { found = track.keys[i]; break; }
    }
    if (!found) {
      var base = WY.trackPropsAt(track, t) || WY.assign({}, WY.STAGE_DEFAULTS);
      found = WY.newKey(WY.assign({ at: t }, base));
      track.keys.push(found);
    }
    WY.assign(found, patch || {});
    found.at = t;
    WY.sortTrack(track);
    return found;
  }

  function keyAt(node, actorId, t) {
    var track = WY.getTrack(node, actorId);
    if (!track) return null;
    for (var i = 0; i < track.keys.length; i++) {
      if (Math.abs(track.keys[i].at - t) <= 60) return track.keys[i];
    }
    return null;
  }

  function removeActor(node, actorId) {
    var st = WY.ensureStage(node);
    st.actors = st.actors.filter(function (a) { return a.id !== actorId; });
    st.tracks = st.tracks.filter(function (t) { return t.actorId !== actorId; });
  }

  /* ============================================================
   * WYStageEditor —— 可视化舞台编辑器
   * ============================================================ */

  /** 把真实选项外观（素材图 / 九宫格 / 没素材时的样式）套到一个元素上 */
  function applyChoiceLook(node, project, choice, ui) {
    var imgId = (choice && choice.img) || (ui.choice && ui.choice.bg) || null;
    var asset = imgId && project.assets ? project.assets[imgId] : null;
    if (!asset || !asset.data) {
      node.classList.add('wy-ghost-plain');
      return;
    }
    var url = 'url("' + asset.data + '")';
    node.classList.add('wy-ghost-hasimg');
    if (ui.skinFit === 'stretch' || ui.choice.bgFit === 'stretch') {
      node.style.backgroundImage = url;
      node.style.backgroundSize = '100% 100%';
      node.style.border = 'none';
      return;
    }
    node.style.backgroundImage = 'none';
    node.style.backgroundColor = 'transparent';
    node.style.borderStyle = 'solid';
    node.style.borderWidth = '12px 17px';
    node.style.borderColor = 'transparent';
    node.style.borderImage = url + ' 26% fill / 1 / 0 stretch';
    if (choice && choice.hideText) node.style.minHeight = '52px';
  }

  /** 通用的「拖动一个块、实时写回坐标」逻辑 */
  function bindGhostDrag(canvas, ghost, getPos, setPos, onDone) {
    var onMove = null, onUp = null;
    ghost.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { ghost.setPointerCapture(e.pointerId); } catch (err) {}
      ghost.classList.add('wy-grabbing');
      ghost.style.opacity = '1';

      var rect = canvas.getBoundingClientRect();
      var rw = rect.width > 0 ? rect.width : 1;
      var rh = rect.height > 0 ? rect.height : 1;
      var sx = e.clientX, sy = e.clientY;
      var p0 = getPos();
      var moved = false;

      onMove = function (ev) {
        moved = true;
        var nx = clamp(p0.x + (ev.clientX - sx) / rw, 0, 1);
        var ny = clamp(p0.y + (ev.clientY - sy) / rh, 0, 1);
        setPos(nx, ny);
        ghost.style.left = (nx * 100) + '%';
        ghost.style.top = (ny * 100) + '%';
      };
      onUp = function () {
        ghost.classList.remove('wy-grabbing');
        ghost.removeEventListener('pointermove', onMove);
        ghost.removeEventListener('pointerup', onUp);
        ghost.removeEventListener('pointercancel', onUp);
        if (moved && onDone) onDone();
      };
      ghost.addEventListener('pointermove', onMove);
      ghost.addEventListener('pointerup', onUp);
      ghost.addEventListener('pointercancel', onUp);
    });
  }

  var StageEditor = {
    project: null,
    node: null,
    view: null,
    time: 0,
    selected: null,
    onDone: null,
    sheet: null
  };

  StageEditor.open = function (project, nodeId, onDone) {
    var self = this;
    this.project = project;
    this.node = WY.getNode(project, nodeId);
    if (!this.node) return;
    this.onDone = onDone || null;
    this.time = 0;
    WY.ensureStage(this.node);
    this.selected = this.node.stage.actors.length ? this.node.stage.actors[0].id : null;

    var sheet = el('div', 'wy-sheet-full');
    this.sheet = sheet;

    var head = el('div', 'wy-sheet-head');
    var back = btn('wy-icon-btn', '‹');
    back.addEventListener('click', function () { self.close(); });
    head.appendChild(back);
    head.appendChild(el('div', 't', '舞台演出'));
    var helper = btn('wy-icon-btn', '?');
    helper.addEventListener('click', function () { self.showHelp(); });
    head.appendChild(helper);
    sheet.appendChild(head);

    var body = el('div', 'wy-sheet-body wy-stagebody');
    sheet.appendChild(body);

    this.body = body;
    document.body.appendChild(sheet);
    this.render();
  };

  StageEditor.close = function () {
    if (this.view) stop(this.view);
    if (this.sheet) this.sheet.remove();
    if (this.onDone) this.onDone();
    this.sheet = null;
  };

  StageEditor.showHelp = function () {
    var self = this;
    var d = el('div', 'wy-help');
    d.appendChild(el('h3', null, '怎么用舞台'));
    [
      '① 先在「＋ 添加角色」里选一张图片当立绘（最好是透明背景的 PNG）。',
      '② 用「预设」一键做出场效果：从左边滑入、淡入、弹出……不用手动打帧。',
      '③ 想自己调：拖动上面的立绘摆位置，时间轴滑块选时刻，改完会自动在这一刻打一个关键帧。',
      '④ 两个关键帧之间，播放器会自动补间（位置、缩放、透明度）。',
      '⑤ 「说话人」填谁的名字，玩的时候谁就亮、其他人变暗。名字要和角色名一致。'
    ].forEach(function (t) { d.appendChild(el('p', null, t)); });
    var okb = btn('wy-btn-ghost primary', '知道了');
    okb.addEventListener('click', function () { d.remove(); });
    d.appendChild(okb);
    this.sheet.appendChild(d);
  };

  StageEditor.render = function () {
    var self = this;
    var p = this.project;
    var node = this.node;
    var st = WY.ensureStage(node);
    var body = this.body;
    body.innerHTML = '';

    /* ---- 画布（比例跟随工程的屏幕方向）---- */
    var ui = WY.ensureUI(p);
    var canvas = el('div', 'wy-stagecanvas' + (ui.orientation === 'landscape' ? ' wy-canvas-land' : ''));
    body.appendChild(canvas);
    if (this.view) stop(this.view);
    this.view = mount(canvas, p, node, { editable: true, faces: this.previewFaces() });
    WYStage.applyTime(this.view, this.time);
    WYStage.setSpeaker(this.view, node.speaker);
    this.bindDrag(canvas);
    this.bindBubbleDrag(canvas);
    if (this.showGhost !== false) this.bindChoiceGhosts(canvas);

    /* ---- 时间轴 ---- */
    var dur = Math.max(WY.stageDuration(node), 1);
    var tl = el('div', 'wy-timeline');
    var ghostBtn = btn('wy-tbtn', '▦');
    ghostBtn.title = '显示 / 隐藏选项位置块';
    ghostBtn.style.background = this.showGhost === false
      ? 'rgba(255,255,255,.14)' : 'var(--accent)';
    ghostBtn.style.color = this.showGhost === false ? 'var(--fg)' : '#08111c';
    ghostBtn.addEventListener('click', function () {
      self.showGhost = self.showGhost === false;
      self.render();
    });
    tl.appendChild(ghostBtn);

    var playBtn = btn('wy-tbtn', '▶');
    playBtn.addEventListener('click', function () {
      play(self.view, {
        onFrame: function (t) { self.time = t; timeOut.textContent = fmt(t); scrub.value = String(t); },
        onEnd: function () { self.render(); }
      });
    });
    tl.appendChild(playBtn);

    var scrub = el('input');
    scrub.type = 'range';
    scrub.className = 'wy-scrub';
    scrub.min = '0';
    scrub.max = String(dur);
    scrub.step = '10';
    scrub.value = String(this.time);
    scrub.addEventListener('input', function () {
      stop(self.view);
      self.time = Number(scrub.value);
      timeOut.textContent = fmt(self.time);
      WYStage.applyTime(self.view, self.time);
      refreshKeys();
    });
    tl.appendChild(scrub);

    var timeOut = el('span', 'wy-timeout', fmt(this.time));
    tl.appendChild(timeOut);
    body.appendChild(tl);

    /* ---- 这一场的选项位置 ---- */
    var globalLayout = WY.ensureUI(p).choice.layout;
    var globalLabel = (WY.CHOICE_LAYOUTS.filter(function (o) { return o.id === globalLayout; })[0] || {}).label || globalLayout;
    body.appendChild(section('选项出现在哪'));
    body.appendChild(sel(
      [['', '跟随全局（' + globalLabel + '）']].concat(
        WY.CHOICE_LAYOUTS.map(function (o) { return [o.id, o.label]; })),
      node.choiceLayout || '',
      function (v) {
        node.choiceLayout = v || null;
        self.toast(v ? ('这一场的选项改成「' + (WY.CHOICE_LAYOUTS.filter(function (o) { return o.id === v; })[0] || {}).label + '」') : '改回跟随全局');
        self.render();
      }
    ));
    body.appendChild(el('div', 'wy-hint',
      '画面上那个虚线块就是选项的位置。选「自由摆放」之后，每个选项各有一块，可以分开拖。'));

    /* ---- 角色列表 ---- */
    body.appendChild(section('角色'));
    var chips = el('div', 'wy-actorbar');
    st.actors.forEach(function (a) {
      var c = btn('wy-actorchip' + (a.id === self.selected ? ' on' : ''));
      c.appendChild(el('span', 'nm', a.name || '未命名'));
      var kc = (WY.getTrack(node, a.id) || { keys: [] }).keys.length;
      c.appendChild(el('span', 'kc', kc + ' 帧'));
      c.addEventListener('click', function () { self.selected = a.id; self.editFace = null; self.render(); });
      chips.appendChild(c);
    });
    var addA = btn('wy-actorchip wy-add', '＋ 添加角色');
    addA.addEventListener('click', function () { self.addActor(); });
    chips.appendChild(addA);
    body.appendChild(chips);

    /* ---- 情绪气泡 ---- */
    // 注意：这一段在角色详情之前，不能引用那边才定义的 spritePairs
    var allBubbles = node.bubbles || (node.bubbles = []);
    var bubblePairs = WY.assetList(p)
      .filter(function (a) { return a.type === 'image'; })
      .map(function (a) { return [a.id, a.name]; });
    body.appendChild(section('情绪气泡'));
    var bbar = el('div', 'wy-actorbar');
    allBubbles.forEach(function (b, bi) {
      var c = btn('wy-actorchip' + (self.editBubble === bi ? ' on' : ''));
      c.appendChild(el('span', 'nm',
        (b.img && p.assets[b.img]) ? p.assets[b.img].name : ('气泡 ' + (bi + 1))));
      c.addEventListener('click', function () { self.editBubble = bi; self.render(); });
      bbar.appendChild(c);
    });
    var addB = btn('wy-actorchip wy-add', '＋ 加气泡');
    addB.addEventListener('click', function () {
      var bubbleImgs = WY.assetList(p).filter(function (a) { return a.type === 'image'; });
      var nb = WY.newBubble({ img: bubbleImgs.length ? bubbleImgs[0].id : null });
      // 默认贴到当前选中角色的头顶
      var act0 = self.selected ? WY.getActor(node, self.selected) : null;
      if (act0) {
        var pr0 = propsAt(node, act0.id, self.time);
        nb.x = clamp(pr0.x, 0.08, 0.92);
        nb.y = clamp(pr0.y - 0.16 * (pr0.scale || 1), 0.06, 0.94);
      }
      allBubbles.push(nb);
      self.editBubble = allBubbles.length - 1;
      self.render();
    });
    bbar.appendChild(addB);
    body.appendChild(bbar);

    if (self.editBubble != null && allBubbles[self.editBubble]) {
      var bb = allBubbles[self.editBubble];
      var bbox = el('div', 'wy-sub');
      bbox.appendChild(field('用哪张图', sel(bubblePairs, bb.img || '', function (v) {
        bb.img = v || null;
        self.render();
      }), '静态 PNG 或 GIF 动图都行；GIF 会直接动起来。'));
      bbox.appendChild(field('动作', sel(WY.BUBBLE_ANIMS.map(function (o) { return [o.id, o.label]; }), bb.anim,
        function (v) { bb.anim = v; self.render(); }), '图本身是动图的话，动作选「不动」就好。'));
      bbox.appendChild(field('第几毫秒冒出来', inp(String(bb.at), function (v) {
        bb.at = Math.max(0, Number(v) || 0); self.save();
      })));
      bbox.appendChild(field('持续多久（毫秒，0 = 一直到本场结束）', inp(String(bb.dur), function (v) {
        bb.dur = Math.max(0, Number(v) || 0); self.save();
      })));
      bbox.appendChild(slider('大小', bb.scale || 1, 0.3, 3, 0.1, function (v) {
        bb.scale = v;
        var it = self.view.bubbles[self.editBubble];
        if (it) it.el.style.width = (17 * v) + '%';
      }));
      var flipB = btn('wy-btn-ghost', bb.flip ? '已左右翻转' : '左右翻转');
      flipB.addEventListener('click', function () { bb.flip = !bb.flip; self.render(); });
      bbox.appendChild(flipB);
      var delB = btn('wy-btn-ghost danger', '删掉这个气泡');
      delB.addEventListener('click', function () {
        allBubbles.splice(self.editBubble, 1);
        self.editBubble = null;
        self.render();
      });
      bbox.appendChild(delB);
      bbox.appendChild(el('div', 'wy-hint', '画布上那个气泡可以直接拖着摆位置 —— 拖到角色头顶就行。'));
      body.appendChild(bbox);
    } else {
      body.appendChild(el('div', 'wy-hint',
        '气泡用来表达情绪：一个「！」「？」或者爱心、汗滴，可以是 PNG，也可以是 GIF 动图。'));
    }

    /* ---- 选中角色的详情 ---- */
    var actor = this.selected ? WY.getActor(node, this.selected) : null;
    if (actor) {
      var images = WY.assetList(p).filter(function (a) { return a.type === 'image'; });
      var spritePairs = [['', '（选一张图）']].concat(images.map(function (a) { return [a.id, a.name]; }));

      var box = el('div', 'wy-sub');
      var hd = el('div', 'wy-sub-head');
      hd.appendChild(el('span', 'idx', '正在编辑'));
      hd.appendChild(el('span', 'wy-spacer'));
      var flipBtn = btn('wy-x', '⇄');
      flipBtn.title = '左右翻转';
      flipBtn.addEventListener('click', function () {
        var cur = propsAt(node, actor.id, self.time);
        writeKey(node, actor.id, self.time, { flip: !cur.flip });
        self.render();
      });
      hd.appendChild(flipBtn);
      var delBtn = btn('wy-x', '✕');
      delBtn.title = '删除角色';
      delBtn.addEventListener('click', function () {
        removeActor(node, actor.id);
        self.selected = st.actors.length ? st.actors[0].id : null;
        self.render();
      });
      hd.appendChild(delBtn);
      box.appendChild(hd);

      var row1 = el('div', 'wy-row');
      row1.appendChild(inp(actor.name, function (v) { actor.name = v; self.softUpdate(); }, '角色名（比如：阿萤）'));
      box.appendChild(el('label', 'wy-label', '角色名 —— 填成和「说话人」一样，他说话时就会亮起来'));
      box.appendChild(row1);

      box.appendChild(field('立绘（默认表情）', sel(spritePairs, actor.sprite || '', function (v) {
        actor.sprite = v || null;
        self.render();
      }), images.length ? '' : '还没有图片素材，先去「素材」页上传一张透明背景的 PNG。'));

      /* ---- 表情差分 ---- */
      var faces = actor.faces || (actor.faces = []);
      body.appendChild(section('表情差分'));
      var faceBar = el('div', 'wy-actorbar');

      var defChip = btn('wy-actorchip' + (self.editFace == null ? ' on' : ''), '默认');
      defChip.addEventListener('click', function () { self.editFace = null; self.render(); });
      faceBar.appendChild(defChip);

      faces.forEach(function (fc, fi) {
        var c = btn('wy-actorchip' + (self.editFace === fi ? ' on' : ''));
        c.appendChild(el('span', 'nm', fc.name || '未命名'));
        c.addEventListener('click', function () { self.editFace = fi; self.render(); });
        faceBar.appendChild(c);
      });

      var addFace = btn('wy-actorchip wy-add', '＋ 加表情');
      addFace.addEventListener('click', function () {
        faces.push(WY.newFace({ name: '表情' + (faces.length + 1), img: images[0] ? images[0].id : null }));
        self.editFace = faces.length - 1;
        self.render();
      });
      faceBar.appendChild(addFace);
      body.appendChild(faceBar);

      if (self.editFace == null) {
        body.appendChild(el('div', 'wy-hint',
          '「默认」就是上面那张立绘。加几个表情（微笑 / 生气 / 害羞…），就能在剧情里用「换表情」效果切脸了。'));
      } else {
        var curFace = faces[self.editFace];
        if (!curFace) { self.editFace = null; }
        else {
          var fbox = el('div', 'wy-sub');
          fbox.appendChild(field('表情名', inp(curFace.name, function (v) { curFace.name = v; self.softUpdate(); }, '微笑 / 生气 / 害羞')));
          fbox.appendChild(field('这张脸用哪张图', sel(spritePairs, curFace.img || '', function (v) {
            curFace.img = v || null;
            self.render();
          }), '画布上会立刻显示这张脸。'));
          var delFace = btn('wy-btn-ghost danger', '删掉这个表情');
          delFace.addEventListener('click', function () {
            faces.splice(self.editFace, 1);
            self.editFace = null;
            self.render();
          });
          fbox.appendChild(delFace);
          body.appendChild(fbox);
        }
      }

      // 位置把手
      var props = propsAt(node, actor.id, this.time);
      var pos = el('div', 'wy-posread');
      pos.textContent = '位置 x=' + props.x.toFixed(2) + '  y=' + props.y.toFixed(2) +
        '  缩放=' + props.scale.toFixed(2) + '  不透明=' + props.opacity.toFixed(2) +
        (props.flip ? '  （已翻转）' : '');
      box.appendChild(pos);

      var scaleWrap = slider('缩放', props.scale, 0.2, 2.5, 0.05, function (v) {
        writeKey(node, actor.id, self.time, { scale: v });
        WYStage.applyTime(self.view, self.time);
        self.updateReadout();
        refreshKeys();
      });
      box.appendChild(scaleWrap);

      var opWrap = slider('不透明度', props.opacity, 0, 1, 0.05, function (v) {
        writeKey(node, actor.id, self.time, { opacity: v });
        WYStage.applyTime(self.view, self.time);
        self.updateReadout();
        refreshKeys();
      });
      box.appendChild(opWrap);

      var zRow = el('div', 'wy-row');
      zRow.appendChild(el('span', 'wy-label', '前后层级'));
      var zVal = el('span', null, String(actor.z || 0));
      zVal.style.cssText = 'margin-left:auto;color:var(--dim);font-size:13px;';
      var zb = btn('wy-btn-ghost', '往后 ←');
      zb.style.fontSize = '13px';
      zb.addEventListener('click', function () { actor.z = (actor.z || 0) - 1; zVal.textContent = actor.z; self.softUpdate(); });
      var zf = btn('wy-btn-ghost', '→ 往前');
      zf.style.fontSize = '13px';
      zf.addEventListener('click', function () { actor.z = (actor.z || 0) + 1; zVal.textContent = actor.z; self.softUpdate(); });
      zRow.appendChild(zb); zRow.appendChild(zf); zRow.appendChild(zVal);
      box.appendChild(zRow);

      body.appendChild(box);

      /* ---- 关键帧 ---- */
      body.appendChild(section('关键帧'));
      var keybox = el('div', 'wy-keybar');
      keybox.id = 'wy-keybar';
      body.appendChild(keybox);

      var kRow = el('div', 'wy-row wrap');
      kRow.style.marginTop = '10px';
      var addK = btn('wy-btn-ghost', '＋ 在当前时刻打一帧');
      addK.addEventListener('click', function () {
        writeKey(node, actor.id, self.time, {});
        self.render();
      });
      kRow.appendChild(addK);
      var delK = btn('wy-btn-ghost danger', '删掉这一刻的帧');
      delK.addEventListener('click', function () {
        var tr = WY.getTrack(node, actor.id);
        if (tr) {
          tr.keys = tr.keys.filter(function (k) { return Math.abs(k.at - self.time) > 60; });
          if (!tr.keys.length) WY.ensureStage(node).tracks = node.stage.tracks.filter(function (t) { return t !== tr; });
        }
        self.render();
      });
      kRow.appendChild(delK);
      body.appendChild(kRow);

      var refreshKeys = function () {
        var kb = self.body.querySelector('#wy-keybar');
        if (!kb) return;
        kb.innerHTML = '';
        var tr = WY.getTrack(node, actor.id);
        var keys = (tr && tr.keys) || [];
        if (!keys.length) {
          kb.appendChild(el('span', 'wy-hint', '这个角色还没有关键帧，所以现在还看不到他。用下面的预设一键做出场效果。'));
          return;
        }
        keys.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (k) {
          var active = Math.abs(k.at - self.time) <= 60;
          var c = btn('wy-keychip' + (active ? ' on' : ''), fmt(k.at));
          c.addEventListener('click', function () {
            self.time = k.at;
            scrub.value = String(k.at);
            timeOut.textContent = fmt(k.at);
            WYStage.applyTime(self.view, self.time);
            self.render();
          });
          kb.appendChild(c);
        });
      };
      refreshKeys();

      /* ---- 预设 ---- */
      body.appendChild(section('一键预设'));
      var presets = el('div', 'wy-row wrap');
      WY.PRESETS.forEach(function (pr) {
        var b = btn('wy-btn-ghost' + (pr.mode === 'append' ? '' : ' primary'), pr.label);
        b.style.fontSize = '13px';
        b.style.padding = '7px 11px';
        b.addEventListener('click', function () {
          var base = propsAt(node, actor.id, self.time);
          var startAt = pr.mode === 'append' ? (WY.stageDuration(node) + 200) : 0;
          var keys = WY.buildPreset(pr.id, base, startAt);
          var tr = WY.getTrack(node, actor.id, true);
          if (pr.mode === 'append') tr.keys = tr.keys.concat(keys);
          else tr.keys = keys;
          WY.sortTrack(tr);
          self.render();
        });
        presets.appendChild(b);
      });
      body.appendChild(presets);

      /* ---- 说话人 ---- */
      body.appendChild(section('这一场的说话人'));
      var spk = inp(node.speaker || '', function (v) { node.speaker = v.trim() || null; WYStage.setSpeaker(self.view, node.speaker); }, '留空 = 旁白');
      body.appendChild(spk);
      var spkChips = el('div', 'wy-row wrap');
      if (st.actors.length) {
        st.actors.forEach(function (a) {
          if (!a.name) return;
          var c = btn('wy-btn-ghost', a.name);
          c.style.fontSize = '13px';
          c.style.padding = '6px 12px';
          c.addEventListener('click', function () {
            node.speaker = a.name;
            spk.value = a.name;
            WYStage.setSpeaker(self.view, a.name);
          });
          spkChips.appendChild(c);
        });
      }
      var noneChip = btn('wy-btn-ghost', '旁白（不填）');
      noneChip.style.fontSize = '13px';
      noneChip.style.padding = '6px 12px';
      noneChip.addEventListener('click', function () {
        node.speaker = null; spk.value = ''; WYStage.setSpeaker(self.view, null);
      });
      spkChips.appendChild(noneChip);
      body.appendChild(spkChips);
      body.appendChild(el('div', 'wy-hint', '填的角色名如果和上面某个角色一致，玩的时候他会亮起来，其他人变暗。'));

      var genBtn = btn('wy-btn-ghost', '把他剩下的台词也标成他在说');
      genBtn.style.fontSize = '13px';
      genBtn.addEventListener('click', function () { self.bulkSpeaker(actor); });
      body.appendChild(genBtn);

      /* ---- 背景 ---- */
      body.appendChild(section('这一场的背景'));
      var bgImages = WY.assetList(p).filter(function (a) { return a.type === 'image'; });
      var bgPairs = [['', '（不设置）']].concat(bgImages.map(function (a) { return [a.id, a.name]; }));
      body.appendChild(sel(bgPairs, node.bg || '', function (v) {
        node.bg = v || null;
        setBackground(self.view, node.bg);
      }));

    } else {
      body.appendChild(el('div', 'wy-empty-box', '还没有角色。\n\n点上面的「＋ 添加角色」，选一张图片当立绘。'));
    }

    /* ---- 完成 ---- */
    var done = btn('wy-btn-ghost primary', '完成');
    done.style.cssText = 'width:100%;justify-content:center;margin-top:22px;padding:14px;';
    done.addEventListener('click', function () { self.close(); });
    body.appendChild(done);

    this.updateReadout = function () {
      var a2 = self.selected ? WY.getActor(node, self.selected) : null;
      if (!a2) return;
      var pp = propsAt(node, a2.id, self.time);
      var rd = self.body.querySelector('.wy-posread');
      if (rd) {
        rd.textContent = '位置 x=' + pp.x.toFixed(2) + '  y=' + pp.y.toFixed(2) +
          '  缩放=' + pp.scale.toFixed(2) + '  不透明=' + pp.opacity.toFixed(2) +
          (pp.flip ? '  （已翻转）' : '');
      }
    };
    this.softUpdate = function () {
      WYStage.applyTime(self.view, self.time);
    };
  };

  StageEditor.bulkSpeaker = function (actor) {
    // 把相邻的、说话人相同的场景批量改掉 —— 这里做一个轻量版本：
    // 找到所有没有设置说话人的场景，提示用户手动处理
    var node = this.node;
    var name = actor.name;
    if (!name) return;
    var count = 0;
    this.project.nodes.forEach(function (n) {
      if (n === node) return;
      if (!n.speaker && (n.text || '').indexOf('「') >= 0) { n.speaker = name; count++; }
    });
    var self = this;
    var tip = el('div', 'wy-inline-note', count ? ('已把 ' + count + ' 个含引号的场景标成「' + name + '」在说话，可以逐场再改。') : '没找到可以自动标注的场景。');
    this.body.appendChild(tip);
    setTimeout(function () { tip.remove(); }, 3000);
  };

  /** 拖动立绘改位置（改完自动在当前时刻打帧） */
  StageEditor.bindDrag = function (canvas) {
    var self = this;
    var node = this.node;
    Object.keys(this.view.sprites).forEach(function (actorId) {
      var img = self.view.sprites[actorId];
      img.style.pointerEvents = 'auto';
      img.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.selected = actorId;
        try { img.setPointerCapture(e.pointerId); } catch (err) {}
        img.classList.add('wy-grabbing');

        var rect = canvas.getBoundingClientRect();
        // 元素被隐藏或尚未布局时尺寸是 0，这里兜一下底，免得位置算成 NaN
        var rw = rect.width > 0 ? rect.width : 1;
        var rh = rect.height > 0 ? rect.height : 1;
        var startX = e.clientX, startY = e.clientY;
        var start = propsAt(node, actorId, self.time);

        var onMove = function (ev) {
          var nx = clamp(start.x + (ev.clientX - startX) / rw, -0.4, 1.4);
          var ny = clamp(start.y - (ev.clientY - startY) / rh, -0.2, 1.5);
          writeKey(node, actorId, self.time, { x: nx, y: ny });
          WYStage.applyTime(self.view, self.time);
          self.updateReadout();
          if (typeof self.refreshKeysLazy === 'function') self.refreshKeysLazy();
        };
        var onUp = function () {
          img.classList.remove('wy-grabbing');
          img.removeEventListener('pointermove', onMove);
          img.removeEventListener('pointerup', onUp);
          img.removeEventListener('pointercancel', onUp);
          self.render();
        };
        img.addEventListener('pointermove', onMove);
        img.addEventListener('pointerup', onUp);
        img.addEventListener('pointercancel', onUp);
      });
    });
  };

  /** 预览用的表情映射：正在编辑哪个表情，画布上就显示哪个 */
  StageEditor.previewFaces = function () {
    var out = {};
    if (this.selected == null || this.editFace == null) return out;
    var actor = WY.getActor(this.node, this.selected);
    var fc = actor && actor.faces ? actor.faces[this.editFace] : null;
    if (fc && fc.name) out[this.selected] = fc.name;
    return out;
  };

  /** 把整块摆放转成逐选项摆放（每个选项拿到自己的坐标） */
  StageEditor.toFree = function () {
    var ui = WY.ensureUI(this.project);
    var list = this.node.choices || [];
    var mid = (list.length - 1) / 2;
    list.forEach(function (c, i) {
      if (typeof c.x !== 'number') c.x = ui.choice.x;
      if (typeof c.y !== 'number') c.y = clamp(ui.choice.y + (i - mid) * 0.12, 0.06, 0.94);
    });
    this.node.choiceLayout = 'free';   // 只改这一场，不动全局默认
  };

  /**
   * 选项位置块。
   * 还没切自由摆放时：显示一个整块预览，拖它就自动切过去。
   * 已经是自由摆放时：这一个场景的每个选项各有一个块，可以分别拖。
   */
  StageEditor.bindChoiceGhosts = function (canvas) {
    var self = this;
    var ui = WY.ensureUI(this.project);
    var node = this.node;
    var list = node.choices || [];
    var pct = ui.choice.width === 'narrow' ? 40 : (ui.choice.width === 'wide' ? 56 : 72);
    var layout = WY.effectiveChoiceLayout(this.project, node);

    // ---- 还没切自由摆放：整块预览 ----
    if (layout !== 'free') {
      var ghost = el('div', 'wy-choiceghost');
      ghost.style.left = (ui.choice.x * 100) + '%';
      ghost.style.top = (ui.choice.y * 100) + '%';
      ghost.style.width = pct + '%';
      ghost.style.opacity = '.6';
      ghost.appendChild(el('div', 'tagline', '拖我即可逐个摆放选项'));
      var ui2 = WY.ensureUI(self.project);
      var preview = list.length ? list.slice(0, 3) : [null, null];
      preview.forEach(function (c, i) {
        var inner = el('div', 'wy-ghost-inner');
        if (c) applyChoiceLook(inner, self.project, c, ui2);
        else inner.classList.add('wy-ghost-plain');
        inner.textContent = c ? (c.hideText ? '' : (c.text || '选项 ' + (i + 1))) : ('选项' + (i + 1));
        ghost.appendChild(inner);
      });
      canvas.appendChild(ghost);

      bindGhostDrag(canvas, ghost,
        function () { return { x: ui.choice.x, y: ui.choice.y }; },
        function (nx, ny) { ui.choice.x = nx; ui.choice.y = ny; },
        function () {
          self.toFree();
          self.toast('已切到逐个摆放，现在每个选项都能单独拖');
          self.render();
        });
      return;
    }

    // ---- 自由摆放：逐个选项 ----
    if (!list.length) {
      var tip = el('div', 'wy-choiceghost wy-choiceghost-none');
      tip.style.left = '50%';
      tip.style.top = '62%';
      tip.style.width = pct + '%';
      tip.appendChild(el('div', 'tagline', '这一场还没有选项'));
      canvas.appendChild(tip);
      return;
    }

    var mid = (list.length - 1) / 2;
    list.forEach(function (c, i) {
      var cx = typeof c.x === 'number' ? c.x : ui.choice.x;
      var cy = typeof c.y === 'number' ? c.y : (ui.choice.y + (i - mid) * 0.12);

      var g = el('div', 'wy-choiceghost wy-choiceghost-one');
      g.style.left = (cx * 100) + '%';
      g.style.top = (cy * 100) + '%';
      g.style.width = pct + '%';
      // 直接用真实素材渲染，这样才能跟背景对齐
      var inner = el('div', 'wy-ghost-inner');
      applyChoiceLook(inner, self.project, c, WY.ensureUI(self.project));
      inner.textContent = c.hideText ? '' : (c.text || '（空选项 ' + (i + 1) + '）');
      g.appendChild(inner);
      canvas.appendChild(g);

      bindGhostDrag(canvas, g,
        function () {
          return {
            x: typeof c.x === 'number' ? c.x : ui.choice.x,
            y: typeof c.y === 'number' ? c.y : (ui.choice.y + (i - mid) * 0.12)
          };
        },
        function (nx, ny) { c.x = nx; c.y = ny; },
        function () { self.render(); });
    });
  };

  StageEditor.toast = function (msg) {
    var t = el('div', 'wy-inline-note', msg);
    t.style.cssText = 'position:sticky;bottom:0;margin-top:10px;text-align:center;';
    this.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  };

  /** 气泡可以直接在画布上拖 */
  StageEditor.bindBubbleDrag = function (canvas) {
    var self = this;
    if (!this.view || !this.view.bubbles) return;
    this.view.bubbles.forEach(function (item, i) {
      var b = item.data;
      var node = item.el;
      node.style.pointerEvents = 'auto';
      node.style.cursor = 'grab';
      node.style.touchAction = 'none';
      bindGhostDrag(canvas, node,
        function () { return { x: b.x, y: b.y }; },
        function (nx, ny) { b.x = nx; b.y = ny; },
        function () { self.editBubble = i; self.render(); });
    });
  };

  StageEditor.addActor = function () {
    var self = this;
    var node = this.node;
    var images = WY.assetList(this.project).filter(function (a) { return a.type === 'image'; });
    if (!images.length) {
      var d = el('div', 'wy-modal-mask');
      var m = el('div', 'wy-modal');
      m.appendChild(el('h3', null, '还没有图片素材'));
      m.appendChild(el('p', null, '先去「素材」页上传一张立绘图片（透明背景的 PNG 最好），再回来添加角色。'));
      var b = btn('wy-menu-item', '知道了');
      b.addEventListener('click', function () { d.remove(); });
      m.appendChild(b);
      d.appendChild(m);
      this.sheet.appendChild(d);
      return;
    }
    var actor = WY.newActor({ sprite: images[0].id, name: '角色' + (node.stage.actors.length + 1) });
    node.stage.actors.push(actor);
    // 给个默认出场，免得加完看不到
    var tr = WY.getTrack(node, actor.id, true);
    tr.keys = WY.buildPreset('slideLeft', WY.STAGE_DEFAULTS, 0);
    WY.sortTrack(tr);
    this.selected = actor.id;
    this.time = 0;
    this.render();
  };

  function slider(label, value, min, max, step, onchange) {
    var wrap = el('div');
    var lab = el('div', 'wy-field-label');
    lab.appendChild(el('span', null, label));
    var out = el('span', null, Number(value).toFixed(2));
    lab.appendChild(out);
    wrap.appendChild(lab);
    var r = el('input');
    r.type = 'range';
    r.className = 'wy-range2';
    r.min = String(min); r.max = String(max); r.step = String(step);
    r.value = String(value);
    r.addEventListener('input', function () {
      out.textContent = Number(r.value).toFixed(2);
      onchange(Number(r.value));
    });
    wrap.appendChild(r);
    return wrap;
  }

  function fmt(ms) {
    if (ms >= 1000) return (ms / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
    return Math.round(ms) + 'ms';
  }

  var WYStage = {
    mount: mount, applyTime: applyTime, setSpeaker: setSpeaker, setBackground: setBackground,
    applyFaces: applyFaces, actorSrc: actorSrc,
    play: play, stop: stop, propsAt: propsAt, writeKey: writeKey, keyAt: keyAt,
    removeActor: removeActor, spriteData: spriteData
  };

  root.WYStage = WYStage;
  root.WYStageEditor = StageEditor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
