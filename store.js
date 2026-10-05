/*!
 * 文游工坊 —— 手机上的文字冒险 / 视觉小说制作工具
 * 版权所有 (c) 2026 柳漪春涛（GitHub: khb10533）。保留所有权利。
 * 未经许可，不得复制、修改或再发布本项目的任何部分。
 */
/* ============================================================
 * 文游工坊 · 本地存储层
 * 工程本体（含图片/音频）走 IndexedDB；游玩存档走 localStorage。
 * 全程离线，不联网。
 * ============================================================ */
(function (root) {
  'use strict';

  var DB_NAME = 'wenyu-workshop';
  var DB_VER = 1;
  var STORE = 'projects';
  var PREF_KEY = 'wy.prefs.v1';
  var SAVE_PREFIX = 'wy.save.v1.';

  var dbPromise = null;

  function hasIDB() {
    try { return !!root.indexedDB; } catch (e) { return false; }
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!hasIDB()) { reject(new Error('当前浏览器不支持 IndexedDB')); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('打开数据库失败')); };
      req.onblocked = function () { reject(new Error('数据库被其它标签页占用，请关掉多余的页面')); };
    });
    return dbPromise;
  }

  function run(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.__req ? out.__req.result : out); };
        t.onerror = function () { reject(t.error || new Error('数据库写入失败')); };
        t.onabort = function () { reject(t.error || new Error('数据库操作被中止')); };
      });
    });
  }

  function req(r) { return { __req: r }; }

  var Store = {
    available: hasIDB,

    /** 保存（新增或覆盖）整个工程 */
    put: function (project) {
      return run('readwrite', function (s) { return req(s.put(project)); }).then(function () { return project; });
    },

    get: function (id) {
      return run('readonly', function (s) { return req(s.get(id)); });
    },

    del: function (id) {
      return run('readwrite', function (s) { return req(s.delete(id)); });
    },

    all: function () {
      return run('readonly', function (s) { return req(s.getAll()); }).then(function (list) {
        list = list || [];
        list.sort(function (a, b) {
          return String(b.meta && b.meta.updatedAt || '').localeCompare(String(a.meta && a.meta.updatedAt || ''));
        });
        return list;
      });
    },

    /** 只取摘要，列表页用，避免把图片数据全读进内存 */
    summaries: function () {
      return Store.all().then(function (list) {
        return list.map(function (p) {
          var st = root.WY.stats(p);
          return {
            id: p.id,
            title: (p.meta && p.meta.title) || '未命名',
            author: (p.meta && p.meta.author) || '',
            updatedAt: (p.meta && p.meta.updatedAt) || '',
            cover: (p.meta && p.meta.cover) || null,
            stats: st
          };
        });
      });
    },

    count: function () {
      return run('readonly', function (s) { return req(s.count()); });
    },

    usage: function () {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().catch(function () { return null; });
    },

    /* ---------------- 偏好设置 ---------------- */

    prefs: function () {
      try { return JSON.parse(root.localStorage.getItem(PREF_KEY) || '{}') || {}; }
      catch (e) { return {}; }
    },

    setPrefs: function (patch) {
      var p = Store.prefs();
      root.WY.assign(p, patch);
      try { root.localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {}
      return p;
    },

    /* ---------------- 游玩存档 ---------------- */

    saveKey: function (projectId, slot) { return SAVE_PREFIX + projectId + '.' + slot; },

    listSaves: function (projectId) {
      var out = {};
      for (var i = 0; i <= 3; i++) {
        var slot = i === 0 ? 'auto' : String(i);
        try {
          var raw = root.localStorage.getItem(Store.saveKey(projectId, slot));
          out[slot] = raw ? JSON.parse(raw) : null;
        } catch (e) { out[slot] = null; }
      }
      return out;
    },

    putSave: function (projectId, slot, data) {
      try {
        root.localStorage.setItem(Store.saveKey(projectId, slot), JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },

    dropSave: function (projectId, slot) {
      try { root.localStorage.removeItem(Store.saveKey(projectId, slot)); } catch (e) {}
    },

    clearSaves: function (projectId) {
      for (var i = 0; i <= 3; i++) Store.dropSave(projectId, i === 0 ? 'auto' : String(i));
    }
  };

  root.WYStore = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
