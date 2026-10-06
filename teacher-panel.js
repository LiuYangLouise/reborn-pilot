/* ============================================================
   teacher-panel.js · 老师端面板（独立模块）
   Reborn新生留学
   入口：main.html 登录卡片下方的小字「查看教师端」
   口令：reborn2016（页面不向学生提示）
   数据：rb-cloud.js → practice_logs / students / homework / share_links
   ============================================================ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { return new Date(s + 'T00:00:00'); }
  var WD = ['日','一','二','三','四','五','六'];
  function fmtCN(d) { return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日 星期' + WD[d.getDay()]; }
  function mdShort(s) { var d = parseD(s); return pad(d.getMonth()+1) + '.' + pad(d.getDate()); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function ensureCloud() {
    if (global.RBCloud) return Promise.resolve(global.RBCloud);
    return Promise.reject(new Error('数据模块未就绪'));
  }
  function toast(msg) {
    var t = $('tfToast');
    if (!t) { try { alert(msg); } catch (e) {} return; }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.opacity = '0'; }, 2400);
  }
  function setOffline(msg) {
    var el = $('tfOffline');
    if (el) { el.style.display = msg ? 'block' : 'none'; el.innerHTML = msg || ''; }
  }
  function localRows() {
    try { return JSON.parse(localStorage.getItem('rb_practice_log_v2') || '[]'); } catch (e) { return []; }
  }
  function groupBy(rows, key) {
    var m = {};
    rows.forEach(function (r) { var k = r[key]; (m[k] = m[k] || []).push(r); });
    return m;
  }
  function wrongOf(r) { try { var a = JSON.parse(r.wrong_items || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function imgsOf(s) { if (!s) return []; try { var a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function parseNames(s) {
    return String(s || '').split(/[,，、;；\n\r\s]+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x && x.length <= 20; });
  }

  var MODC = { 词汇:'', 听力:'ls', 阅读:'rd', 口语:'sp', 写作:'wr' };
  var SUBJECTS = ['词汇','听力','阅读','口语','写作','其他'];

  var _logs = [], _hw = [], _stu = [], _share = [];
  var _offline = false;
  var _cal = { stu: '', ym: '' };   // 打卡日历选择
  var _all = false;                 // 是否已加载全部 homework

  function allNames() {
    var m = {};
    _stu.forEach(function (s) { m[s.name] = 1; });
    _logs.forEach(function (l) { if (l.student_name) m[l.student_name] = 1; });
    _hw.forEach(function (h) { if (h.student_name) m[h.student_name] = 1; });
    _cal.stu = _cal.stu || '';
    return Object.keys(m).sort();
  }

  // ==================== 载入 ====================
  function loadAll() {
    return ensureCloud().then(function (c) {
      return Promise.all([
        c.PracticeLogs.list({ allNames: true, limit: 800 }),
        c.Homework.all(),
        c.Students.list().catch(function () { return []; }),
        c.Share.recent(30).catch(function () { return []; })
      ]);
    }).then(function (res) {
      _logs = res[0] || []; _hw = res[1] || []; _stu = res[2] || []; _share = res[3] || [];
      _offline = false; _all = true;
      setOffline('');
      if (!_cal.stu) _cal.stu = allNames()[0] || '';
      renderAll();
    }).catch(function () {
      _logs = localRows(); _hw = []; _stu = []; _share = []; _all = false; _offline = true;
      setOffline('⚠️ 云端未连接。练习记录显示<b>本机</b>数据；作业、名单、分享等功能需要云服务。');
      renderAll();
    });
  }

  // ==================== 渲染 ====================
  function renderAll() {
    renderKPIs(); renderToday(); renderRecords(); renderRoster();
    renderWrong(); renderShare(); renderCal();
  }
  function kpi(n, l, c) {
    return '<div class="tf-stat"><div class="n ' + (c||'') + '">' + n + '</div><div class="l">' + l + '</div></div>';
  }
  function renderKPIs() {
    var days = new Set(_logs.map(function (r) { return r.record_date; }));
    var today = fmtDate(new Date());
    var todayN = _logs.filter(function (r) { return r.record_date === today; }).length;
    var hwDays = new Set(_hw.map(function (r) { return r.record_date; }));
    $('tStats').innerHTML =
      kpi(allNames().length, '学生人数', '') + kpi(_logs.length, '练习次数', 'g') +
      kpi(days.size, '练习天数', 'o') + kpi(hwDays.size, '打卡天数', 'g') +
      kpi(todayN, '今日练习', todayN ? 'g' : 'r') + kpi(_stu.length, '名单人数', '');
  }

  function logLine(r) {
    var w = wrongOf(r);
    return '<div class="t-line" style="padding-left:14px;">' +
      '<span class="t-mod">[' + escapeHtml(r.module) + ']</span> ' + escapeHtml(r.detail || '') +
      (r.score_text ? ' <b>' + escapeHtml(r.score_text) + '</b>' : '') +
      (w.length ? ' <span class="t-wrong">错' + w.length + '：' + escapeHtml(w.slice(0,6).join('、')) + (w.length>6?'…':'') + '</span>' : '') +
      '</div>';
  }
  function hwLine(r) {
    var imgs = imgsOf(r.images);
    return '<div class="t-line" style="padding-left:14px;">' +
      '<span class="t-mod">【' + escapeHtml(r.subject) + '】</span> ' +
      escapeHtml((r.text_content || '').slice(0, 60) || '（无文字）') +
      (imgs.length ? ' <span class="t-wrong">' + imgs.length + '张图</span>' : '') + '</div>';
  }

  // ---------- 今日概览 ----------
  function renderToday() {
    var today = fmtDate(new Date());
    var logs = _logs.filter(function (r) { return r.record_date === today; });
    var hw = _hw.filter(function (r) { return r.record_date === today; });
    var box = $('tToday');
    if (!logs.length && !hw.length) { box.innerHTML = '<div class="empty-hint">今天还没有练习或打卡记录</div>'; return; }
    var by = {}; var hwBy = {};
    logs.forEach(function (r) { (by[r.student_name] = by[r.student_name] || []).push(r); });
    hw.forEach(function (r) { (hwBy[r.student_name] = hwBy[r.student_name] || []).push(r); });
    var names = Object.keys(by).concat(Object.keys(hwBy)).filter(function (v,i,a){return a.indexOf(v)===i;}).sort();
    var h = '<div class="tf-note">' + fmtCN(new Date()) + ' · ' + names.length + ' 位学生，练习 ' + logs.length + ' 次 / 作业 ' + hw.length + ' 条</div>';
    names.forEach(function (n) {
      h += '<div class="t-stu"><div class="t-stu-h"><div class="t-stu-n">👤 ' + escapeHtml(n) +
           '<small>' + (by[n]||[]).length + ' 次练习 · ' + (hwBy[n]||[]).length + ' 条作业</small></div></div>';
      (by[n]||[]).forEach(logLine);
      (hwBy[n]||[]).forEach(hwLine);
      h += '</div>';
    });
    box.innerHTML = h;
  }

  // ---------- 全部记录（可手动增删改） ----------
  function renderRecords() {
    var name = $('tName').value.trim();
    var s = $('tStart').value, e = $('tEnd').value;
    var ok = function (d) { return (!name || d.student_name === name) && (!s || d.record_date >= s) && (!e || d.record_date <= e); };
    var logs = _logs.filter(ok);
    var hw = _hw.filter(ok);
    var box = $('tOut');

    var h = '<div class="tf-note">共 ' + logs.length + ' 条练习、' + hw.length + ' 条作业。点「✎ 编辑」可修改内容，点「🗑」删除。</div>';
    h += '<div class="add-bar"><input type="text" id="addStu" placeholder="学生姓名" style="width:110px;">' +
         '<input type="date" id="addDate" style="width:140px;">' +
         '<select id="addSub">' + SUBJECTS.map(function(x){return '<option>'+x+'</option>';}).join('') + '</select>' +
         '<button class="btn-mini" id="addBtn">＋ 手动添加记录</button></div>';

    if (!logs.length && !hw.length) { box.innerHTML = h + '<div class="empty-hint">该条件下暂无记录</div>'; bindAdd(); return; }

    var by = {};
    logs.concat(hw).forEach(function (r) { (by[r.student_name] = by[r.student_name] || []).push(r); });
    Object.keys(by).sort().forEach(function (n) {
      var rows = by[n].slice().sort(function (a, b) {
        return a.record_date < b.record_date ? 1 : (a.record_date > b.record_date ? -1 : 0);
      });
      h += '<div class="t-stu"><div class="t-stu-h"><div class="t-stu-n">👤 ' + escapeHtml(n) +
           '<small>' + rows.length + ' 条 · ' + Object.keys(groupBy(rows,'record_date')).length + ' 天</small></div></div>';
      var byDay = groupBy(rows, 'record_date');
      Object.keys(byDay).sort().reverse().forEach(function (d) {
        h += '<div class="t-line"><span class="t-date">' + fmtCN(parseD(d)) + '</span> · ' + byDay[d].length + ' 条' +
             (d === fmtDate(new Date()) ? ' <span class="tf-chip g" style="font-size:.66rem;">今天</span>' : '') + '</div>';
        byDay[d].sort(function (a, b) { return (a.id||0) - (b.id||0); }).forEach(function (r) {
          if (r.module) {
            h += logLine(r) + '<div class="row-ops"><button class="tf-mini" data-del-log="' + r.id + '">🗑 删除</button></div>';
          } else {
            var imgs = imgsOf(r.images);
            h += '<div class="t-line hw-item" style="padding-left:14px;">' +
              '<span class="t-mod">【' + escapeHtml(r.subject) + '】</span> ' +
              '<div class="hw-text">' + escapeHtml(r.text_content || '（无文字）') + '</div>' +
              (imgs.length ? '<div class="hw-imgs">' + imgs.map(function(u){return '<img src="'+escapeHtml(u)+'" alt="">';}).join('') + '</div>' : '') +
              (r.comment_submitted && r.teacher_comment ? '<div class="cmt">💬 已提交评语：' + escapeHtml(r.teacher_comment) + '</div>' : '') +
              '<div class="row-ops"><button class="tf-mini" data-edit-hw="' + r.id + '">✎ 编辑</button>' +
              '<button class="tf-mini warn" data-del-hw="' + r.id + '">🗑 删除</button></div></div>';
          }
        });
      });
      h += '</div>';
    });
    box.innerHTML = h;
    bindAdd(); bindRowOps();
  }

  function bindRowOps() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-del-log]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('确定删除这条练习记录？')) return;
        ensureCloud().then(function (c) { return c.PracticeLogs.remove(b.dataset.delLog); })
          .then(function () { toast('已删除'); return loadAll(); })
          .catch(function (e) { toast('❌ ' + (e.message||e)); });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del-hw]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('确定删除这条作业记录？')) return;
        ensureCloud().then(function (c) { return c.Homework.remove(b.dataset.delHw); })
          .then(function () { toast('已删除'); return loadAll(); })
          .catch(function (e) { toast('❌ ' + (e.message||e)); });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-hw]'), function (b) {
      b.addEventListener('click', function () { editHw(b.dataset.editHw); });
    });
  }

  function editHw(id) {
    var row = _hw.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var v = prompt('修改「' + row.subject + '」的内容：', row.text_content || '');
    if (v === null) return;
    ensureCloud().then(function (c) {
      return c.Homework.save({ student_name: row.student_name, record_date: row.record_date, subject: row.subject, text_content: v });
    }).then(function () { toast('✅ 已保存'); return loadAll(); })
      .catch(function (e) { toast('❌ ' + (e.message||e)); });
  }

  function bindAdd() {
    var btn = $('addBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var stu = ($('addStu').value || '').trim();
      var date = $('addDate').value;
      var sub = $('addSub').value;
      if (!stu) { toast('请填学生姓名'); return; }
      if (!date) { date = fmtDate(new Date()); }
      var v = prompt('输入「' + stu + '」在 ' + date + ' 的' + sub + '内容：', '');
      if (v === null) return;
      ensureCloud().then(function (c) {
        return c.Homework.save({ student_name: stu, record_date: date, subject: sub, text_content: v });
      }).then(function () { toast('✅ 已添加'); return loadAll(); })
        .catch(function (e) { toast('❌ ' + (e.message||e)); });
    });
  }

  // ---------- 学生名单 ----------
  function renderRoster() {
    var box = $('tStu');
    var byHw = groupBy(_hw, 'student_name');
    var byLg = groupBy(_logs, 'student_name');
    var names = allNames();
    var h = '<div class="roster-bar">' +
      '<input type="text" id="rosterInput" placeholder="输入姓名，支持逗号/换行批量添加" style="flex:1;min-width:170px;">' +
      '<button class="btn-mini" id="rosterAdd">＋ 加入名单</button>' +
      '<button class="btn-mini" id="rosterImport">📥 导入名单</button></div>' +
      '<input type="file" id="rosterFile" accept=".txt,.csv,text/plain" style="display:none;">' +
      '<div class="tf-note">共 ' + names.length + ' 位学生（名单与记录合并）。点名字查看该生全部记录；🗑 仅从名单移除，不删记录。</div>';
    if (!names.length) { h += '<div class="empty-hint">还没有学生，先在上方添加</div>'; }
    else {
      h += '<div class="roster">' + names.map(function (n) {
        var cnt = byHw[n] ? byHw[n].length : 0;
        var days = byHw[n] ? Object.keys(groupBy(byHw[n], 'record_date')).length : 0;
        var lg = byLg[n] ? byLg[n].length : 0;
        var rec = _stu.filter(function (x) { return x.name === n; })[0];
        return '<div class="roster-row" data-stu="' + escapeHtml(n) + '">' +
          '<div class="roster-n">' + escapeHtml(n) + (rec ? '' : ' <span class="tf-chip" style="font-size:.62rem;">未入名单</span>') + '</div>' +
          '<div class="roster-d">练习 ' + lg + ' 次</div>' +
          '<div class="roster-m"><span class="tf-chip g">打卡 ' + cnt + ' 次</span><span class="tf-chip">' + days + ' 天</span>' +
          (rec ? '<button class="tf-del" data-del="' + rec.id + '" title="从名单移除">🗑</button>' : '') + '</div></div>';
      }).join('') + '</div>';
    }
    box.innerHTML = h;
    bindRoster();
  }
  function bindRoster() {
    var add = $('rosterAdd'), inp = $('rosterInput');
    if (add && inp) add.addEventListener('click', function () {
      var names = parseNames(inp.value);
      if (!names.length) { toast('请输入姓名'); return; }
      ensureCloud().then(function (c) { return c.Students.addMany(names); })
        .then(function () { inp.value = ''; toast('✅ 已加入 ' + names.length + ' 人'); return loadAll(); })
        .catch(function (e) { toast('❌ ' + (e.message||e)); });
    });
    var imp = $('rosterImport'), file = $('rosterFile');
    if (imp && file) {
      imp.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var names = parseNames(fr.result);
          if (!names.length) { toast('文件里没解析到姓名'); return; }
          ensureCloud().then(function (c) { return c.Students.addMany(names); })
            .then(function () { toast('✅ 已导入 ' + names.length + ' 人'); return loadAll(); })
            .catch(function (e) { toast('❌ ' + (e.message||e)); });
          file.value = '';
        };
        fr.readAsText(f, 'utf-8');
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#tStu .tf-del'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.dataset.del;
        var rec = _stu.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!confirm('确定从名单移除「' + (rec ? rec.name : '') + '」？\n（不会删除其练习和作业记录）')) return;
        ensureCloud().then(function (c) { return c.Students.remove(id); })
          .then(function () { toast('已移除'); return loadAll(); })
          .catch(function (err) { toast('❌ ' + (err.message||err)); });
      });
    });
  }

  // ---------- 高频错词 ----------
  function renderWrong() {
    var m = {};
    _logs.forEach(function (r) {
      wrongOf(r).forEach(function (w) {
        if (!w) return;
        if (!m[w]) m[w] = { w: w, n: 0, stu: {}, last: '' };
        m[w].n++; m[w].stu[r.student_name] = 1;
        if (r.record_date > m[w].last) m[w].last = r.record_date;
      });
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; });
    var box = $('tWrong');
    if (!list.length) { box.innerHTML = '<div class="empty-hint">暂无错词记录</div>'; return; }
    box.innerHTML = '<div class="tf-note">共 ' + list.length + ' 个错词（错 ≥2 次标红）</div>' +
      '<div class="wrong-grid">' + list.slice(0, 150).map(function (w) {
        return '<div class="wrong-chip' + (w.n >= 2 ? ' hot' : '') + '"><b>' + escapeHtml(w.w) + '</b>' +
          '<span>错' + w.n + '次 · ' + Object.keys(w.stu).length + '人 · ' + escapeHtml(w.last) + '</span></div>';
      }).join('') + '</div>';
  }

  // ==================== 分享打卡 ====================
  function shareUrl(code) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + 'share.html?c=' + code;
  }
  function renderShare() {
    var box = $('tShare');
    var names = allNames();
    var today = new Date();
    var defS = fmtDate(new Date(today.getTime() - 2 * 864e5));
    var defE = fmtDate(today);
    if (!$('shrStu')) {
      var opts = names.map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; }).join('');
      box.innerHTML =
        '<div class="shr-bar">' +
          '<label>学生</label><select id="shrStu">' + opts + '</select>' +
          '<label>日期</label><input type="date" id="shrS" value="' + defS + '">' +
          '<span>至</span><input type="date" id="shrE" value="' + defE + '">' +
          '<button class="btn-mini" id="shrGen">🔗 生成链接</button>' +
        '</div>' +
        '<div class="shr-preview" id="shrPrev"></div>' +
        '<div class="shr-result" id="shrRes"></div>' +
        '<div class="tf-note" style="margin-top:14px;">历史链接（最近 30 条，永久有效）</div>' +
        '<div id="shrHis"></div>';
      $('shrGen').addEventListener('click', genShare);
      ['shrStu','shrS','shrE'].forEach(function (id) {
        $(id).addEventListener('change', drawPreview);
      });
      $('shrHis').addEventListener('click', function (e) {
        var openBtn = e.target.closest('[data-open]');
        var delBtn = e.target.closest('[data-del-share]');
        var cpBtn = e.target.closest('[data-copy]');
        if (openBtn) { window.open(shareUrl(openBtn.dataset.open), '_blank'); return; }
        if (cpBtn) { copyText(shareUrl(cpBtn.dataset.copy)); return; }
        if (delBtn) {
          if (!confirm('确定删除这条分享链接？已发出去的链接会立即失效。')) return;
          ensureCloud().then(function (c) { return c.Share.remove(delBtn.dataset.delShare); })
            .then(function () { toast('已删除'); return loadAll(); })
            .catch(function (err) { toast('❌ ' + (err.message||err)); });
        }
      });
    }
    drawPreview();
    // 历史
    var his = $('shrHis');
    if (!_share.length) { his.innerHTML = '<div class="empty-hint">还没有生成过链接</div>'; }
    else {
      his.innerHTML = '<div class="his-list">' + _share.map(function (l) {
        return '<div class="his-row">' +
          '<div class="his-n">' + escapeHtml(l.student_name) +
            '<small>' + mdShort(l.start_day) + ' - ' + mdShort(l.end_day) + '</small></div>' +
          '<div class="his-ops">' +
            '<button class="tf-mini" data-open="' + l.code + '">👁 打开</button>' +
            '<button class="tf-mini" data-copy="' + l.code + '">📋 复制</button>' +
            '<button class="tf-mini warn" data-del-share="' + l.id + '">🗑</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
  }

  function shrData() {
    return { stu: $('shrStu').value, s: $('shrS').value, e: $('shrE').value };
  }
  function drawPreview() {
    if (!$('shrPrev')) return;
    var d = shrData();
    var el = $('shrPrev');
    if (!d.stu || !d.s || !d.e) { el.innerHTML = '<div class="empty-hint">请选择学生和日期段</div>'; return; }
    el.innerHTML =
      '<div class="pv-card">' +
        '<div class="pv-name">' + escapeHtml(d.stu) + '作业完成情况</div>' +
        '<div class="pv-range">' + mdShort(d.s) + ' - ' + mdShort(d.e) + '</div>' +
        '<div class="pv-hint">📷 家长扫码或点链接即可查看，只读、免登录</div>' +
      '</div>';
  }

  function genShare() {
    var d = shrData();
    if (!d.stu) { toast('请选择学生'); return; }
    if (d.s > d.e) { toast('开始日期不能晚于结束日期'); return; }
    ensureCloud().then(function (c) { return c.Share.create(d.stu, d.s, d.e); })
      .then(function (rows) {
        var link = rows[0];
        var url = shareUrl(link.code);
        $('shrRes').innerHTML =
          '<div class="gen-box">' +
            '<div class="gen-ok">✅ 链接已生成</div>' +
            '<div class="gen-url">' + escapeHtml(url) + '</div>' +
            '<div class="gen-btns">' +
              '<button class="btn-mini" id="shrCopy">📋 复制链接</button>' +
              '<button class="btn-mini" id="shrOpen">👁 打开预览</button>' +
              '<button class="btn-mini" id="shrQr">📱 显示二维码</button>' +
            '</div>' +
            '<div id="shrQrBox" style="margin-top:12px;"></div>' +
          '</div>';
        $('shrCopy').addEventListener('click', function () { copyText(url); });
        $('shrOpen').addEventListener('click', function () { window.open(url, '_blank'); });
        $('shrQr').addEventListener('click', function () { showQr($('shrQrBox'), url); });
        toast('✅ 已生成');
        return loadAll();
      })
      .catch(function (e) { toast('❌ ' + (e.message||e)); });
  }

  // 复制双保险：优先剪贴板接口，失败降级 execCommand
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? '✅ 已复制' : '复制失败，请手动选中复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('✅ 已复制'); }, fallback);
    } else { fallback(); }
  }

  // 二维码：用在线图片接口，不引第三方 JS
  function showQr(box, url) {
    if (!box) return;
    var img = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=' + encodeURIComponent(url);
    box.innerHTML = '<div class="qr-box"><img src="' + img + '" alt="二维码" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';">' +
      '<div class="qr-fallback" style="display:none;">二维码生成失败，请直接复制链接发给家长</div></div>';
  }

  // ==================== 打卡日历 ====================
  function renderCal() {
    var box = $('tCal');
    if (!$('calStu')) {
      var opts = allNames().map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; }).join('');
      var now = new Date();
      var ym = now.getFullYear() + '-' + pad(now.getMonth() + 1);
      box.innerHTML =
        '<div class="shr-bar">' +
          '<label>学生</label><select id="calStu">' + opts + '</select>' +
          '<label>月份</label><input type="month" id="calYm" value="' + ym + '">' +
        '</div>' +
        '<div id="calBody"></div>';
      if (_cal.stu) $('calStu').value = _cal.stu;
      ['calStu','calYm'].forEach(function (id) {
        $(id).addEventListener('change', function () {
          _cal.stu = $('calStu').value; _cal.ym = $('calYm').value;
          renderCal();
        });
      });
      $('calBody').addEventListener('click', function (e) {
        var cell = e.target.closest('[data-day]');
        if (cell) showDay(cell.dataset.day);
      });
    }
    var stu = $('calStu').value, ym = $('calYm').value;
    if (!stu || !ym) { $('calBody').innerHTML = '<div class="empty-hint">请选择学生和月份</div>'; return; }
    _cal.stu = stu; _cal.ym = ym;

    var y = parseInt(ym.split('-')[0], 10), mo = parseInt(ym.split('-')[1], 10) - 1;
    var first = new Date(y, mo, 1);
    var days = new Date(y, mo + 1, 0).getDate();
    var rows = _hw.filter(function (r) { return r.student_name === stu && r.record_date.indexOf(ym) === 0; });
    var byDay = groupBy(rows, 'record_date');
    var today = fmtDate(new Date());

    var h = '<div class="tf-note">' + stu + ' · ' + ym + ' 共打卡 ' + Object.keys(byDay).length + ' 天</div>';
    h += '<div class="cal-grid">';
    ['一','二','三','四','五','六','日'].forEach(function (w) { h += '<div class="cal-wd">' + w + '</div>'; });
    var lead = (first.getDay() + 6) % 7;
    for (var i = 0; i < lead; i++) h += '<div class="cc empty"></div>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad(mo + 1) + '-' + pad(d);
      var has = !!byDay[ds];
      h += '<div class="cc' + (has ? ' has' : '') + (ds === today ? ' today' : '') + '" data-day="' + ds + '">' + d + '</div>';
    }
    h += '</div><div class="legend"><span><i class="has"></i>已打卡</span><span><i></i>未打卡</span><span>点某天看详情</span></div>';
    h += '<div id="calDay"></div>';
    $('calBody').innerHTML = h;
  }

  function showDay(ds) {
    var rows = _hw.filter(function (r) { return r.student_name === _cal.stu && r.record_date === ds; })
      .sort(function (a, b) { return SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject); });
    var box = $('calDay');
    if (!rows.length) { box.innerHTML = '<div class="tf-note">' + fmtCN(parseD(ds)) + ' 未打卡</div>'; return; }
    var h = '<div class="day-box"><div class="day-h">📌 ' + fmtCN(parseD(ds)) + ' · ' + rows.length + ' 科</div>';
    rows.forEach(function (r) {
      var imgs = imgsOf(r.images);
      h += '<div class="day-sub"><div class="day-sub-n">' + escapeHtml(r.subject) +
           (imgs.length ? ' <span class="t-wrong">' + imgs.length + '张图</span>' : '') + '</div>' +
           '<div class="day-sub-t">' + escapeHtml(r.text_content || '（无文字）') + '</div>' +
           (imgs.length ? '<div class="hw-imgs">' + imgs.map(function (u) { return '<img src="' + escapeHtml(u) + '" alt="">'; }).join('') + '</div>' : '') +
           '<div class="cmt-row">' +
             (r.comment_submitted && r.teacher_comment
               ? '<div class="cmt">💬 已提交评语：' + escapeHtml(r.teacher_comment) + '</div>'
               : (r.teacher_comment ? '<div class="cmt draft">💬 草稿（未提交）：' + escapeHtml(r.teacher_comment) + '</div>' : '')) +
             '<div class="row-ops">' +
               '<button class="tf-mini" data-cmt="' + r.id + '">✎ ' + (r.teacher_comment ? '改评语' : '加评语') + '</button>' +
               '<button class="tf-mini" data-addsub="' + escapeHtml(r.subject) + '" data-day="' + ds + '">＋ 补交本科</button>' +
               '<button class="tf-mini" data-del-day-sub="' + escapeHtml(r.subject) + '" data-day="' + ds + '">🗑 清空本科</button>' +
             '</div></div></div>';
    });
    h += '</div>';
    box.innerHTML = h;

    Array.prototype.forEach.call(box.querySelectorAll('[data-cmt]'), function (b) {
      b.addEventListener('click', function () { editComment(b.dataset.cmt); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-addsub]'), function (b) {
      b.addEventListener('click', function () {
        var v = prompt('补写「' + b.dataset.addsub + '」内容：', '');
        if (v === null) return;
        ensureCloud().then(function (c) {
          return c.Homework.save({ student_name: _cal.stu, record_date: b.dataset.day, subject: b.dataset.addsub, text_content: v });
        }).then(function () { toast('✅ 已补交'); return loadAll(); })
          .catch(function (e) { toast('❌ ' + (e.message||e)); });
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-del-day-sub]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('清空 ' + b.dataset.day + ' 的「' + b.dataset.delDaySub + '」？')) return;
        ensureCloud().then(function (c) { return c.Homework.removeBy(_cal.stu, b.dataset.day, b.dataset.delDaySub); })
          .then(function () { toast('已清空'); return loadAll(); })
          .catch(function (e) { toast('❌ ' + (e.message||e)); });
      });
    });
  }

  function editComment(id) {
    var row = _hw.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    var v = prompt('给「' + row.subject + '」写评语：\n（留空 = 清空评语）', row.teacher_comment || '');
    if (v === null) return;
    var submit = false;
    if (v.trim()) {
      submit = confirm('点「确定」= 提交给家长看\n点「取消」= 只保存草稿，不给家长看');
    }
    ensureCloud().then(function (c) { return c.Homework.saveComment(id, v.trim(), submit); })
      .then(function () { toast(submit ? '✅ 评语已提交' : '已保存草稿'); return loadAll(); })
      .catch(function (e) { toast('❌ ' + (e.message||e)); });
  }

  // ==================== 绑定与入口 ====================
  var _bound = false;
  function setLockHidden(h) {
    var lock = document.getElementById('lockScreen');
    if (!lock) return;
    if (h) { lock.dataset.pd = lock.style.display || ''; lock.style.display = 'none'; }
    else { lock.style.display = lock.dataset.pd || ''; }
  }
  function close() { $('teacherMask').classList.remove('show'); setLockHidden(false); }

  function bind() {
    if (_bound || !$('teacherMask')) return;
    _bound = true;
    $('teacherClose').addEventListener('click', close);
    $('teacherMask').addEventListener('click', function (e) { if (e.target === this) close(); });
    $('tRefresh').addEventListener('click', function () { loadAll(); });

    // 老师端导出错词：汇总当前查询范围内的所有错词
    var _tExportBtn = $('tExportWrong');
    if (_tExportBtn) {
      _tExportBtn.addEventListener('click', function () {
        var rows = _logs || [];
        if (!rows.length) { alert('当前没有记录可导出'); return; }

        var entries = [];
        rows.forEach(function (r) {
          var list = [];
          try { list = JSON.parse(r.wrong_items || '[]'); } catch (e) {}
          if (!Array.isArray(list)) return;
          list.forEach(function (w) {
            if (typeof w !== 'string' || !w) return;
            var m = w.split('→');
            entries.push({
              word: String(m[0] || '').replace(/\(未答\)$/, '').trim(),
              user: m.length > 1 ? String(m[1]).trim() : '未填'
            });
          });
        });

        if (!entries.length) { alert('所选范围内没有错词 🎉'); return; }
        if (!global.RBWordExport) { alert('导出组件未加载'); return; }

        var old = _tExportBtn.textContent;
        _tExportBtn.textContent = '⏳ 查音标中…';
        _tExportBtn.disabled = true;

        global.RBWordExport.export(entries, {
          student: $('tName') ? $('tName').value.trim() : '',
          date: ($('tStart') ? $('tStart').value : '') + ' ~ ' + ($('tEnd') ? $('tEnd').value : ''),
          module: '全部模块',
          title: '老师端错词汇总'
        }).then(function (ok) {
          _tExportBtn.textContent = old; _tExportBtn.disabled = false;
          alert(ok ? ('✅ 已导出 ' + entries.length + ' 个错词（含音标·词性·释义）') : '⚠️ 导出失败');
        }).catch(function (e) {
          _tExportBtn.textContent = old; _tExportBtn.disabled = false;
          alert('❌ ' + (e.message || '导出失败'));
        });
      });
    }
    $('tQuery').addEventListener('click', function () { renderRecords(); });
    $('tfTabs').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      ['today','all','stu','wrong','share','cal'].forEach(function (k) {
        var p = $('tf-pane-' + k);
        if (p) p.classList.toggle('on', k === b.dataset.t);
      });
      var row = e.target.closest('.roster-row');
      if (b.dataset.t === 'stu' && row) {
        $('tName').value = row.dataset.stu || '';
        renderRecords();
        Array.prototype.forEach.call($('tfTabs').children, function (x) { x.classList.toggle('on', x.dataset.t === 'all'); });
        $('tf-pane-all').classList.add('on'); $('tf-pane-stu').classList.remove('on');
      }
    });
    // 默认日期
    var end = new Date(), start = new Date();
    start.setDate(start.getDate() - 30);
    $('tStart').value = fmtDate(start);
    $('tEnd').value = fmtDate(end);
  }

  global.TeacherPanel = {
    open: function () {
      bind();
      if (!$('teacherMask')) return;
      setLockHidden(true);
      $('teacherMask').classList.add('show');
      // 旧站（GitHub Pages）跨域受限，未启用云端时给出明确提示
      if (!global.RBCloud || !global.RBCloud.get) {
        $('tStats').innerHTML = '';
        $('tOut').innerHTML = '<div class="empty-hint">' +
          '当前站点未连接云端，老师端查询不可用。<br>' +
          '<span style="font-size:.78rem;">请到整合版打开老师端：<br>' +
          'reborn-ielts-study.app.workbuddy.host</span></div>';
        return;
      }
      loadAll();
    },
    close: close,
    bind: bind,
    reload: loadAll
  };
})(window);
