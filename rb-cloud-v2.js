/* ============================================================
   rb-cloud.js · 云端数据访问层（统一封装）
   Reborn新生留学

   本应用自己的云服务，四个表：
     practice_logs  练习记录（各练习页自动写入）
     students       学生名单
     homework       作业打卡（学生提交 / 老师评语）
     share_links    家长只读分享链接

   用法：先引 SDK，再引本文件，然后 RBCloud.<方法>
   ============================================================ */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://homework-checkin-70500.app.workbuddy.host';
  var KEY = 'wbpk_325IYB8GtzBwhF8xHc8JJB_feev6L4HzrliZFD6MAlHaVk1IWE6stvH';
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';

  var _cloud = null;
  var _loading = null;

  function loadSDK() {
    if (global.WorkBuddyCloud) return Promise.resolve(global.WorkBuddyCloud);
    if (_loading) return _loading;
    _loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = function () { resolve(global.WorkBuddyCloud); };
      s.onerror = function () { reject(new Error('SDK 加载失败，请检查网络')); };
      document.head.appendChild(s);
    });
    return _loading;
  }

  function get() {
    if (!ENDPOINT || !KEY) return Promise.reject(new Error('当前站点未启用云端'));
    if (_cloud) return Promise.resolve(_cloud);
    return loadSDK().then(function (sdk) {
      // 必须 createWorkBuddyCloud 拿实例，不能直接把命名空间当客户端
      _cloud = sdk.createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: KEY });
      return _cloud;
    });
  }

  /* ------------------------------------------------------------
     统一查询入口：所有读操作都走这里。
     踩坑记录：链式写法在不同调用路径下会偶发返回空数组，
     所以统一改成「构建 → 一次 await → 取 data」，行为可预期。
     ------------------------------------------------------------ */
  function query(table, build) {
    return get().then(function (c) {
      var t = c.database.from(table);
      var b = (typeof build === 'function') ? build(t) : t.select('*');
      return Promise.resolve(b);
    }).then(function (res) {
      if (res && res.error) throw new Error(res.error.message || '数据库请求失败');
      var data = (res && res.data) || [];
      return Array.isArray(data) ? data : [];
    });
  }

  function unwrap(res) {
    if (res && res.error) throw new Error(res.error.message || '数据库请求失败');
    var data = (res && res.data) || [];
    return Array.isArray(data) ? data : [];
  }

  /* ------------------------------------------------------------
     ⚠️ SDK 写操作返回的是 Promise，不是可链式的查询对象。
     所以 insert / update / delete 之后不能再 .select()，
     必须先 await 拿到结果。需要返回新行时按 id 再查一次。
     ------------------------------------------------------------ */
  function write(res) {
    return Promise.resolve(res).then(function (r) {
      if (r && r.error) throw new Error(r.error.message || '写入失败');
      return (r && r.data) || [];
    });
  }

  /** 写入后按条件回查，拿到真实落库的行（含数据库生成的 id） */
  function reread(table, match) {
    return query(table, function (t) {
      var b = t.select('*');
      Object.keys(match).forEach(function (k) { b = b.eq(k, match[k]); });
      return b.order('id', { ascending: false }).limit(1);
    }).then(function (rows) { return rows; });
  }

  // ==================== 练习记录 ====================
  var PracticeLogs = {
    add: function (row) {
      return get().then(function (c) {
        return write(c.database.from('practice_logs').insert({
          student_name: row.student_name, record_date: row.record_date,
          module: row.module, detail: row.detail || '',
          score_text: row.score_text || '',
          wrong_items: row.wrong_items || '[]', extra: row.extra || '{}'
        }));
      });
    },
    list: function (opts) {
      opts = opts || {};
      return query('practice_logs', function (t) {
        var b = t.select('*');
        if (opts.name) b = b.eq('student_name', opts.name);
        else if (opts.allNames !== true) b = b.eq('student_name', (global.RBIdentity && global.RBIdentity.getName()) || '__none__');
        if (opts.start) b = b.gte('record_date', opts.start);
        if (opts.end) b = b.lte('record_date', opts.end);
        return b.order('record_date', { ascending: false }).order('id', { ascending: false }).limit(opts.limit || 500);
      });
    },
    names: function () {
      return query('practice_logs', function (t) {
        return t.select('student_name').limit(500);
      }).then(function (rows) {
        var m = {};
        rows.forEach(function (r) { if (r.student_name) m[r.student_name] = 1; });
        return Object.keys(m);
      });
    },
    remove: function (id) {
      return get().then(function (c) { return write(c.database.from('practice_logs').delete().eq('id', id)); });
    }
  };

  // ==================== 学生名单 ====================
  var Students = {
    list: function () {
      return query('students', function (t) {
        return t.select('*').order('id', { ascending: true });
      });
    },
    add: function (name) {
      return get().then(function (c) { return write(c.database.from('students').insert({ name: name })); })
        .then(function () { return reread('students', { name: name }); });
    },
    addMany: function (names) {
      return get().then(function (c) {
        return write(c.database.from('students').insert(names.map(function (n) { return { name: n }; })));
      }).then(function () {
        return query('students', function (t) {
          return t.select('*').order('id', { ascending: false }).limit(names.length);
        });
      });
    },
    remove: function (id) {
      return get().then(function (c) { return write(c.database.from('students').delete().eq('id', id)); });
    }
  };

  // ==================== 作业打卡 ====================
  var Homework = {
    /** 全部作业（老师端用，条数不多） */
    all: function () {
      return query('homework', function (t) {
        return t.select('*').order('record_date', { ascending: false }).order('id', { ascending: false }).limit(1000);
      });
    },
    /** 某学生某天的全部科目 */
    forDay: function (name, date) {
      return query('homework', function (t) {
        return t.select('*').eq('student_name', name).eq('record_date', date).order('id');
      });
    },
    /** 某学生日期段全部 */
    forRange: function (name, start, end) {
      return query('homework', function (t) {
        return t.select('*').eq('student_name', name)
          .gte('record_date', start).lte('record_date', end).order('record_date');
      });
    },
    /** 保存（同一天同一科目覆盖，不叠加） */
    save: function (row) {
      var payload = {
        text_content: row.text_content || '',
        images: row.images || null,
        updated_at: new Date().toISOString()
      };
      if (row.teacher_comment !== undefined) payload.teacher_comment = row.teacher_comment;
      if (row.comment_submitted !== undefined) payload.comment_submitted = !!row.comment_submitted;

      var match = {
        student_name: row.student_name, record_date: row.record_date, subject: row.subject
      };
      return query('homework', function (t) {
        return t.select('*').eq('student_name', match.student_name)
          .eq('record_date', match.record_date).eq('subject', match.subject).limit(1);
      }).then(function (exist) {
        if (exist.length) {
          var id = exist[0].id;
          return get().then(function (c) {
            return write(c.database.from('homework').update(payload).eq('id', id));
          }).then(function () { return reread('homework', { id: id }); });
        }
        var ins = {
          student_name: match.student_name, record_date: match.record_date,
          subject: match.subject, text_content: row.text_content || '',
          images: row.images || null,
          teacher_comment: row.teacher_comment || null,
          comment_submitted: !!row.comment_submitted
        };
        return get().then(function (c) {
          return write(c.database.from('homework').insert(ins));
        }).then(function () { return reread('homework', match); });
      });
    },
    /** 老师保存评语：submit=true 提交给学生看；false 只存草稿 */
    saveComment: function (id, comment, submit) {
      return get().then(function (c) {
        return write(c.database.from('homework').update({
          teacher_comment: comment,
          comment_submitted: !!submit,
          updated_at: new Date().toISOString()
        }).eq('id', id));
      }).then(function () { return reread('homework', { id: id }); });
    },
    remove: function (id) {
      return get().then(function (c) { return write(c.database.from('homework').delete().eq('id', id)); });
    },
    removeBy: function (name, date, subject) {
      return get().then(function (c) {
        return write(c.database.from('homework').delete()
          .eq('student_name', name).eq('record_date', date).eq('subject', subject));
      });
    }
  };

  // ==================== 分享链接 ====================
  function randCode() {
    var s = '';
    var c = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 10; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  var Share = {
    create: function (name, start, end) {
      var code = randCode();
      return get().then(function (c) {
        return write(c.database.from('share_links').insert({
          code: code, student_name: name, start_day: start, end_day: end
        }));
      }).then(function () { return reread('share_links', { code: code }); });
    },
    recent: function (limit) {
      return query('share_links', function (t) {
        return t.select('*').order('id', { ascending: false }).limit(limit || 30);
      });
    },
    byCode: function (code) {
      return query('share_links', function (t) {
        return t.select('*').eq('code', code).limit(1);
      }).then(function (rows) { return rows[0] || null; });
    },
    remove: function (id) {
      return get().then(function (c) { return write(c.database.from('share_links').delete().eq('id', id)); });
    }
  };

  global.RBCloud = {
    VERSION: 'v2-20261005-1915',
    get: get,
    PracticeLogs: PracticeLogs,
    Students: Students,
    Homework: Homework,
    Share: Share
  };
})(window);
