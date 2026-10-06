/* ============================================================
   rb-wordexport.js · 错词导出（统一 TXT 生成）
   Reborn新生留学

   导出内容：单词 + 音标 + 词性 + 中文释义 + 学生错答
   数据来源：优先查词表拿释义 → 其次用记录里的错答 → 都缺才只给音标

   依赖：rb-lexicon.js（音标查询）

   用法：RBWordExport.makeTXT(entries, meta) → Promise<string>
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 词表索引：把三份词表合并成 单词 → {meaning, pos, src} ---------- */
  var INDEX = null;

  function buildIndex() {
    if (INDEX) return INDEX;
    INDEX = {};

    function addFrom(dict, tag) {
      if (!dict) return;
      Object.keys(dict).forEach(function (uid) {
        var unit = dict[uid] || {};
        var words = unit.words || [];
        words.forEach(function (w) {
          if (!w || !w.word) return;
          var key = String(w.word).trim().toLowerCase();
          if (!key) return;
          // 先注册的不覆盖（优先 vocabulary.js 的主词表）
          if (INDEX[key]) return;
          INDEX[key] = {
            word: w.word,
            meaning: w.meaning || w.ch || '',
            pos: w.pos || '',
            src: tag,
            unit: (unit.id || uid) + ' ' + (unit.name || '')
          };
        });
      });
    }

    addFrom(global.VOCABULARY_DATA, '主词表');
    addFrom(global.VOCABULARY_4K, '4000+必刷词');

    // 538 核心词汇：数组结构 {en, ch, pos, mainCategory, subCategory}
    var v538 = global.vocabData || global.VOCAB_538;
    if (Array.isArray(v538)) {
      v538.forEach(function (w) {
        if (!w || !w.en) return;
        var key = String(w.en).trim().toLowerCase();
        if (!key || INDEX[key]) return;
        INDEX[key] = {
          word: w.en,
          meaning: w.ch || '',
          pos: w.pos || '',
          src: '538核心词汇',
          unit: (w.mainCategory || '') + (w.subCategory ? ' · ' + w.subCategory : '')
        };
      });
    } else if (v538 && typeof v538 === 'object') {
      addFrom(v538, '538核心词汇');
    }

    return INDEX;
  }

  /** 查一个词的全部信息 */
  function lookup(word) {
    var idx = buildIndex();
    var key = String(word || '').trim().toLowerCase();
    return idx[key] || null;
  }

  /** 索引里有多少词 */
  function indexSize() {
    return Object.keys(buildIndex()).length;
  }

  /** 手动登记一个词（页面里已有释义但不在主词表时用） */
  function register(word, meaning, pos, unit) {
    var idx = buildIndex();
    var key = String(word || '').trim().toLowerCase();
    if (!key) return;
    if (!idx[key]) {
      idx[key] = { word: word, meaning: meaning || '', pos: pos || '', src: '本页', unit: unit || '' };
    } else {
      if (meaning && !idx[key].meaning) idx[key].meaning = meaning;
      if (pos && !idx[key].pos) idx[key].pos = pos;
    }
  }

  /* ---------- 核心：生成 TXT ---------- */

  /**
   * @param {Array} entries 错词数组
   *        每项可以是：
   *          { word, user, meaning?, pos?, count? }   完整
   *        或 { word, count? }                         简化（从词表补释义）
   * @param {Object} meta  { student, date, module, title }
   * @returns {Promise<string>} TXT 全文
   */
  function makeTXT(entries, meta) {
    meta = meta || {};
    entries = entries || [];

    // 清洗 + 去重（同词合并，累加错误次数）
    var map = {};
    var order = [];
    entries.forEach(function (e) {
      if (!e) return;
      var w = String(e.word || '').trim();
      if (!w) return;
      // 跳过「未答」标记里的括号后缀
      var clean = w.replace(/\(未答\)$/, '').trim();
      if (!clean) return;
      var key = clean.toLowerCase();
      if (!map[key]) {
        map[key] = { word: clean, wrong: [], count: 0, meaning: e.meaning || '', pos: e.pos || '' };
        order.push(key);
      }
      map[key].count += (e.count || 1);
      if (e.user && map[key].wrong.indexOf(e.user) < 0) map[key].wrong.push(e.user);
      if (e.meaning && !map[key].meaning) map[key].meaning = e.meaning;
      if (e.pos && !map[key].pos) map[key].pos = e.pos;
    });

    var list = order.map(function (k) { return map[k]; });
    if (!list.length) return Promise.resolve('');

    // 逐词查音标
    var lex = global.RBLexicon;
    var promise = lex
      ? lex.getBatch(list.map(function (x) { return x.word; }))
      : Promise.resolve(list.map(function (x) { return { word: x.word, phonetic: '', pos: x.pos, from: 'none' }; }));

    return promise.then(function (infos) {
      var infoMap = {};
      infos.forEach(function (i) { infoMap[String(i.word).toLowerCase()] = i; });

      var L = [];
      var stamp = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };

      L.push('════════════════════════════════════════');
      L.push('错词记录' + (meta.title ? '· ' + meta.title : ''));
      L.push('════════════════════════════════════════');
      if (meta.student) L.push('学生：' + meta.student);
      if (meta.date)    L.push('日期：' + meta.date);
      if (meta.module)  L.push('模块：' + meta.module);
      L.push('导出时间：' + stamp.getFullYear() + '-' + pad(stamp.getMonth() + 1) + '-' + pad(stamp.getDate()) +
             ' ' + pad(stamp.getHours()) + ':' + pad(stamp.getMinutes()));
      L.push('错词总数：' + list.length + ' 个');
      L.push('');

      // 表头
      L.push('┌─ 英汉对照（含音标 · 词性）────────────────────');
      L.push('');

      list.forEach(function (item, i) {
        var info = infoMap[item.word.toLowerCase()] || { phonetic: '', pos: item.pos };
        var fromTable = lookup(item.word);
        var meaning = item.meaning || (fromTable ? fromTable.meaning : '');
        var pos = info.pos || item.pos || (fromTable ? fromTable.pos : '');
        var phonetic = info.phonetic || '';

        // 序号 + 单词
        var head = (i + 1) + '. ' + item.word;
        L.push(head);
        // 音标 + 词性
        var meta2 = [];
        if (phonetic) meta2.push(phonetic);
        if (pos) meta2.push(pos);
        if (meta2.length) L.push('   ' + meta2.join('  '));
        // 释义
        if (meaning) L.push('   ' + meaning);
        // 闪卡信息
        if (fromTable) {
          L.push('   来源：' + fromTable.src + (fromTable.unit ? ' · ' + fromTable.unit : ''));
        }
        // 错答
        if (item.wrong.length) {
          L.push('   错答：' + item.wrong.join('；'));
        }
        if (item.count > 1) {
          L.push('   错误次数：' + item.count + ' 次');
        }
        L.push('');
      });

      L.push('└──────────────────────────────────────────────');
      L.push('');
      L.push('【统计】');
      var multi = list.filter(function (x) { return x.count > 1; });
      L.push('  错词合计：' + list.length + ' 个');
      L.push('  反复错（≥2次）：' + multi.length + ' 个' +
             (multi.length ? '（' + multi.map(function (x) { return x.word; }).join('、') + '）' : ''));
      L.push('');
      L.push('— Reborn新生留学 · 天天进步，每日新生');
      return L.join('\n');
    });
  }

  /* ---------- 触发下载 ---------- */
  function download(txt, filename) {
    var blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || ('错词记录_' + Date.now() + '.txt');
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /** 一键：生成 + 下载 */
  function exportTXT(entries, meta) {
    return makeTXT(entries, meta).then(function (txt) {
      if (!txt) return false;
      var name = '错词记录';
      if (meta && meta.student) name += '_' + meta.student;
      if (meta && meta.date) name += '_' + meta.date;
      download(txt, name + '.txt');
      return true;
    });
  }

  global.RBWordExport = {
    makeTXT: makeTXT,
    export: exportTXT,
    download: download,
    lookup: lookup,
    register: register,
    indexSize: indexSize
  };
})(window);
