/* ============================================================
   practice-sync.js · 练习记录同步（共用模块 v2）
   Reborn新生留学

   各练习页练完 → 自动把「练了什么 / 正确率 / 错在哪 / 第几轮」
   写进云端 practice_logs，作业打卡系统按日期自动带出。

   用法：练习页 </body> 前引入
     <script src="rb-identity.js"></script>
     <script src="practice-sync.js"></script>

     PracticeSync.log('词汇', {
       topic: '1-1-1 食材食物酒水饮料',   // 练的是什么（用于分项统计）
       subType: '听力默写',                // 题型
       scoreText: '正确 18 / 25（72%）',
       correct: 18, total: 25,
       wrongItems: ['sustainable','allocate'],
       extra: { 单元数: 2, 抽词数: 25 }
     });

   姓名：统一走 rb-identity.js，全站只填一次。
   ============================================================ */
(function (global) {
  'use strict';

  // 本应用自己的云服务（同源，不会被跨域拦）
  // 旧站（GitHub Pages）跨域受限，改用同源相对路径；失败时自动降级为仅本地
  var ENDPOINT = '';
  var KEY = '';
  var LS_KEY = 'rb_practice_log_v2';

  var _cloud = null;
  var _ready = false;

  function pad(n) { return String(n).padStart(2, '0'); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function getName() {
    if (global.RBIdentity && global.RBIdentity.getName) return global.RBIdentity.getName();
    try { return localStorage.getItem('rb_student_name') || ''; } catch (e) { return ''; }
  }

  // ---------- 本地暂存（云端失败兜底 + 作业页同源读取） ----------
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLocal(rows) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-500))); } catch (e) {}
  }

  // ---------- 云端读取：跨设备同步（学生在手机练，老师在电脑看） ----------
  var _fetched = false;

  function fromCloud(opts) {
    opts = opts || {};
    return ensureCloud().then(function (c) {
      var q = c.database.from('practice_logs').select('*');
      // allNames=true 时不按姓名过滤（老师端「留空 = 全部学生」用）
      var who = opts.allNames ? '' : (opts.name || getName());
      if (who) q = q.eq('student_name', who);
      if (opts.start) q = q.gte('record_date', opts.start);
      if (opts.end) q = q.lte('record_date', opts.end);
      return q;
    }).then(function (res) {
      if (!res || res.error) throw new Error((res && res.error && res.error.message) || '查询失败');
      var data = (res && res.data) || [];
      // 云端行 → 本地结构
      return data.map(function (r) {
        return {
          id: r.id,
          student_name: r.student_name,
          record_date: r.record_date,
          module: r.module,
          detail: r.detail || '',
          score_text: r.score_text || '',
          wrong_items: r.wrong_items || '[]',
          extra: r.extra || '{}',
          topic: readExtra(r.extra, '话题') || (r.detail || ''),
          round: readExtra(r.extra, '轮次') || 0,
          fromCloud: true
        };
      });
    });
  }

  /**
   * 删除一条自动练习记录（学生端用）
   * 优先按 id 精确删；没有 id 时按「姓名+日期+模块+内容」兜底删一条。
   * 失败不抛错——本地已标记删除，云端同步失败不影响当次操作。
   */
  function deleteLog(idOrRow) {
    var row = idOrRow;
    if (row && typeof row === 'object') {
      if (row.id) return deleteCloudById(row.id);
      return deleteCloudByContent(
        row.student_name, row.record_date, row.module, row.detail || row.topic);
    }
    return deleteCloudById(row);
  }

  function deleteCloudById(id) {
    return ensureCloud().then(function (c) {
      return c.database.from('practice_logs').delete().eq('id', id);
    }).then(function (res) {
      if (res && res.error) throw new Error(res.error.message);
      return { ok: true };
    }).catch(function (e) {
      console.warn('[PracticeSync] 云端删除失败（本地已删除）：', e && e.message);
      return { ok: false };
    });
  }

  function deleteCloudByContent(name, date, module, detail) {
    if (!name || !date || !module) return Promise.resolve({ ok: false });
    return ensureCloud().then(function (c) {
      return c.database.from('practice_logs').delete()
        .eq('student_name', name).eq('record_date', date)
        .eq('module', module).eq('detail', detail || '');
    }).then(function (res) {
      if (res && res.error) throw new Error(res.error.message);
      return { ok: true };
    }).catch(function (e) {
      console.warn('[PracticeSync] 云端删除失败（本地已删除）：', e && e.message);
      return { ok: false };
    });
  }

  // 拉取云端并与本地合并（按 student+date+module+detail+round 去重）
  function syncFromCloud(opts) {
    return fromCloud(opts).then(function (cloudRows) {
      var local = readLocal();
      var seen = {};
      local.forEach(function (r) { seen[dedupKey(r)] = true; });
      var merged = local.slice();
      cloudRows.forEach(function (r) {
        var k = dedupKey(r);
        if (seen[k]) return;
        seen[k] = true;
        merged.push(r);
      });
      merged.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      writeLocal(merged);
      _fetched = true;
      return merged;
    });
  }

  function dedupKey(r) {
    return [r.student_name, r.record_date, r.module, r.detail, r.score_text].join('|');
  }

  function readExtra(s, k) {
    try { var o = JSON.parse(s || '{}'); return o && o[k] !== undefined ? o[k] : ''; }
    catch (e) { return ''; }
  }

  // 作业页入口：先渲染本地，再异步拉云端补齐
  function refresh(opts) {
    return syncFromCloud(opts).catch(function (e) {
      console.warn('[PracticeSync] 云端拉取失败，仅显示本地记录：', e && e.message);
      return readLocal();
    });
  }

  // ---------- 云端 SDK（懒加载，全站共享一份） ----------
  function makeClient() {
    // 未配置云端（如GitHub Pages 跨域受限）→ 直接返回空，
    // 后续所有云端调用都会静默失败并降级为「仅本地」，不影响练习功能
    if (!ENDPOINT || !KEY) return null;
    return global.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: ENDPOINT, publishableKey: KEY
    });
  }

  function ensureCloud() {
    if (!ENDPOINT || !KEY) return Promise.reject(new Error('当前站点未启用云端，仅本地记录'));
    if (_ready && _cloud) return Promise.resolve(_cloud);
    return new Promise(function (resolve, reject) {
      // ⚠️ window 上已有 SDK 时也必须 createWorkBuddyCloud 拿客户端实例，
       // 直接把命名空间对象返回会导致后续 .database.from() 取不到数据。
      if (global.WorkBuddyCloud) {
        try {
          _cloud = makeClient();
          _ready = true;
          resolve(_cloud);
        } catch (e) { reject(e); }
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
      s.onload = function () {
        try {
          _cloud = makeClient();
          _ready = true;
          resolve(_cloud);
        } catch (e) { reject(e); }
      };
      s.onerror = function () { reject(new Error('SDK 加载失败')); };
      document.head.appendChild(s);
    });
  }

  // ---------- 轮次：同一模块+同一内容，第几次练 ----------
  function bumpRound(module, topic) {
    var key = 'rb_round_' + module + '_' + String(topic || 'all');
    var n = 0;
    try { n = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) {}
    n += 1;
    try { localStorage.setItem(key, String(n)); } catch (e) {}
    return n;
  }
  function getRound(module, topic) {
    var key = 'rb_round_' + module + '_' + String(topic || 'all');
    try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; }
  }

  // ---------- 核心：写一条记录 ----------
  function log(module, data) {
    data = data || {};
    var who = getName();
    var ensureFn = (global.RBIdentity && global.RBIdentity.ensure)
      ? global.RBIdentity.ensure.bind(global.RBIdentity)
      : function () { return Promise.resolve(''); };

    return ensureFn().then(function (name) {
      var date = data.date || today();
      var topic = data.topic || '';
      var round = bumpRound(module, topic || 'all');

      var wrong = data.wrongItems || [];
      var extra = data.extra || {};
      extra.题型 = data.subType || extra.题型 || '';
      extra.轮次 = round;
      extra.记录时间 = nowTime();
      if (data.correct !== undefined) extra.正确 = data.correct;
      if (data.total !== undefined) extra.总数 = data.total;

      var row = {
        student_name: name || '未署名',
        record_date: date,
        module: module,
        detail: data.detail || topic,
        score_text: data.scoreText || '',
        wrong_items: JSON.stringify(wrong),
        extra: JSON.stringify(extra),
        topic: topic,
        round: round,
        ts: Date.now()
      };

      // 本地
      var rows = readLocal();
      rows.push(row);
      writeLocal(rows);

      if (!name) {
        console.warn('[PracticeSync] 未填姓名，记录仅存本地');
        return { localOnly: true };
      }
      return push(row).catch(function (e) {
        console.warn('[PracticeSync] 云端写入失败，已存本地：', e && e.message);
        return { localOnly: true };
      });
    });
  }

  function push(row) {
    return ensureCloud().then(function (c) {
      return c.database.from('practice_logs').insert({
        student_name: row.student_name,
        record_date: row.record_date,
        module: row.module,
        detail: row.detail,
        score_text: row.score_text,
        wrong_items: row.wrong_items,
        extra: row.extra
      });
    }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message);
      return r;
    });
  }

  // ---------- 覆盖式记录 ----------
  // 场景：口语今天练了多个小题，每次新录音都要把「当天汇总」整体更新，
  // 而不是不断追加流水账。做法：先删掉同一天+同一模块的旧记录，再写入新的。
  function logReplace(module, data) {
    data = data || {};
    // slot：同一模块下的分类槽位。用于同一模块内多种练习并存
    // （例如「自主练习」和「题库刷题」都属module='口语'，不能互相覆盖）。
    var slot = data.slot || '';
    var who = getName();
    var ensureFn = (global.RBIdentity && global.RBIdentity.ensure)
      ? global.RBIdentity.ensure.bind(global.RBIdentity)
      : function () { return Promise.resolve(''); };

    return ensureFn().then(function (name) {
      var date = data.date || today();
      var round = bumpRound(module, slot || 'summary');
      var extra = data.extra || {};
      extra.题型 = data.subType || extra.题型 || '';
      extra.轮次 = round;
      extra.记录时间 = nowTime();
      if (data.correct !== undefined) extra.正确 = data.correct;
      if (data.total !== undefined) extra.总数 = data.total;

      var row = {
        student_name: name || '未署名',
        record_date: date,
        module: module,
        detail: data.detail || data.topic || '',
        score_text: data.scoreText || '',
        wrong_items: JSON.stringify(data.wrongItems || []),
        extra: JSON.stringify(extra),
        topic: data.topic || '',
        round: round,
        slot: slot,
        ts: Date.now()
      };

      // 本地：同天 + 同模块 + 同槽位 只保留最新一条
      var rows = readLocal().filter(function (r) {
        return !(r.record_date === row.record_date && r.module === module &&
                 (r.slot || '') === slot);
      });
      rows.push(row);
      writeLocal(rows);

      if (!name) {
        console.warn('[PracticeSync] 未填姓名，记录仅存本地');
        return { localOnly: true };
      }
      // 云端：先删同天 + 同模块 + 同槽位 的旧记录，再插入。
      // 槽位为空时退化为「同天同模块全删」，保持旧调用方行为不变。
      return ensureCloud().then(function (c) {
        var q = c.database.from('practice_logs').delete()
          .eq('student_name', row.student_name)
          .eq('record_date', row.record_date)
          .eq('module', module);
        if (slot) q = q.eq('slot', slot);
        else q = q.is('slot', null);
        return q.then(function (del) {
          if (del && del.error) throw new Error(del.error.message);
          return push(row);
        });
      }).catch(function (e) {
        console.warn('[PracticeSync] 覆盖写入失败，已存本地：', e && e.message);
        return { localOnly: true };
      });
    });
  }

  // ---------- 查询：按日期取当天全部记录 ----------
  function logsForDate(date) {
    return readLocal().filter(function (r) { return r.record_date === date; });
  }

  function logsForRange(start, end) {
    return readLocal().filter(function (r) {
      return r.record_date >= start && r.record_date <= end;
    });
  }

  // ---------- 分项统计：同一 topic 练过几次、每次成绩如何 ----------
  function topicStats(module) {
    var map = {};
    readLocal().forEach(function (r) {
      if (module && r.module !== module) return;
      var key = r.topic || r.detail || '(未命名)';
      if (!map[key]) {
        map[key] = { topic: key, module: r.module, times: 0, rounds: [], scores: [], wrongs: {}, lastDate: '' };
      }
      var s = map[key];
      s.times += 1;
      s.rounds.push({
        date: r.record_date,
        round: r.round || s.times,
        score: r.score_text || '',
        correct: readJSON(r.extra, '正确'),
        total: readJSON(r.extra, '总数'),
        wrong: parseJSON(r.wrong_items) || []
      });
      if (r.record_date > s.lastDate) s.lastDate = r.record_date;
      (parseJSON(r.wrong_items) || []).forEach(function (w) {
        if (w) s.wrongs[w] = (s.wrongs[w] || 0) + 1;
      });
    });
    return map;
  }

  // ---------- 错词累计（反复错的排前面） ----------
  function wrongHistory(module) {
    var map = {};
    readLocal().forEach(function (r) {
      if (module && r.module !== module) return;
      (parseJSON(r.wrong_items) || []).forEach(function (w) {
        if (!w) return;
        if (!map[w]) map[w] = { word: w, count: 0, dates: [] };
        map[w].count += 1;
        if (map[w].dates.indexOf(r.record_date) < 0) map[w].dates.push(r.record_date);
      });
    });
    return map;
  }

  function parseJSON(s) {
    if (!s) return null;
    if (typeof s !== 'string') return s;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function readJSON(s, k) {
    var o = parseJSON(s);
    return (o && o[k] !== undefined) ? o[k] : null;
  }

  // ---------- 补传：本地有云端没写成功的 ----------
  function flushPending() {
    var who = getName();
    if (!who) return Promise.resolve(0);
    // 本地记录全部视为已尝试同步；这里只重试最近 20 条做兜底
    var rows = readLocal().slice(-20);
    var n = 0, chain = Promise.resolve();
    rows.forEach(function (r) {
      chain = chain.then(function () {
        return push(r).then(function () { n++; }).catch(function () {});
      });
    });
    return chain.then(function () { return n; });
  }

  global.PracticeSync = {
    log: log,
    logReplace: logReplace,
    logsForDate: logsForDate,
    logsForRange: logsForRange,
    topicStats: topicStats,
    wrongHistory: wrongHistory,
    getRound: getRound,
    readLocal: readLocal,
    deleteLog: deleteLog,
    flushPending: flushPending,
    getName: getName,
    today: today,
    parseJSON: parseJSON,
    refresh: refresh,
    syncFromCloud: syncFromCloud,
    fromCloud: fromCloud
  };
})(window);
