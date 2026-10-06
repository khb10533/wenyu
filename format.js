/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 数据格式与规则引擎
 * 全部为纯函数，不碰 DOM —— 因此可以在 Node 里直接单测。
 * ============================================================ */
(function (root) {
  'use strict';

  var FORMAT = 'wenyu';
  var VERSION = 8;
  var FILE_EXT = '.wy';

  var VAR_TYPES = ['number', 'string', 'bool'];
  var OPS = [
    { id: '==', label: '等于' },
    { id: '!=', label: '不等于' },
    { id: '>=', label: '大于等于' },
    { id: '<=', label: '小于等于' },
    { id: '>', label: '大于' },
    { id: '<', label: '小于' },
    { id: 'contains', label: '包含文字' },
    { id: 'truthy', label: '已开启' },
    { id: 'falsy', label: '未开启' }
  ];
  var EFFECT_OPS = [
    { id: 'add', label: '增加' },
    { id: 'sub', label: '减少' },
    { id: 'set', label: '设为' },
    { id: 'face', label: '换表情' }
  ];

  var _seq = 0;
  function uid(prefix) {
    _seq = (_seq + 1) % 100000;
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      _seq.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function nowISO() { return new Date().toISOString(); }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- 构造器 ---------------- */

  var DISPLAY_MODES = [
    { id: 'off', label: '不显示' },
    { id: 'codex', label: '只在图鉴 / 状态里' },
    { id: 'top', label: '顶部常驻显示' }
  ];

  function newVar(over) {
    return assign({ key: '新变量', type: 'number', initial: 0, display: 'off' }, over);
  }

  function varDisplay(def) {
    if (!def) return 'off';
    if (def.display) return def.display;
    return def.show ? 'top' : 'off';   // v2 以前只有 show 布尔
  }

  function newEffect(over) {
    return assign({ op: 'add', key: '', value: 1 }, over);
  }

  function newRule(over) {
    return assign({ key: '', op: '>=', value: 1 }, over);
  }

  function newChoice(over) {
    return assign({
      id: uid('c'),
      text: '',
      to: null,
      once: false,
      condition: null,
      effects: [],
      img: null,          // 这个选项自己的图片素材
      hideText: false,    // 图片本身就是选项内容，不显示文字
      x: null,            // 自由摆放时这个选项自己的位置（null = 跟着整块走）
      y: null
    }, over);
  }

  function newNode(over) {
    return assign({
      id: uid('n'),
      title: '',
      text: '',
      bg: null,
      bgm: null,
      sfx: null,
      onEnter: [],
      choices: [],
      autoNext: null,
      ending: null,
      speaker: null,
      choiceLayout: null,     // 这一场的选项位置（null = 跟随全局）
      bubbles: [],            // 情绪气泡
      stage: emptyStage()
    }, over);
  }

  function newProject(over) {
    var start = newNode({ title: '开场', text: '在这里写下你的开场白。\n\n点下面的「添加选项」，就能让故事分岔。' });
    return assign({
      format: FORMAT,
      version: VERSION,
      id: uid('p'),
      meta: {
        title: '我的文字游戏',
        author: '柳漪春涛',
        desc: '',
        cover: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
      },
      config: {
        startNode: start.id,
        vars: [newVar({ key: '好感度', type: 'number', initial: 0, display: 'codex' })],
        theme: {
          // 默认就是「异次元」那套：深空紫底 + 青紫强调色，
          // 配合 player.css 的金线辉光层，新工程开箱即有质感。
          bg: '#0a0916',
          fg: '#ece9ff',
          accent: '#a78bfa',
          fontSize: 18,
          font: ''
        },
        ui: defaultUI()
      },
      // 默认给一个「状态」页：新玩家点开菜单就能看到数值，不用挂在屏幕顶上
      codex: {
        groups: [newCodexGroup({ name: '状态', icon: '📊', kind: 'status', order: 0 })],
        entries: []
      },
      characters: [],
      assets: {},
      nodes: [start]
    }, over);
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  /* ---------------- 变量与规则引擎 ---------------- */

  function coerce(value, type) {
    if (type === 'number') return num(value);
    if (type === 'bool') return value === true || value === 'true' || value === 1 || value === '1';
    return value == null ? '' : String(value);
  }

  function initialVars(project) {
    var vars = {};
    var defs = (project && project.config && project.config.vars) || [];
    for (var i = 0; i < defs.length; i++) {
      if (!defs[i] || !defs[i].key) continue;
      vars[defs[i].key] = coerce(defs[i].initial, defs[i].type);
    }
    return vars;
  }

  function varDef(project, key) {
    var defs = (project && project.config && project.config.vars) || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].key === key) return defs[i];
    return null;
  }

  function varType(project, key) {
    var d = varDef(project, key);
    return d ? d.type : 'number';
  }

  function looseEq(a, b) {
    if (a === b) return true;
    var sa = a === null || a === undefined ? '' : String(a);
    var sb = b === null || b === undefined ? '' : String(b);
    if (sa === sb) return true;
    if (sa !== '' && sb !== '' && !isNaN(Number(sa)) && !isNaN(Number(sb))) return Number(sa) === Number(sb);
    return false;
  }

  function evalRule(vars, r) {
    if (!r) return true;
    var cur = vars[r.key];
    var op = r.op || '==';
    if (op === 'truthy') return !!cur;
    if (op === 'falsy') return !cur;
    if (op === '==') return looseEq(cur, r.value);
    if (op === '!=') return !looseEq(cur, r.value);
    if (op === 'contains') return String(cur == null ? '' : cur).indexOf(String(r.value == null ? '' : r.value)) >= 0;
    var a = num(cur), b = num(r.value);
    if (op === '>') return a > b;
    if (op === '>=') return a >= b;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
    return false;
  }

  function evalCondition(vars, cond) {
    if (!cond || !cond.rules || !cond.rules.length) return true;
    var out = false;
    for (var i = 0; i < cond.rules.length; i++) {
      var ok = evalRule(vars, cond.rules[i]);
      if (cond.logic === 'or') { if (ok) return true; out = false; }
      else { if (!ok) return false; out = true; }
    }
    return out;
  }

  function applyEffects(project, vars, effects, faces) {
    if (!effects) return vars;
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      if (!e) continue;
      // 「换表情」不改数值，改的是某个角色此刻的脸
      if (e.op === 'face') {
        if (faces && e.actorId) faces[e.actorId] = e.face || '默认';
        continue;
      }
      if (!e.key) continue;
      var type = varType(project, e.key);
      if (e.op === 'add') {
        if (type === 'string') vars[e.key] = String(vars[e.key] == null ? '' : vars[e.key]) + String(e.value == null ? '' : e.value);
        else vars[e.key] = num(vars[e.key]) + num(e.value);
      } else if (e.op === 'sub') {
        vars[e.key] = num(vars[e.key]) - num(e.value);
      } else {
        vars[e.key] = coerce(e.value, type);
      }
    }
    return vars;
  }

  /** 某场景当前可显示的选项（过滤掉条件和一次性选项） */
  function availableChoices(project, node, vars, usedChoices) {
    var out = [];
    var list = (node && node.choices) || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.once && usedChoices && usedChoices[c.id]) continue;
      if (!evalCondition(vars, c.condition)) continue;
      out.push(c);
    }
    return out;
  }

  /* ============================================================
   * 界面配置（选项外观 / 顶部状态条 / 字体 / 存档位）
   * ============================================================ */

  var CHOICE_LAYOUTS = [
    { id: 'below', label: '对话框下方' },
    { id: 'center', label: '画面中间' },
    { id: 'bottom', label: '贴着画面底部' },
    { id: 'free', label: '自由摆放（可拖动）' }
  ];

  var ORIENTATIONS = [
    { id: 'portrait', label: '竖屏' },
    { id: 'landscape', label: '横屏' },
    { id: 'auto', label: '跟随设备' }
  ];
  var CHOICE_SHAPES = [
    { id: 'bar', label: '长条' },
    { id: 'card', label: '卡片' },
    { id: 'plain', label: '纯文字' },
    { id: 'numbered', label: '带序号' }
  ];
  var CHOICE_ALIGNS = [
    { id: 'left', label: '左对齐' },
    { id: 'center', label: '居中' }
  ];
  var CHOICE_BGFITS = [
    { id: 'slice', label: '九宫格（保住圆角，适合带边框的图）' },
    { id: 'stretch', label: '拉伸铺满（适合纹理 / 渐变图）' }
  ];

  var CHOICE_WIDTHS = [
    { id: 'full', label: '满宽' },
    { id: 'wide', label: '收窄到 80%' },
    { id: 'narrow', label: '收窄到 60%' }
  ];

  /** 可以被作者换成自己素材的界面部位 */
  var SKIN_SLOTS = [
    { id: 'box', label: '对话框底图', hint: '对话框那一整条的底图' },
    { id: 'name', label: '说话人名牌' },
    { id: 'page', label: '整页背景', hint: '图鉴 / 背包 / 存档 / 菜单 的整页底图' },
    { id: 'header', label: '页面标题栏', hint: '图鉴、存档那些页面的顶栏' },
    { id: 'button', label: '各种按钮', hint: '菜单项、存读档按钮、返回/关闭键' },
    { id: 'codex', label: '图鉴卡片底', hint: '人物卡、道具卡的底板' },
    { id: 'save', label: '存档格底' }
  ];

  var SKIN_FITS = [
    { id: 'slice', label: '九宫格（保住四角，适合带边框的图）' },
    { id: 'stretch', label: '拉伸铺满（适合纹理 / 渐变）' }
  ];

  /** 装饰风格：异次元那类轻小说界面的花边、金线、辉光，可以关掉换回朴素 */
  var ORNAMENTS = [
    { id: 'rune', label: '异次元（金线描边 + 辉光 + 角饰）' },
    { id: 'none', label: '朴素（干净无装饰）' }
  ];

  /**
   * 界面尺寸的可调项。
   * 值为 0 表示「跟随默认」，这样作者不碰就是原样，改了就逐项生效。
   */
  var SIZE_FIELDS = [
    { key: 'box.fontSize', label: '对话框字号', min: 0, max: 40, def: 0 },
    { key: 'box.padX', label: '对话框左右留白', min: 0, max: 60, def: 0 },
    { key: 'box.padY', label: '对话框上下留白', min: 0, max: 48, def: 0 },
    { key: 'choice.fontSize', label: '选项字号', min: 0, max: 40, def: 0 },
    { key: 'choice.padX', label: '选项左右内边距', min: 0, max: 60, def: 0 },
    { key: 'choice.padY', label: '选项上下内边距', min: 0, max: 40, def: 0 },
    { key: 'choice.gap', label: '选项之间的间隔', min: 0, max: 40, def: 9 },
    { key: 'choice.minH', label: '选项最小高度', min: 0, max: 120, def: 0 },
    { key: 'choice.inset', label: '选项左右离屏幕边缘', min: 0, max: 60, def: 16 }
  ];

  var BOX_STYLES = [
    { id: 'band', label: '贴边整条（贴着画面最底下）' },
    { id: 'card', label: '悬浮圆角卡片' }
  ];

  function getPath(obj, path) {
    var cur = obj;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function clampNum(v, min, max, def) {
    var n = Number(v);
    if (v === null || v === '' || !isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  function defaultUI() {
    return {
      hudTop: false,              // 变量是否常驻屏幕顶部（默认关，玩家抱怨过）
      font: null,                 // 自定义字体素材 id
      fontScale: 1,
      // 对话框：钉在画面最底部，并限制最高占多少（超出在框内滚动），
      // 这样长台词也不会一路顶上去把立绘挡住
      box: { maxHeight: 40, style: 'band', fontSize: 0, padX: 0, padY: 0 },
      // 装饰：异次元那类界面（金线 + 辉光 + 角饰），可以关掉
      ornament: 'rune',
      // 界面素材：留空就用内置样式；填了就整套换成作者自己的图
      skins: { box: null, name: null, page: null, header: null, button: null, codex: null, save: null },
      skinFit: 'slice',
      orientation: 'portrait',      // portrait | landscape | auto
      choice: {
        layout: 'center',
        shape: 'bar',
        align: 'left',
        width: 'full',
        bg: null,
        bgFit: 'slice',             // 选项框素材怎么铺：slice 九宫格 / stretch 拉伸
        x: 0.5,                     // 自由摆放时选项块的中心位置（归一化）
        y: 0.62,
        // ---- 尺寸：0 = 跟随默认，改了才生效 ----
        fontSize: 0,
        padX: 0,
        padY: 0,
        minH: 0,
        gap: 9,
        inset: 16
      },
      saves: { slots: 3 }
    };
  }

  function ensureUI(project) {
    if (!project.config.ui) project.config.ui = defaultUI();
    var ui = project.config.ui;
    var d = defaultUI();
    ui.hudTop = !!ui.hudTop;
    ui.font = ui.font || null;
    ui.fontScale = typeof ui.fontScale === 'number' ? ui.fontScale : 1;
    ui.box = assign(d.box, ui.box || {});
    ui.box.maxHeight = Math.max(15, Math.min(80, typeof ui.box.maxHeight === 'number' ? ui.box.maxHeight : 40));
    if (['band', 'card'].indexOf(ui.box.style) < 0) ui.box.style = 'band';
    // 尺寸项统一钳制，免得手改文件或老数据带出离谱的值
    SIZE_FIELDS.forEach(function (f) {
      var parts = f.key.split('.');
      if (!ui[parts[0]]) ui[parts[0]] = {};
      ui[parts[0]][parts[1]] = clampNum(ui[parts[0]][parts[1]], f.min, f.max, f.def);
    });
    if (ORNAMENTS.map(function (o) { return o.id; }).indexOf(ui.ornament) < 0) ui.ornament = 'rune';
    ui.skins = assign({ box: null, name: null, page: null, header: null, button: null, codex: null, save: null }, ui.skins || {});
    if (['slice', 'stretch'].indexOf(ui.skinFit) < 0) ui.skinFit = 'slice';
    ui.choice = assign(d.choice, ui.choice || {});
    ui.choice.x = typeof ui.choice.x === 'number' ? ui.choice.x : 0.5;
    ui.choice.y = typeof ui.choice.y === 'number' ? ui.choice.y : 0.62;
    ui.saves = assign(d.saves, ui.saves || {});
    if (['portrait', 'landscape', 'auto'].indexOf(ui.orientation) < 0) ui.orientation = 'portrait';
    return ui;
  }

  /* ============================================================
   * 图鉴：分组 + 条目
   *   「人物」「背包」「状态」本质上是同一套东西 —— 分组里放条目，
   *   条目 = 一张图 + 名称 + 说明 + 要展示的变量。
   *   分组 kind: 'list' 显示条目卡片；'status' 直接列出变量表。
   * ============================================================ */

  function defaultCodex() {
    return { groups: [], entries: [] };
  }

  function newCodexGroup(over) {
    return assign({
      id: uid('g'),
      name: '人物',
      icon: '📖',
      kind: 'list',
      order: 0
    }, over);
  }

  function newCodexEntry(over) {
    return assign({
      id: uid('e'),
      groupId: null,
      name: '',
      image: null,
      desc: '',
      vars: [],
      unlock: null,
      blurLocked: true          // 没解锁时显示成「???」而不是直接消失
    }, over);
  }

  function ensureCodex(project) {
    if (!project.codex || typeof project.codex !== 'object') project.codex = defaultCodex();
    if (!Array.isArray(project.codex.groups)) project.codex.groups = [];
    if (!Array.isArray(project.codex.entries)) project.codex.entries = [];
    return project.codex;
  }

  function codexGroups(project) {
    var c = ensureCodex(project);
    return c.groups.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function codexEntriesOf(project, groupId) {
    return ensureCodex(project).entries.filter(function (e) { return e.groupId === groupId; });
  }

  /** 某一场实际生效的选项位置：单场设置优先，否则用全局 */
  function effectiveChoiceLayout(project, node) {
    if (node && node.choiceLayout) return node.choiceLayout;
    return ensureUI(project).choice.layout;
  }

  function codexEntryVisible(vars, entry) {
    return !entry.unlock || evalCondition(vars, entry.unlock);
  }

  /** 状态型分组要列的变量：所有「不隐藏」的变量 */
  function statusVars(project) {
    return (project.config.vars || []).filter(function (d) {
      return d.key && varDisplay(d) !== 'off';
    });
  }

  /** 菜单里该出现哪些图鉴入口（空分组不出现） */
  function codexMenu(project) {
    return codexGroups(project).filter(function (g) {
      if (g.kind === 'status') return statusVars(project).length > 0;
      return codexEntriesOf(project, g.id).length > 0;
    });
  }

  /* ============================================================
   * 舞台与关键帧
   *   角色 actor  = 用哪张立绘、叫什么名字
   *   轨道 track  = 一个角色的关键帧序列（按时间排序）
   *   关键帧 key  = 某时刻的位置/缩放/透明度/翻转
   * 播放器在两个关键帧之间自动补间。
   * ============================================================ */

  var EASES = [
    { id: 'out', label: '先快后慢' },
    { id: 'linear', label: '匀速' },
    { id: 'inout', label: '两头慢' },
    { id: 'in', label: '先慢后快' }
  ];

  var STAGE_DEFAULTS = { x: 0.5, y: 1, scale: 1, opacity: 1, flip: false };

  function emptyStage() { return { actors: [], tracks: [] }; }

  function newActor(over) {
    return assign({
      id: uid('ac'),
      character: null,   // 指向 project.characters 里的一个角色（v8 起）
      sprite: null,      // 老工程的内联立绘；有新角色后由角色定义提供
      faces: [],         // 老工程的内联表情差分
      name: '',
      dim: true,
      z: 0
    }, over);
  }

  /* ---------------- 角色（v8 起的一等公民） ----------------
   * 以前每个场景里的 actor 都把「名字 + 立绘 + 全部表情差分」各存一份，
   * 同一个角色出现在 19 个场景里就有 19 份拷贝，改一次要改 19 处。
   * 现在角色单独定义在 project.characters 里，场景里的 actor 只是一张
   * 「谁上场」的引用（character: 角色 id），名字和立绘自动带过来。
   * 老工程不迁移也能跑：没有 character 的 actor 还走内联字段。
   * -------------------------------------------------------- */

  function newCharacter(over) {
    return assign({
      id: uid('ch'),
      name: '',
      sprite: null,      // 「默认」那张立绘
      faces: [],         // 表情差分：[{ id, name, img }]
      color: ''          // 这个名字在对话里显示的颜色（可留空）
    }, over);
  }

  function charactersOf(project) {
    if (!project) return [];
    if (!Array.isArray(project.characters)) project.characters = [];
    return project.characters;
  }

  function findCharacter(project, id) {
    if (!id) return null;
    var list = charactersOf(project);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** 按名字找角色（老工程迁移、以及「说话人」按名字回填时用） */
  function findCharacterByName(project, name) {
    if (!name) return null;
    var list = charactersOf(project);
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /**
   * 把一个上场角色解析成「真正该用的名字 + 立绘 + 表情表」。
   * 有新角色就用角色的，没有（老工程 / 内联角色）就原样返回。
   * 返回的是新对象，改它不会污染工程数据。
   */
  function resolveActor(project, actor) {
    if (!actor) return actor;
    var ch = actor.character ? findCharacter(project, actor.character) : null;
    if (!ch) return actor;
    return assign({}, actor, {
      name: ch.name || actor.name || '',
      sprite: ch.sprite || null,
      faces: ch.faces || [],
      character: ch.id
    });
  }

  /** 一个角色在某表情下用的图（project 可省略，省略时按内联角色理解） */
  function characterFaceImage(ch, faceName) {
    if (!ch) return null;
    var want = faceName == null ? '默认' : String(faceName);
    if (!want || want === '默认') return ch.sprite || null;
    var list = ch.faces || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === want && list[i].img) return list[i].img;
    }
    return ch.sprite || null;
  }

  function characterFaceNames(ch) {
    var out = ['默认'];
    (ch && ch.faces ? ch.faces : []).forEach(function (fc) {
      if (fc.name && out.indexOf(fc.name) < 0) out.push(fc.name);
    });
    return out;
  }

  var BUBBLE_ANIMS = [
    { id: 'none', label: '不动' },
    { id: 'pop', label: '弹出来' },
    { id: 'blink', label: '闪烁' },
    { id: 'float', label: '上下飘' },
    { id: 'shake', label: '左右抖' },
    { id: 'pulse', label: '一缩一放' }
  ];

  /** 情绪气泡：可以是一张图，也可以是一张动图（GIF） */
  function newBubble(over) {
    return assign({
      id: uid('bb'),
      img: null,
      x: 0.5,
      y: 0.3,
      scale: 1,
      flip: false,
      anim: 'pop',      // none | pop | blink | float | shake | pulse
      at: 0,            // 第几毫秒冒出来
      dur: 0            // 持续多久（0 = 一直到本场结束）
    }, over);
  }

  /** 某一时刻该显示哪些气泡 */
  function bubblesAt(node, t) {
    var list = (node && node.bubbles) || [];
    return list.filter(function (b) {
      var at = b.at || 0;
      if (t < at) return false;
      if (b.dur > 0 && t > at + b.dur) return false;
      return true;
    });
  }

  function newFace(over) {
    return assign({ id: uid('fc'), name: '表情', img: null }, over);
  }

  /** 某个角色在指定表情下该用哪张图（传 project 才会去角色定义里取） */
  function actorFaceImage(actor, faceName, project) {
    return characterFaceImage(project ? resolveActor(project, actor) : actor, faceName);
  }

  /** 这个角色能用的表情名（含默认） */
  function actorFaceNames(actor, project) {
    return characterFaceNames(project ? resolveActor(project, actor) : actor);
  }

  /** 正在用某张脸的角色的缓存键 */
  function actorImageKey(actor, faceName, project) {
    return actor.id + '|' + actorFaceImage(actor, faceName, project);
  }

  function newKey(over) {
    return assign({
      id: uid('k'),
      at: 0,
      x: STAGE_DEFAULTS.x,
      y: STAGE_DEFAULTS.y,
      scale: STAGE_DEFAULTS.scale,
      opacity: STAGE_DEFAULTS.opacity,
      flip: STAGE_DEFAULTS.flip
    }, over);
  }

  function ensureStage(node) {
    if (!node.stage || typeof node.stage !== 'object') node.stage = emptyStage();
    if (!Array.isArray(node.stage.actors)) node.stage.actors = [];
    if (!Array.isArray(node.stage.tracks)) node.stage.tracks = [];
    return node.stage;
  }

  function getActor(node, id) {
    var st = ensureStage(node);
    for (var i = 0; i < st.actors.length; i++) if (st.actors[i].id === id) return st.actors[i];
    return null;
  }

  function getTrack(node, actorId, create) {
    var st = ensureStage(node);
    for (var i = 0; i < st.tracks.length; i++) if (st.tracks[i].actorId === actorId) return st.tracks[i];
    if (!create) return null;
    var t = { actorId: actorId, keys: [] };
    st.tracks.push(t);
    return t;
  }

  function sortTrack(track) {
    if (track && track.keys) track.keys.sort(function (a, b) { return a.at - b.at; });
    return track;
  }

  /* ---------------- 缓动与补间 ---------------- */

  function applyEase(ease, t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (ease === 'out') return 1 - Math.pow(1 - t, 3);
    if (ease === 'in') return t * t * t;
    if (ease === 'inout') return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return t;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function keyProps(k) {
    return { x: k.x, y: k.y, scale: k.scale, opacity: k.opacity, flip: !!k.flip };
  }

  function lerpKey(from, to, rawT, ease) {
    var t = applyEase(ease, rawT);
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      scale: lerp(from.scale, to.scale, t),
      opacity: lerp(from.opacity, to.opacity, t),
      // 翻转不插值：走到下一个关键帧的那一刻才切换
      flip: !!from.flip
    };
  }

  /** 某轨道在 t 时刻的状态；返回 null 表示这个角色还没上场 */
  function trackPropsAt(track, t, ease) {
    if (!track || !track.keys || !track.keys.length) return null;
    var keys = track.keys;
    if (t < keys[0].at) return null;
    if (keys.length === 1 || t >= keys[keys.length - 1].at) return keyProps(keys[keys.length - 1]);
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (t >= a.at && t < b.at) {
        var span = b.at - a.at;
        return lerpKey(a, b, span <= 0 ? 1 : (t - a.at) / span, ease || 'out');
      }
    }
    return keyProps(keys[keys.length - 1]);
  }

  /** 整个舞台在 t 时刻的样子：[{actor, props}]，已按层级排序 */
  function stageAt(node, t, ease) {
    if (!node || !node.stage) return [];
    var st = ensureStage(node);
    var out = [];
    for (var i = 0; i < st.actors.length; i++) {
      var actor = st.actors[i];
      var props = trackPropsAt(getTrack(node, actor.id), t, ease);
      if (props) out.push({ actor: actor, props: props });
    }
    out.sort(function (a, b) {
      var za = a.actor.z || 0, zb = b.actor.z || 0;
      if (za !== zb) return za - zb;
      return a.props.scale - b.props.scale;
    });
    return out;
  }

  /** 舞台总时长（最后一个关键帧的时刻） */
  function stageDuration(node) {
    if (!node || !node.stage) return 0;
    var st = ensureStage(node);
    var max = 0;
    for (var i = 0; i < st.tracks.length; i++) {
      var keys = st.tracks[i].keys || [];
      for (var j = 0; j < keys.length; j++) if (keys[j].at > max) max = keys[j].at;
    }
    return max;
  }

  function actorHasStage(node, actorId) {
    var t = getTrack(node, actorId);
    return !!(t && t.keys && t.keys.length);
  }

  /* ---------------- 一键预设 ---------------- */

  var PRESETS = [
    { id: 'appear', label: '直接出现', mode: 'replace', dur: 0 },
    { id: 'slideLeft', label: '从左边滑入', mode: 'replace', dur: 520 },
    { id: 'slideRight', label: '从右边滑入', mode: 'replace', dur: 520 },
    { id: 'fadeIn', label: '淡入', mode: 'replace', dur: 500 },
    { id: 'popIn', label: '弹出放大', mode: 'replace', dur: 340 },
    { id: 'exitLeft', label: '滑向左边退场', mode: 'append', dur: 450 },
    { id: 'exitFade', label: '淡出退场', mode: 'append', dur: 450 },
    { id: 'shake', label: '左右抖动', mode: 'append', dur: 420 },
    { id: 'move', label: '平移到当前帧位置', mode: 'append', dur: 500 }
  ];

  /**
   * 生成预设的关键帧序列。
   * @param id      预设 id
   * @param base    该角色的"落位"（通常取它当前选中的关键帧或默认值）
   * @param startAt append 模式下的起始时刻
   */
  function buildPreset(id, base, startAt) {
    base = assign({}, STAGE_DEFAULTS, base || {});
    var s = startAt || 0;
    var K = function (at, over) { return newKey(assign({ at: at, x: base.x, y: base.y, scale: base.scale, opacity: base.opacity, flip: base.flip }, over)); };
    var off = function (dx) { return { x: base.x + dx }; };

    switch (id) {
      case 'appear':
        return [K(0)];
      case 'slideLeft':
        return [K(s, assign({ x: -0.2 }, {})), K(s + 520, { x: base.x })];
      case 'slideRight':
        return [K(s, { x: 1.2 }), K(s + 520, { x: base.x })];
      case 'fadeIn':
        return [K(s, { opacity: 0 }), K(s + 500, { opacity: base.opacity })];
      case 'popIn':
        return [K(s, { scale: base.scale * 0.25, opacity: 0 }), K(s + 340, { scale: base.scale, opacity: base.opacity })];
      case 'exitLeft':
        return [K(s, {}), K(s + 450, { x: -0.25 })];
      case 'exitFade':
        return [K(s, {}), K(s + 450, { opacity: 0 })];
      case 'shake': {
        var out = [K(s, {})];
        for (var i = 1; i <= 6; i++) out.push(K(s + i * 70, { x: base.x + (i % 2 ? 0.03 : -0.03) }));
        out.push(K(s + 490, { x: base.x }));
        return out;
      }
      case 'move':
        return [K(s, {}), K(s + 500, { x: base.x })];
      default:
        return [K(s, {})];
    }
  }

  function presetLabel(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i].label;
    return id;
  }

  /* ---------------- 查询 ---------------- */

  function getNode(project, id) {
    if (!project || !project.nodes) return null;
    for (var i = 0; i < project.nodes.length; i++) if (project.nodes[i].id === id) return project.nodes[i];
    return null;
  }

  function nodeIndex(project, id) {
    if (!project || !project.nodes) return -1;
    for (var i = 0; i < project.nodes.length; i++) if (project.nodes[i].id === id) return i;
    return -1;
  }

  function nodeLabel(project, id) {
    var idx = nodeIndex(project, id);
    if (idx < 0) return '（未连接）';
    var n = project.nodes[idx];
    var t = (n.title || '').trim() || firstLine(n.text) || '空场景';
    return '#' + (idx + 1) + ' ' + t.slice(0, 14);
  }

  function firstLine(text) {
    if (!text) return '';
    var s = String(text).split('\n')[0].trim();
    return s;
  }

  /** 图片素材的宽高（上传时记下来，纯图片选项靠它撑对比例） */
  function assetSize(asset) {
    if (!asset) return null;
    if (asset.w && asset.h) return { w: asset.w, h: asset.h };
    return null;
  }

  function assetList(project) {
    var out = [];
    var a = (project && project.assets) || {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out.push(assign({ id: k }, a[k]));
    out.sort(function (x, y) { return (x.name || '').localeCompare(y.name || ''); });
    return out;
  }

  function assetsOfType(project, type) {
    return assetList(project).filter(function (a) { return a.type === type; });
  }

  function assetUsage(project) {
    var used = {};
    var nodes = (project && project.nodes) || [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.bg) used[n.bg] = true;
      if (n.bgm) used[n.bgm] = true;
      if (n.sfx) used[n.sfx] = true;
      // 立绘也是素材，漏掉的话「清理未使用素材」会把正在用的立绘删掉
      var actors = (n.stage && n.stage.actors) || [];
      for (var j = 0; j < actors.length; j++) {
        if (actors[j].sprite) used[actors[j].sprite] = true;
        // 表情差分的图也算在用
        var faces = actors[j].faces || [];
        for (var k2 = 0; k2 < faces.length; k2++) {
          if (faces[k2].img) used[faces[k2].img] = true;
        }
      }
    }
    // 角色定义里的立绘和表情差分 —— 漏了「清理未使用素材」就会把角色的脸全删光
    charactersOf(project).forEach(function (ch) {
      if (ch.sprite) used[ch.sprite] = true;
      (ch.faces || []).forEach(function (fc) { if (fc.img) used[fc.img] = true; });
    });
    if (project && project.meta && project.meta.cover) used[project.meta.cover] = true;

    // 界面配置里引用的素材：字体、选项框
    var ui = project && project.config && project.config.ui;
    if (ui) {
      if (ui.font) used[ui.font] = true;
      if (ui.choice && ui.choice.bg) used[ui.choice.bg] = true;
    }
    // 界面素材（对话框底图、名牌、图鉴卡片底…）
    if (ui && ui.skins) {
      Object.keys(ui.skins).forEach(function (k) { if (ui.skins[k]) used[ui.skins[k]] = true; });
    }
    // 情绪气泡
    for (var bi = 0; bi < nodes.length; bi++) {
      var bubs = nodes[bi].bubbles || [];
      for (var bj = 0; bj < bubs.length; bj++) if (bubs[bj].img) used[bubs[bj].img] = true;
    }
    // 图鉴条目的配图
    var codex = project && project.codex;
    if (codex && Array.isArray(codex.entries)) {
      for (var ci = 0; ci < codex.entries.length; ci++) {
        if (codex.entries[ci].image) used[codex.entries[ci].image] = true;
      }
    }
    return used;
  }

  /* ---------------- 校验 ---------------- */

  /** 每个角色被多少场景用过：{ 角色id: { scenes, actors } } */
  function characterUsage(project) {
    var out = {};
    (project && project.nodes ? project.nodes : []).forEach(function (n) {
      var seen = {};
      ((n.stage && n.stage.actors) || []).forEach(function (a) {
        if (!a.character) return;
        var u = out[a.character] || (out[a.character] = { scenes: 0, actors: 0 });
        u.actors++;
        if (!seen[a.character]) { seen[a.character] = true; u.scenes++; }
      });
    });
    return out;
  }

  function validate(project) {
    var issues = [];
    var nodes = (project && project.nodes) || [];
    var ids = {};
    for (var i = 0; i < nodes.length; i++) ids[nodes[i].id] = true;

    if (!project.config.startNode || !ids[project.config.startNode]) {
      issues.push({ level: 'error', text: '起始场景无效，试玩会失败。' });
    }

    var reachable = {};
    var queue = [project.config.startNode];
    var guard = 0;
    while (queue.length && guard++ < 20000) {
      var cur = queue.shift();
      if (!cur || reachable[cur] || !ids[cur]) continue;
      reachable[cur] = true;
      var n = getNode(project, cur);
      if (!n) continue;
      var cs = n.choices || [];
      for (var j = 0; j < cs.length; j++) {
        if (cs[j].to) queue.push(cs[j].to);
      }
      if (n.autoNext) queue.push(n.autoNext);
    }

    for (var k = 0; k < nodes.length; k++) {
      var node = nodes[k];
      var label = '#' + (k + 1) + ' ' + (node.title || firstLine(node.text) || '空场景');
      // 判定标准是「有没有结局对象」，不是「有没有写字」——
      // 否则刚点完「设为结局」就会因为标题为空而被判回「不是结局」。
      var hasEnding = !!node.ending;
      if ((!node.text || !node.text.trim()) && !hasEnding) {
        if (!node.choices || !node.choices.length) issues.push({ level: 'warn', nodeId: node.id, text: label + '：没有正文也没有选项。' });
      }
      var cs2 = node.choices || [];
      for (var m = 0; m < cs2.length; m++) {
        if (!cs2[m].to) {
          issues.push({ level: 'warn', nodeId: node.id, text: label + '：选项「' + (cs2[m].text || '(空)') + '」没有指定去向。' });
        } else if (!ids[cs2[m].to]) {
          issues.push({ level: 'error', nodeId: node.id, text: label + '：选项「' + (cs2[m].text || '(空)') + '」指向了已删除的场景。' });
        }
      }
      if (node.autoNext && !ids[node.autoNext]) {
        issues.push({ level: 'error', nodeId: node.id, text: label + '：自动跳转指向了已删除的场景。' });
      }
      if (!cs2.length && !node.autoNext && !hasEnding) {
        issues.push({ level: 'warn', nodeId: node.id, text: label + '：没有选项也不是结局，玩家会卡在这里。' });
      }
      if (!reachable[node.id]) {
        issues.push({ level: 'warn', nodeId: node.id, text: label + '：从开场走不到（孤岛场景）。' });
      }
    }

    var effs = [];
    for (var p = 0; p < nodes.length; p++) {
      var nn = nodes[p];
      var all = (nn.onEnter || []).slice();
      var cc = nn.choices || [];
      for (var q = 0; q < cc.length; q++) all = all.concat(cc[q].effects || []);
      for (var r2 = 0; r2 < all.length; r2++) {
        if (all[r2].key && !varDef(project, all[r2].key)) {
          effs.push('#' + (p + 1) + ' 用到了未定义的变量「' + all[r2].key + '」');
        }
      }
    }
    if (effs.length) issues.push({ level: 'warn', text: '变量未定义：' + effs.slice(0, 3).join('；') + (effs.length > 3 ? ' 等' : '') });

    // 图鉴 / 界面配置的引用检查
    var codex = project.codex;
    if (codex && Array.isArray(codex.entries)) {
      codex.entries.forEach(function (e, i) {
        var label = '图鉴条目「' + (e.name || '#' + (i + 1)) + '」';
        if (e.groupId && !codex.groups.some(function (g) { return g.id === e.groupId; })) {
          issues.push({ level: 'warn', text: label + '：所属分组已被删除，玩家看不到它。' });
        }
        if (e.image && !(project.assets || {})[e.image]) {
          issues.push({ level: 'warn', text: label + '：配图已被删除。' });
        }
        (e.vars || []).forEach(function (k) {
          if (!varDef(project, k)) issues.push({ level: 'warn', text: label + '：要显示的变量「' + k + '」不存在了。' });
        });
        if (!e.name) issues.push({ level: 'warn', text: label + '：还没有名字。' });
      });
    }
    // 角色定义
    var chars = charactersOf(project);
    chars.forEach(function (ch) {
      var nm = ch.name || '（没名字的角色）';
      if (!ch.name) issues.push({ level: 'warn', text: '有个角色还没起名字。' });
      if (!ch.sprite) issues.push({ level: 'warn', text: nm + '：还没有立绘，上场时是空的。' });
      else if (!(project.assets || {})[ch.sprite]) issues.push({ level: 'warn', text: nm + '：立绘已被删除。' });
      (ch.faces || []).forEach(function (fc) {
        if (!fc.img) issues.push({ level: 'warn', text: nm + '：表情「' + (fc.name || '?') + '」还没选图。' });
        else if (!(project.assets || {})[fc.img]) {
          issues.push({ level: 'warn', text: nm + '：表情「' + (fc.name || '?') + '」的图已被删除。' });
        }
      });
    });
    // 场景里引用的角色还在不在
    nodes.forEach(function (n, ni) {
      var actors = (n.stage && n.stage.actors) || [];
      actors.forEach(function (a, ai) {
        if (a.character && !findCharacter(project, a.character)) {
          issues.push({
            level: 'error', nodeId: n.id,
            text: '第 ' + (ni + 1) + ' 场第 ' + (ai + 1) + ' 个角色指向的角色定义已经不存在了，请重新选一个角色。'
          });
        }
        if (!a.character && !a.sprite) {
          issues.push({
            level: 'warn', nodeId: n.id,
            text: '第 ' + (ni + 1) + ' 场有角色还没选立绘。'
          });
        }
      });
    });

    var ui = project.config.ui;
    if (ui) {
      if (ui.font && !(project.assets || {})[ui.font]) issues.push({ level: 'warn', text: '自定义字体已被删除，会退回系统字体。' });
      if (ui.choice && ui.choice.bg && !(project.assets || {})[ui.choice.bg]) issues.push({ level: 'warn', text: '选项框素材已被删除。' });
      if (ui.skins) {
        SKIN_SLOTS.forEach(function (slot) {
          if (ui.skins[slot.id] && !(project.assets || {})[ui.skins[slot.id]]) {
            issues.push({ level: 'warn', text: slot.label + '的素材已被删除，会退回内置样式。' });
          }
        });
      }
    }
    // 气泡
    nodes.forEach(function (n, i2) {
      (n.bubbles || []).forEach(function (b) {
        if (b.img && !(project.assets || {})[b.img]) {
          issues.push({ level: 'warn', nodeId: n.id, text: '#' + (i2 + 1) + ' 有个情绪气泡的图已被删除。' });
        }
      });
    });

    return issues;
  }

  /** 统计信息，用于工程列表和导出提示 */
  function stats(project) {
    var chars = 0;
    var nodes = (project && project.nodes) || [];
    for (var i = 0; i < nodes.length; i++) chars += (nodes[i].text || '').length;
    var bytes = 0;
    var a = (project && project.assets) || {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) bytes += (a[k].data || '').length;
    return {
      nodes: nodes.length,
      chars: chars,
      endings: nodes.filter(function (n) { return !!n.ending; }).length,
      choices: nodes.reduce(function (s, n) { return s + ((n.choices || []).length); }, 0),
      assets: Object.keys(a).length,
      assetBytes: Math.round(bytes * 0.75),
      actors: nodes.reduce(function (sum, n) {
        return sum + ((n.stage && n.stage.actors) ? n.stage.actors.length : 0);
      }, 0),
      codexEntries: (function () {
        var c = project && project.codex;
        return (c && Array.isArray(c.entries)) ? c.entries.length : 0;
      })(),
      codexGroups: (function () {
        var c = project && project.codex;
        return (c && Array.isArray(c.groups)) ? c.groups.length : 0;
      })(),
      keyframes: nodes.reduce(function (sum, n) {
        return sum + ((n.stage && n.stage.tracks) ? n.stage.tracks.reduce(function (s2, t) {
          return s2 + ((t.keys && t.keys.length) || 0);
        }, 0) : 0);
      }, 0)
    };
  }

  /* ---------------- 迁移 / 归一化 ---------------- */

  /**
   * v7 → v8 迁移：把散落在各个场景里的内联角色收拢成 project.characters。
   *
   * 同一个角色原来在每个场景各存一份（名字 + 立绘 + 全部表情），这里按
   * 「名字 + 立绘」去重合并，表情按名字合并。合并后场景里只留一个引用，
   * 内联字段清空 —— 从此改一次立绘，19 个场景一起变。
   */
  function liftCharacters(p) {
    var made = [];
    var byKey = {};
    (p.nodes || []).forEach(function (n) {
      var actors = (n.stage && n.stage.actors) || [];
      actors.forEach(function (a) {
        // 没名字又没立绘的占位角色没什么可共享的，留在原地
        if (!a.name && !a.sprite && !(a.faces && a.faces.length)) return;
        var key = (a.name || '') + '|' + (a.sprite || '');
        var ch = byKey[key];
        if (!ch) {
          ch = newCharacter({ name: a.name || '', sprite: a.sprite || null });
          byKey[key] = ch;
          made.push(ch);
        }
        // 表情按名字合并（同一个「微笑」在不同场景指向不同图时，以先出现的为准）
        (a.faces || []).forEach(function (fc) {
          if (!fc || !fc.name) return;
          var exists = false;
          for (var i = 0; i < ch.faces.length; i++) if (ch.faces[i].name === fc.name) exists = true;
          if (!exists) ch.faces.push(newFace({ name: fc.name, img: fc.img || null }));
        });
        // 内联字段全部清空 —— 名字也清，否则把角色改名成空之后
        // 旧场景里那份残留的 name 会又冒出来，看着像「改不掉」。
        a.character = ch.id;
        a.name = '';
        a.sprite = null;
        a.faces = [];
      });
    });
    return made;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('文件内容不是有效的工程数据');
    if (raw.format && raw.format !== FORMAT) throw new Error('这不是文游工坊的工程文件（format=' + raw.format + '）');

    var p = newProject();
    p.id = raw.id || p.id;
    p.format = FORMAT;
    p.version = VERSION;

    p.meta = assign({}, p.meta, raw.meta || {});
    p.config = assign({}, p.config, raw.config || {});
    p.config.theme = assign({}, newProject().config.theme, (raw.config && raw.config.theme) || {});
    p.config.vars = Array.isArray(raw.config && raw.config.vars) ? raw.config.vars.map(function (v) {
      // v2 的 show 布尔迁移到 v3 的 display 三态
      return assign(newVar(), v, { display: v.display || (v.show ? 'top' : 'off') });
    }) : p.config.vars;
    p.codex = raw.codex || {};
    p.assets = raw.assets && typeof raw.assets === 'object' ? raw.assets : {};
    ensureUI(p);
    ensureCodex(p);
    p.codex.groups = p.codex.groups.map(function (g) { return assign(newCodexGroup(), g); });
    p.codex.entries = p.codex.entries.map(function (e) {
      var en = assign(newCodexEntry(), e);
      en.vars = Array.isArray(e.vars) ? e.vars.filter(function (v) { return typeof v === 'string'; }) : [];
      return en;
    });

    if (Array.isArray(raw.nodes)) {
      p.nodes = raw.nodes.map(function (n) {
        var node = assign(newNode(), n);
        node.choices = Array.isArray(n.choices) ? n.choices.map(function (c) {
          var ch = assign(newChoice(), c);
          ch.x = typeof c.x === 'number' ? c.x : null;
          ch.y = typeof c.y === 'number' ? c.y : null;
          return ch;
        }) : [];
        node.onEnter = Array.isArray(n.onEnter) ? n.onEnter : [];
        node.speaker = n.speaker || null;
        var okLayouts = ['below', 'center', 'bottom', 'free'];
        node.choiceLayout = okLayouts.indexOf(n.choiceLayout) >= 0 ? n.choiceLayout : null;
        // v1 的工程没有舞台，这里补一个空的
        ensureStage(node);
        node.bubbles = Array.isArray(n.bubbles) ? n.bubbles.map(function (b) { return assign(newBubble(), b); }) : [];
        node.stage.actors = node.stage.actors.map(function (a) {
          var ac = assign(newActor(), a);
          ac.faces = Array.isArray(a.faces) ? a.faces.map(function (fc) { return assign(newFace(), fc); }) : [];
          return ac;
        });
        node.stage.tracks = node.stage.tracks
          .filter(function (t) { return t && t.actorId; })
          .map(function (t) {
            return { actorId: t.actorId, keys: (Array.isArray(t.keys) ? t.keys : []).map(function (k) { return assign(newKey(), k); }) };
          })
          .map(sortTrack);
        return node;
      });
    }
    if (!p.nodes.length) p.nodes = [newNode({ title: '开场', text: '' })];
    if (!p.config.startNode || nodeIndex(p, p.config.startNode) < 0) p.config.startNode = p.nodes[0].id;

    // 角色：新格式直接读；老格式（v7 及以前）没有 characters，从场景里收拢出来
    if (Array.isArray(raw.characters)) {
      p.characters = raw.characters.map(function (c) {
        var ch = assign(newCharacter(), c);
        ch.faces = Array.isArray(c.faces) ? c.faces.map(function (fc) { return assign(newFace(), fc); }) : [];
        return ch;
      });
    } else {
      p.characters = liftCharacters(p);
    }
    return p;
  }

  function touch(project) {
    if (project && project.meta) project.meta.updatedAt = nowISO();
    return project;
  }

  /* ---------------- 文本工具 ---------------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function safeFileName(s, fallback) {
    var out = String(s == null ? '' : s).replace(/[\\/:*?"<>|\n\r\t]+/g, '_').trim();
    return out || fallback || 'untitled';
  }

  /* ---------------- 导出 ---------------- */

  var WY = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    FILE_EXT: FILE_EXT,
    VAR_TYPES: VAR_TYPES,
    OPS: OPS,
    EFFECT_OPS: EFFECT_OPS,
    uid: uid,
    nowISO: nowISO,
    num: num,
    clone: clone,
    assign: assign,
    newVar: newVar,
    newEffect: newEffect,
    newRule: newRule,
    newChoice: newChoice,
    newNode: newNode,
    newProject: newProject,
    coerce: coerce,
    initialVars: initialVars,
    varDef: varDef,
    varType: varType,
    evalRule: evalRule,
    evalCondition: evalCondition,
    applyEffects: applyEffects,
    availableChoices: availableChoices,
    getNode: getNode,
    nodeIndex: nodeIndex,
    nodeLabel: nodeLabel,
    firstLine: firstLine,
    DISPLAY_MODES: DISPLAY_MODES,
    ORNAMENTS: ORNAMENTS,
    SIZE_FIELDS: SIZE_FIELDS,
    getPath: getPath,
    clampNum: clampNum,
    CHOICE_LAYOUTS: CHOICE_LAYOUTS,
    CHOICE_SHAPES: CHOICE_SHAPES,
    CHOICE_ALIGNS: CHOICE_ALIGNS,
    CHOICE_WIDTHS: CHOICE_WIDTHS,
    CHOICE_BGFITS: CHOICE_BGFITS,
    BOX_STYLES: BOX_STYLES,
    SKIN_SLOTS: SKIN_SLOTS,
    SKIN_FITS: SKIN_FITS,
    BUBBLE_ANIMS: BUBBLE_ANIMS,
    newBubble: newBubble,
    bubblesAt: bubblesAt,
    defaultUI: defaultUI,
    ensureUI: ensureUI,
    defaultCodex: defaultCodex,
    newCodexGroup: newCodexGroup,
    newCodexEntry: newCodexEntry,
    ensureCodex: ensureCodex,
    codexGroups: codexGroups,
    codexEntriesOf: codexEntriesOf,
    codexEntryVisible: codexEntryVisible,
    statusVars: statusVars,
    effectiveChoiceLayout: effectiveChoiceLayout,
    codexMenu: codexMenu,
    varDisplay: varDisplay,
    EASES: EASES,
    STAGE_DEFAULTS: STAGE_DEFAULTS,
    PRESETS: PRESETS,
    emptyStage: emptyStage,
    newActor: newActor,
    newKey: newKey,
    ensureStage: ensureStage,
    getActor: getActor,
    getTrack: getTrack,
    sortTrack: sortTrack,
    applyEase: applyEase,
    lerp: lerp,
    keyProps: keyProps,
    lerpKey: lerpKey,
    trackPropsAt: trackPropsAt,
    stageAt: stageAt,
    stageDuration: stageDuration,
    actorHasStage: actorHasStage,
    newFace: newFace,
    newCharacter: newCharacter,
    characterUsage: characterUsage,
    charactersOf: charactersOf,
    findCharacter: findCharacter,
    findCharacterByName: findCharacterByName,
    resolveActor: resolveActor,
    characterFaceImage: characterFaceImage,
    characterFaceNames: characterFaceNames,
    liftCharacters: liftCharacters,
    actorFaceImage: actorFaceImage,
    actorFaceNames: actorFaceNames,
    actorImageKey: actorImageKey,
    buildPreset: buildPreset,
    presetLabel: presetLabel,
    assetSize: assetSize,
    ORIENTATIONS: ORIENTATIONS,
    assetList: assetList,
    assetsOfType: assetsOfType,
    assetUsage: assetUsage,
    validate: validate,
    stats: stats,
    normalize: normalize,
    touch: touch,
    escapeHtml: escapeHtml,
    formatBytes: formatBytes,
    safeFileName: safeFileName
  };

  root.WY = WY;
  if (typeof module !== 'undefined' && module.exports) module.exports = WY;
})(typeof globalThis !== 'undefined' ? globalThis : this);
