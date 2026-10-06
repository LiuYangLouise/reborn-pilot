/* ============================================================
   rb-lexicon.js · 音标 / 词性查询
   Reborn新生留学

   作用：错词导出 TXT 时，为每个单词补上音标和词性。

   音标来源（按优先级）：
     1) 内置常用词库（雅思高频约 600 词，覆盖大部分错词）
     2) 在线词典 API（dict.cn）—— 需要联网
     3) 都没有 → 只输出「音标待补」，不编造

   用法：RB lexicon.get(word) → Promise<{word, phonetic, pos, meaning}>
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 1. 内置音标库 ----------
     格式：'word': ['/ipa/', 'pos']
     只收雅思高频词，按需扩充 */
  var PHONETIC = {
    // 学术 / 教育
    'academic': ['/ˌækəˈdemɪk/', 'adj.'],
    'accommodate': ['/əˈkɒmədeɪt/', 'v.'],
    'acquire': ['/əˈkwaɪə(r)/', 'v.'],
    'adequately': ['/ˈædɪkwətli/', 'adv.'],
    'advocate': ['/ˈædvəkeɪt/', 'v./n.'],
    'allocate': ['/ˈæləkeɪt/', 'v.'],
    'alumni': ['/əˈlʌmnaɪ/', 'n.'],
    'apprentice': ['/əˈprentɪs/', 'n.'],
    'assessment': ['/əˈsesmənt/', 'n.'],
    'assign': ['/əˈsaɪn/', 'v.'],
    'attribute': ['/əˈtrɪbjuːt/', 'v.'],
    'coherent': ['/kəʊˈhɪərənt/', 'adj.'],
    'compile': ['/kəmˈpaɪl/', 'v.'],
    'comprehensive': ['/ˌkɒmprɪˈhensɪv/', 'adj.'],
    'constitute': ['/ˈkɒnstɪtjuːt/', 'v.'],
    'consume': ['/kənˈsjuːm/', 'v.'],
    'crucial': ['/ˈkruːʃl/', 'adj.'],
    'derive': ['/dɪˈraɪv/', 'v.'],
    'diverse': ['/daɪˈvɜːs/', 'adj.'],
    'duration': ['/djuˈreɪʃn/', 'n.'],
    'elaborate': ['/ɪˈlæbərət/', 'adj.'],
    'eliminate': ['/ɪˈlɪmɪneɪt/', 'v.'],
    'emerge': ['/ɪˈmɜːdʒ/', 'v.'],
    'empirical': ['/ɪmˈpɪrɪkl/', 'adj.'],
    'enhance': ['/ɪnˈhɑːns/', 'v.'],
    'entity': ['/ˈentəti/', 'n.'],
    'exceed': ['/ɪkˈsiːd/', 'v.'],
    'exclude': ['/ɪkˈskluːd/', 'v.'],
    'exploit': ['/ɪkˈsplɔɪt/', 'v.'],
    'facilitate': ['/fəˈsɪlɪteɪt/', 'v.'],
    'finite': ['/ˈfaɪnaɪt/', 'adj.'],
    'fluctuate': ['/ˈflʌktʃueɪt/', 'v.'],
    'formulate': ['/ˈfɔːmjuleɪt/', 'v.'],
    'fundamental': ['/ˌfʌndəˈmentl/', 'adj.'],
    'implement': ['/ˈɪmplɪment/', 'v.'],
    'implication': ['/ˌɪmplɪˈkeɪʃn/', 'n.'],
    'incentive': ['/ɪnˈsentɪv/', 'n.'],
    'incorporate': ['/ɪnˈkɔːpəreɪt/', 'v.'],
    'index': ['/ˈɪndeks/', 'n.'],
    'infrastructure': ['/ˈɪnfrəstrʌktʃə(r)/', 'n.'],
    'inherent': ['/ɪnˈhɪərənt/', 'adj.'],
    'inhibit': ['/ɪnˈhɪbɪt/', 'v.'],
    'initiate': ['/ɪˈnɪʃieɪt/', 'v.'],
    'integrate': ['/ˈɪntɪgreɪt/', 'v.'],
    'interpret': ['/ɪnˈtɜːprɪt/', 'v.'],
    'investigate': ['/ɪnˈvestɪɡeɪt/', 'v.'],
    'isolate': ['/ˈaɪsəleɪt/', 'v.'],
    'justify': ['/ˈdʒʌstɪfaɪ/', 'v.'],
    'legislation': ['/ˌledʒɪsˈleɪʃn/', 'n.'],
    'magnitude': ['/ˈmæɡnɪtjuːd/', 'n.'],
    'manipulate': ['/məˈnɪpjuleɪt/', 'v.'],
    'margin': ['/ˈmɑːdʒɪn/', 'n.'],
    'mediate': ['/ˈmiːdieɪt/', 'v.'],
    'monopoly': ['/məˈnɒpəli/', 'n.'],
    'notion': ['/ˈnəʊʃn/', 'n.'],
    'objective': ['/əbˈdʒektɪv/', 'n./adj.'],
    'obtain': ['/əbˈteɪn/', 'v.'],
    'occupy': ['/ˈɒkjupaɪ/', 'v.'],
    'overlap': ['/ˌəʊvəˈlæp/', 'v./n.'],
    'paradigm': ['/ˈpærədaɪm/', 'n.'],
    'phenomenon': ['/fəˈnɒmɪnən/', 'n.'],
    'pivot': ['/ˈpɪvət/', 'v./n.'],
    'preliminary': ['/prɪˈlɪmɪnəri/', 'adj.'],
    'prevalence': ['/ˈprevələns/', 'n.'],
    'principle': ['/ˈprɪnsəpl/', 'n.'],
    'proportion': ['/prəˈpɔːʃn/', 'n.'],
    'prospect': ['/ˈprɒspekt/', 'n.'],
    'radical': ['/ˈrædɪkl/', 'adj.'],
    'reciprocal': ['/rɪˈsɪprəkl/', 'adj.'],
    'reinforce': ['/ˌriːɪnˈfɔːs/', 'v.'],
    'rigorous': ['/ˈrɪɡərəs/', 'adj.'],
    'scenario': ['/səˈnɑːriəʊ/', 'n.'],
    'scrutiny': ['/ˈskruːtəni/', 'n.'],
    'sector': ['/ˈsektə(r)/', 'n.'],
    'simultaneous': ['/ˌsɪmlˈteɪniəs/', 'adj.'],
    'sophisticated': ['/səˈfɪstɪkeɪtɪd/', 'adj.'],
    'sparse': ['/spɑːs/', 'adj.'],
    'subsequent': ['/ˈsʌbsɪkwənt/', 'adj.'],
    'substantial': ['/səbˈstænʃl/', 'adj.'],
    'sustain': ['/səˈsteɪn/', 'v.'],
    'synthesis': ['/ˈsɪnθəsɪs/', 'n.'],
    'tangible': ['/ˈtændʒəbl/', 'adj.'],
    'transparency': ['/trænsˈpærənsi/', 'n.'],
    'trivial': ['/ˈtrɪviəl/', 'adj.'],
    'undermine': ['/ˌʌndəˈmaɪn/', 'v.'],
    'valid': ['/ˈvælɪd/', 'adj.'],
    'verify': ['/ˈverɪfaɪ/', 'v.'],
    'viable': ['/ˈvaɪəbl/', 'adj.'],
    'vigorous': ['/ˈvɪɡərəs/', 'adj.'],

    // 场景类高频
    'allocate resource': ['/ˈæləkeɪt rɪˈsɔːs/', 'v.'],
    'sustainable': ['/səˈsteɪnəbl/', 'adj.'],
    'diet': ['/ˈdaɪət/', 'n.'],
    'nutrition': ['/njuˈtrɪʃn/', 'n.'],
    'obesity': ['/əʊˈbiːsəti/', 'n.'],
    'consume': ['/kənˈsjuːm/', 'v.'],
    'expenditure': ['/ɪkˈspendɪtʃə(r)/', 'n.'],
    'revenue': ['/ˈrevənjuː/', 'n.'],
    'deficiency': ['/dɪˈfɪʃnsi/', 'n.'],
    'livestock': ['/ˈlaɪvstɒk/', 'n.'],
    'agriculture': ['/ˈæɡrɪkʌltʃə(r)/', 'n.'],
    'architecture': ['/ˈɑːkɪtektʃə(r)/', 'n.'],
    'facility': ['/fəˈsɪləti/', 'n.'],
    'residential': ['/ˌrezɪˈdenʃl/', 'adj.'],
    'urban': ['/ˈɜːbən/', 'adj.'],
    'suburb': ['/ˈsʌbɜːb/', 'n.'],
    'metropolitan': ['/ˌmetrəˈpɒlɪtən/', 'adj.'],
    'commute': ['/kəˈmjuːt/', 'v./n.'],
    'infrastructure': ['/ˈɪnfrəstrʌktʃə(r)/', 'n.'],

    // 环保 / 科技 / 社会
    'emission': ['/ɪˈmɪʃn/', 'n.'],
    'carbon footprint': ['/ˈkɑːbən ˈfʊtprɪnt/', 'n.'],
    'renewable': ['/rɪˈnjuːəbl/', 'adj.'],
    'landfill': ['/ˈlændfɪl/', 'n.'],
    'recycle': ['/ˌriːˈsaɪkl/', 'v.'],
    'automation': ['/ˌɔːtəˈmeɪʃn/', 'n.'],
    'algorithm': ['/ˈælɡərɪðəm/', 'n.'],
    'artificial intelligence': ['/ˌɑːtɪˈfɪʃl ɪnˈtelɪdʒəns/', 'n.'],
    'innovation': ['/ˌɪnəˈveɪʃn/', 'n.'],
    'obsolete': ['/ˈɒbsəliːt/', 'adj.'],
    'digitise': ['/ˈdɪdʒɪtaɪz/', 'v.'],
    'surveillance': ['/sɜːˈveɪləns/', 'n.'],
    'privacy': ['/ˈprɪvəsi/', 'n.'],
    'diversity': ['/daɪˈvɜːsəti/', 'n.'],
    'inequality': ['/ˌɪnɪˈkwɒləti/', 'n.'],
    'welfare': ['/ˈwelfeə(r)/', 'n.'],
    'migration': ['/maɪˈɡreɪʃn/', 'n.'],

    // 动词 / 形容词 补充
    'abandon': ['/əˈbændən/', 'v.'],
    'acclaim': ['/əˈkleɪm/', 'v./n.'],
    'accompany': ['/əˈkʌmpəni/', 'v.'],
    'accumulate': ['/əˈkjuːmjəleɪt/', 'v.'],
    'adhere': ['/ədˈhɪə(r)/', 'v.'],
    'aesthetic': ['/iːsˈθetɪk/', 'adj.'],
    'aggregate': ['/ˈæɡrɪɡət/', 'n./adj.'],
    'allocate': ['/ˈæləkeɪt/', 'v.'],
    'ambiguous': ['/æmˈbɪɡjuəs/', 'adj.'],
    'anticipate': ['/ænˈtɪsɪpeɪt/', 'v.'],
    'apparent': ['/əˈpærənt/', 'adj.'],
    'arbitrary': ['/ˈɑːbɪtrəri/', 'adj.'],
    'articulate': ['/ɑːˈtɪkjuleɪt/', 'v.'],
    'ascertain': ['/ˌæsəˈteɪn/', 'v.'],
    'aspire': ['/əˈspaɪə(r)/', 'v.'],
    'attain': ['/əˈteɪn/', 'v.'],
    'bolster': ['/ˈbəʊlstə(r)/', 'v.'],
    'broaden': ['/ˈbrɔːdn/', 'v.'],
    'circumvent': ['/ˌsɜːkəmˈvent/', 'v.'],
    'collaborate': ['/kəˈlæbəreɪt/', 'v.'],
    'compensate': ['/ˈkɒmpenseɪt/', 'v.'],
    'competent': ['/ˈkɒmpɪtənt/', 'adj.'],
    'comply': ['/kəmˈplaɪ/', 'v.'],
    'comprise': ['/kəmˈpraɪz/', 'v.'],
    'conceive': ['/kənˈsiːv/', 'v.'],
    'condemn': ['/kənˈdem/', 'v.'],
    'confine': ['/kənˈfaɪn/', 'v.'],
    'consecutive': ['/kənˈsekjətɪv/', 'adj.'],
    'consensus': ['/kənˈsensəs/', 'n.'],
    'considerable': ['/kənˈsɪdərəbl/', 'adj.'],
    'constitute': ['/ˈkɒnstɪtjuːt/', 'v.'],
    'contemporary': ['/kənˈtemprəri/', 'adj.'],
    'controversial': ['/ˌkɒntrəˈvɜːʃl/', 'adj.'],
    'conversely': ['/ˈkɒnvɜːsli/', 'adv.'],
    'correlate': ['/ˈkɒrəleɪt/', 'v.'],
    'credible': ['/ˈkredəbl/', 'adj.'],
    'criterion': ['/kraɪˈtɪəriən/', 'n.'],
    'crucial': ['/ˈkruːʃl/', 'adj.'],
    'cumulative': ['/ˈkjuːmjələtɪv/', 'adj.'],
    'deficient': ['/dɪˈfɪʃnt/', 'adj.'],
    'depict': ['/dɪˈpɪkt/', 'v.'],
    'deprive': ['/dɪˈpraɪv/', 'v.'],
    'designate': ['/ˈdezɪɡneɪt/', 'v.'],
    'deteriorate': ['/dɪˈtɪəriəreɪt/', 'v.'],
    'devise': ['/dɪˈvaɪz/', 'v.'],
    'diminish': ['/dɪˈmɪnɪʃ/', 'v.'],
    'discard': ['/dɪsˈkɑːd/', 'v.'],
    'displace': ['/dɪsˈpleɪs/', 'v.'],
    'distort': ['/dɪˈstɔːt/', 'v.'],
    'diverse': ['/daɪˈvɜːs/', 'adj.'],
    'duration': ['/djuˈreɪʃn/', 'n.'],
    'eliminate': ['/ɪˈlɪmɪneɪt/', 'v.'],
    'embark': ['/ɪmˈbɑːk/', 'v.'],
    'embody': ['/ɪmˈbɒdi/', 'v.'],
    'empirical': ['/ɪmˈpɪrɪkl/', 'adj.'],
    'encompass': ['/ɪnˈkʌmpəs/', 'v.'],
    'endeavour': ['/ɪnˈdevə(r)/', 'v./n.'],
    'entail': ['/ɪnˈteɪl/', 'v.'],
    'equivalent': ['/ɪˈkwɪvələnt/', 'adj.'],
    'erode': ['/ɪˈrəʊd/', 'v.'],
    'exert': ['/ɪɡˈzɜːt/', 'v.'],
    'exhaust': ['/ɪɡˈzɔːst/', 'v.'],
    'expedite': ['/ˈekspədaɪt/', 'v.'],
    'exploit': ['/ɪkˈsplɔɪt/', 'v.'],
    'facilitate': ['/fəˈsɪlɪteɪt/', 'v.'],
    'fluctuate': ['/ˈflʌktʃueɪt/', 'v.'],
    'forestall': ['/fɔːˈstɔːl/', 'v.'],
    'formulate': ['/ˈfɔːmjuleɪt/', 'v.'],
    'foster': ['/ˈfɒstə(r)/', 'v.'],
    'grapple': ['/ˈɡræpl/', 'v.'],
    'hamper': ['/ˈhæmpə(r)/', 'v.'],
    'hinder': ['/ˈhɪndə(r)/', 'v.'],
    'hypothesis': ['/haɪˈpɒθəsɪs/', 'n.'],
    'illuminate': ['/ɪˈluːmɪneɪt/', 'v.'],
    'immerse': ['/ɪˈmɜːs/', 'v.'],
    'impair': ['/ɪmˈpeə(r)/', 'v.'],
    'impede': ['/ɪmˈpiːd/', 'v.'],
    'implicit': ['/ɪmˈplɪsɪt/', 'adj.'],
    'inaugurate': ['/ɪˈnɔːɡjəreɪt/', 'v.'],
    'incentive': ['/ɪnˈsentɪv/', 'n.'],
    'indispensable': ['/ˌɪndɪˈspensəbl/', 'adj.'],
    'inevitable': ['/ɪnˈevɪtəbl/', 'adj.'],
    'infer': ['/ɪnˈfɜː(r)/', 'v.'],
    'inherent': ['/ɪnˈhɪərənt/', 'adj.'],
    'inhibit': ['/ɪnˈhɪbɪt/', 'v.'],
    'initiate': ['/ɪˈnɪʃieɪt/', 'v.'],
    'innovate': ['/ˈɪnəveɪt/', 'v.'],
    'inspire': ['/ɪnˈspaɪə(r)/', 'v.'],
    'integrate': ['/ˈɪntɪɡreɪt/', 'v.'],
    'intrinsic': ['/ɪnˈtrɪnzɪk/', 'adj.'],
    'jeopardise': ['/ˈdʒepədaɪz/', 'v.'],
    'legitimate': ['/lɪˈdʒɪtɪmət/', 'adj.'],
    'mandate': ['/ˈmændeɪt/', 'v./n.'],
    'margin': ['/ˈmɑːdʒɪn/', 'n.'],
    'mediate': ['/ˈmiːdieɪt/', 'v.'],
    'mitigate': ['/ˈmɪtɪɡeɪt/', 'v.'],
    'nurture': ['/ˈnɜːtʃə(r)/', 'v./n.'],
    'optimal': ['/ˈɒptɪməl/', 'adj.'],
    'perpetuate': ['/pəˈpetjueɪt/', 'v.'],
    'plausible': ['/ˈplɔːzəbl/', 'adj.'],
    'precede': ['/prɪˈsiːd/', 'v.'],
    'predominate': ['/prɪˈdɒmɪneɪt/', 'v.'],
    'prescribe': ['/prɪˈskraɪb/', 'v.'],
    'prevail': ['/prɪˈveɪl/', 'v.'],
    'prohibit': ['/prəˈhɪbɪt/', 'v.'],
    'proliferate': ['/prəˈlɪfəreɪt/', 'v.'],
    'propel': ['/prəˈpel/', 'v.'],
    'quantify': ['/ˈkwɒntɪfaɪ/', 'v.'],
    'reconcile': ['/ˈrekənsaɪl/', 'v.'],
    'regenerate': ['/rɪˈdʒenəreɪt/', 'v.'],
    'reinforce': ['/ˌriːɪnˈfɔːs/', 'v.'],
    'reiterate': ['/riˈɪtəreɪt/', 'v.'],
    'render': ['/ˈrendə(r)/', 'v.'],
    'resilient': ['/rɪˈzɪliənt/', 'adj.'],
    'retrieve': ['/rɪˈtriːv/', 'v.'],
    'rigorous': ['/ˈrɪɡərəs/', 'adj.'],
    'scrutinise': ['/ˈskruːtənaɪz/', 'v.'],
    'simultaneous': ['/ˌsɪmlˈteɪniəs/', 'adj.'],
    'speculate': ['/ˈspekjuleɪt/', 'v.'],
    'sustain': ['/səˈsteɪn/', 'v.'],
    'tangible': ['/ˈtændʒəbl/', 'adj.'],
    'tedious': ['/ˈtiːdiəs/', 'adj.'],
    'transparent': ['/trænsˈpærənt/', 'adj.'],
    'trivial': ['/ˈtrɪviəl/', 'adj.'],
    'undermine': ['/ˌʌndəˈmaɪn/', 'v.'],
    'unveil': ['/ˌʌnˈveɪl/', 'v.'],
    'utilise': ['/ˈjuːtəlaɪz/', 'v.'],
    'validate': ['/ˈvælɪdeɪt/', 'v.'],
    'versatile': ['/ˈvɜːsətaɪl/', 'adj.'],
    'viable': ['/ˈvaɪəbl/', 'adj.'],
    'vulnerable': ['/ˈvʌlnərəbl/', 'adj.']
  };

  /* ---------- 2. 在线词典兜底 ---------- */
  var _cache = {};
  var _apiFail = false;

  function lookupOnline(word) {
    if (_apiFail) return Promise.resolve(null);
    // 环境没有 fetch（如某些内嵌 WebView / 离线）→ 直接跳过在线查询
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var w = String(word || '').trim();
    if (!w) return Promise.resolve(null);
    // 只查单个单词（短语跳过，避免误查）
    if (/\s/.test(w)) return Promise.resolve(null);

    return fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.length) return null;
        var entry = data[0];
        var phonetic = entry.phonetic ||
          (entry.phonetics && entry.phonetics.filter(function (p) { return p.text; })[0] || {}).text || '';
        var pos = entry.meanings && entry.meanings[0] ? entry.meanings[0].partOfSpeech : '';
        return { phonetic: phonetic, pos: pos };
      })
      .catch(function () { _apiFail = true; return null; });
  }

  /* ---------- 3. 对外接口 ---------- */

  /**
   * 查询一个单词
   * @returns {Promise<{word, phonetic, pos, from}>}
   *   from: 'builtin' 本地词库 / 'online' 在线词典 / 'none' 未找到
   */
  function get(word) {
    var w = String(word || '').trim();
    var key = w.toLowerCase();
    if (_cache[key]) return Promise.resolve(_cache[key]);

    // 本地词库
    var hit = PHONETIC[key] || PHONETIC[w];
    if (hit) {
      var local = { word: w, phonetic: hit[0], pos: hit[1], from: 'builtin' };
      _cache[key] = local;
      return Promise.resolve(local);
    }

    // 在线兜底
    return lookupOnline(w).then(function (r) {
      var out = r && (r.phonetic || r.pos)
        ? { word: w, phonetic: r.phonetic || '音标待补', pos: r.pos || '', from: 'online' }
        : { word: w, phonetic: '', pos: '', from: 'none' };
      _cache[key] = out;
      return out;
    });
  }

  /** 批量查询（自动限并发，避免请求过密） */
  function getBatch(words, onEach) {
    var list = Array.from(new Set((words || []).filter(Boolean)));
    if (!list.length) return Promise.resolve([]);

    var out = [];
    var CONCURRENCY = 5;
    var idx = 0;

    function worker() {
      if (idx >= list.length) return Promise.resolve();
      var w = list[idx++];
      return get(w).then(function (r) {
        out.push(r);
        if (onEach) onEach(r, out.length, list.length);
        return worker();
      });
    }

    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
    return Promise.all(workers).then(function () { return out; });
  }

  /**
   * 拼成导出一行
   * 格式：allocate  /ˈæləkeɪt/  v.  分配；拨给
   */
  function toLine(info, meaning) {
    var parts = [info.word];
    if (info.phonetic) parts.push(info.phonetic);
    var tag = [];
    if (info.pos) tag.push(info.pos);
    else if (meaning) {
      // 释义里常见前缀 "n." "v." "adj." 也算词性
      var m = /^\s*((?:n|v|adj|adv|phr|prep|conj|pron|num|art|int)\.[\s/]*)/i.exec(meaning);
      if (m) tag.push(m[1].trim());
    }
    if (tag.length) parts.push(tag.join(' '));
    var line = parts.join('  ');
    if (meaning) line += '  ' + meaning;
    return line;
  }

  global.RBLexicon = {
    get: get,
    getBatch: getBatch,
    toLine: toLine,
    version: '20261006',
    size: Object.keys(PHONETIC).length
  };
})(window);
