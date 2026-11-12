/* ===== Issue Log – page logic ===== */
var CAT_CN = { Sorting: '分拣', Printing: '打印', Hardware: '硬件', Integration: '系统对接', Interface: '界面', Improvement: '改进' };
var ST_CN = { OPEN: '未结', CLOSED: '已结' };
var S = { d: null, fresh: null, status: 'OPEN', clients: new Set(), cat: '', lang: ls(K + 'lang') || 'both', q: '', excluded: new Set(), hideOut: false, editor: null };
try { S.excluded = new Set(JSON.parse(ls(K + 'excluded') || '[]')); S.hideOut = ls(K + 'hideout') === '1'; } catch (e) { }
function savePrefs() { ls(K + 'excluded', JSON.stringify(Array.from(S.excluded))); ls(K + 'hideout', S.hideOut ? '1' : '0'); ls(K + 'lang', S.lang); }
function str(v) { return v === null || v === undefined ? '' : String(v); }
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dDate(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v)); return m ? fmtDate(new Date(+m[1], +m[2] - 1, +m[3]).toISOString()) : ''; }
function numOf(no) { var m = /(\d+)\s*$/.exec(no || ''); return m ? +m[1] : 0; }
function sortItems(a, b) { return (a.status === 'CLOSED') - (b.status === 'CLOSED') || numOf(a.no) - numOf(b.no) || str(a.no).localeCompare(str(b.no)); }
function items() { return (S.d && S.d.issues) || []; }
function isAdmin() { return !!(S.d && S.d.me && S.d.me.admin); }

function clientList() {
  var m = new Map();
  items().forEach(function (it) {
    if (!m.has(it.client)) m.set(it.client, { client: it.client, project: it.project, project_cn: it.project_cn, order: Number(it.client_order) || 99, open: 0, closed: 0, items: [] });
    var c = m.get(it.client); c.items.push(it); it.status === 'CLOSED' ? c.closed++ : c.open++;
  });
  return Array.from(m.values()).sort(function (a, b) { return a.order - b.order || a.client.localeCompare(b.client); });
}
function filtered() {
  var q = S.q.trim().toLowerCase();
  return clientList().map(function (c) {
    return Object.assign({}, c, {
      rows: c.items.filter(function (it) {
        return (!S.clients.size || S.clients.has(it.client)) && (S.status === 'ALL' || it.status === S.status) && (!S.cat || it.cat_en === S.cat) &&
          (!q || ['no', 'cat_en', 'cat_cn', 'desc_en', 'desc_cn', 'act_en', 'act_cn', 'rem_en', 'rem_cn'].some(function (k) { return str(it[k]).toLowerCase().indexOf(q) >= 0; }));
      }).sort(sortItems)
    });
  }).filter(function (c) { return c.rows.length; });
}

/* ---------- screen ---------- */
function render() {
  if (!S.d) return;
  var all = items(), open = all.filter(function (i) { return i.status !== 'CLOSED'; }).length;
  var last = all.map(function (i) { return i.updated_at; }).filter(Boolean).sort().pop();
  var cats = Array.from(new Set(all.map(function (i) { return i.cat_en; }).filter(Boolean))).sort();
  if (cats.indexOf(S.cat) < 0) S.cat = '';
  var h = '<div class="tb"><span class="bar"></span><div><div class="eb">Project issues · 项目问题</div><h2>Issues &amp; action plan<span>问题与行动计划</span></h2>' +
    '<p>' + all.length + ' items · ' + open + ' open · ' + (all.length - open) + ' closed' + (last ? ' · last change ' + esc(ago(last)) : '') + '</p></div></div>';
  h += '<div class="kpis">' + [['OPEN', 'open', 'Open 未结', open], ['CLOSED', 'closed', 'Closed 已结', all.length - open], ['ALL', 'all', 'All 全部', all.length]].map(function (k) {
    return '<button type="button" class="kpi ' + k[1] + (S.status === k[0] ? ' on' : '') + '" data-st="' + k[0] + '"><b>' + k[3] + '</b><span>' + k[2] + '</span></button>';
  }).join('') + '</div>';
  h += '<div class="clients"><button type="button" data-c=""' + (!S.clients.size ? ' class="on"' : '') + '>All projects<small>' + open + ' open</small></button>' +
    clientList().map(function (c) { return '<button type="button" data-c="' + esc(c.client) + '"' + (S.clients.has(c.client) ? ' class="on"' : '') + '>' + esc(c.client) + '<small>' + c.open + ' open · ' + c.closed + ' closed</small></button>'; }).join('') + '</div>';
  h += '<div class="filters"><input type="search" id="q" placeholder="Search text or No." value="' + esc(S.q) + '" aria-label="Search">' +
    '<select id="fCat" aria-label="Category"><option value="">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === S.cat ? ' selected' : '') + '>' + esc(c + (CAT_CN[c] ? ' ' + CAT_CN[c] : '')) + '</option>'; }).join('') + '</select>' +
    '<div class="fg"><span class="flbl">Language</span><div class="fseg" id="segLang">' + [['both', 'Both'], ['en', 'English'], ['cn', '中文']].map(function (l) { return '<button type="button" data-l="' + l[0] + '"' + (S.lang === l[0] ? ' class="on"' : '') + '>' + l[1] + '</button>'; }).join('') + '</div></div></div>';
  h += '<div class="exbar"><button class="btn sm" type="button" id="bXlsx">Export Excel</button><button class="btn sm sec" type="button" id="bPdf">Export PDF</button><button class="btn sm sec" type="button" id="bDrive">Save to Google Drive</button>' +
    '<span class="cnt" id="cnt"></span></div>';
  h += '<div id="list" class="lang-' + S.lang + '"></div><p class="drivenote" id="driveNote"></p>' + footerHtml();
  $('#main').innerHTML = h;
  var hadFocus = document.activeElement && document.activeElement.id;
  renderList(); renderDriveNote();
  $$('.kpi').forEach(function (b) { b.onclick = function () { S.status = b.dataset.st; render(); }; });
  $$('.clients button').forEach(function (b) {
    b.onclick = function () {
      var c = b.dataset.c; if (!c) S.clients.clear(); else if (S.clients.has(c)) S.clients.delete(c); else S.clients.add(c);
      if (S.clients.size === clientList().length) S.clients.clear(); render();
    };
  });
  $('#q').oninput = function (e) { S.q = e.target.value; renderList(); };
  $('#fCat').onchange = function (e) { S.cat = e.target.value; renderList(); };
  $$('#segLang button').forEach(function (b) { b.onclick = function () { S.lang = b.dataset.l; savePrefs(); $$('#segLang button').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#list').className = 'lang-' + S.lang; }; });
  $('#bXlsx').onclick = exportXlsx; $('#bPdf').onclick = exportPdf; $('#bDrive').onclick = saveDrive;
  if (hadFocus === 'q') { var q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
function pairHtml(label, en, cn) {
  return '<div class="fld"><div class="k">' + label + '</div><div class="v en">' + esc(en || '—') + '</div><div class="v cn">' + esc(cn || '—') + '</div></div>';
}
function renderList() {
  var box = $('#list'); if (!box) return;
  var groups = filtered(), shown = 0, h = '';
  if (!items().length) h = '<div class="empty">No issues yet. Use <b>+ New issue</b> to add the first one.</div>';
  else if (!groups.length) h = '<div class="empty">No issues match these filters.</div>';
  groups.forEach(function (g) {
    var vis = g.rows.filter(function (it) { return !(S.hideOut && S.excluded.has(it.id)); });
    if (!vis.length) return;
    h += '<div class="grp"><b>' + esc(g.client) + '</b><span>' + esc([g.project, g.project_cn].filter(Boolean).join(' · ')) + '</span><span class="gc">' + vis.length + ' shown</span></div>';
    vis.forEach(function (it) {
      shown++;
      var out = S.excluded.has(it.id), cl = it.status === 'CLOSED';
      h += '<div class="issue' + (cl ? ' closed' : '') + (out ? ' out' : '') + '" tabindex="0" data-id="' + esc(it.id) + '">' +
        '<label class="pk" title="Include in export"><input type="checkbox" data-pick="' + esc(it.id) + '"' + (out ? '' : ' checked') + ' aria-label="Include ' + esc(it.no) + ' in export"></label>' +
        '<div class="bd"><div class="h"><span class="no">' + esc(it.no) + '</span><span class="st ' + (cl ? 'CLOSED' : 'OPEN') + '">' + (cl ? 'Closed' : 'Open') + ' ' + ST_CN[cl ? 'CLOSED' : 'OPEN'] + '</span>' +
        '<span class="cat">' + esc(it.cat_en) + ' ' + esc(it.cat_cn || CAT_CN[it.cat_en] || '') + '</span><span class="dt">' + (dDate(it.recorded_at) || '—') + '</span></div>' +
        '<div class="flds">' + pairHtml('Description 描述', it.desc_en, it.desc_cn) + pairHtml('Action plan 行动计划', it.act_en, it.act_cn) + pairHtml('Remarks 备注', it.rem_en, it.rem_cn) + '</div></div></div>';
    });
  });
  box.innerHTML = h;
  var ex = items().filter(function (i) { return S.excluded.has(i.id); }).length;
  $('#cnt').innerHTML = shown + ' of ' + items().length + ' shown' + (ex ? ' · ' + ex + ' left out of export · <a href="#" id="incAll">include all</a> · <a href="#" id="hideOut">' + (S.hideOut ? 'show' : 'hide') + ' unticked</a>' : '');
  if (ex) {
    $('#incAll').onclick = function (e) { e.preventDefault(); S.excluded.clear(); savePrefs(); renderList(); };
    $('#hideOut').onclick = function (e) { e.preventDefault(); S.hideOut = !S.hideOut; savePrefs(); renderList(); };
  }
  $$('#list .issue').forEach(function (r) {
    r.onclick = function (e) { if (e.target.closest('.pk')) return; openIssue(r.dataset.id); };
    r.onkeydown = function (e) { if (e.key === 'Enter') openIssue(r.dataset.id); };
  });
  $$('#list [data-pick]').forEach(function (cb) {
    cb.onchange = function () { cb.checked ? S.excluded.delete(cb.dataset.pick) : S.excluded.add(cb.dataset.pick); savePrefs(); renderList(); };
  });
}
function renderDriveNote() {
  var n = $('#driveNote'); if (!n || !S.d) return;
  var d = S.d.drive;
  n.innerHTML = 'Google Drive copy (Excel, all issues) lives in the <a href="' + esc(S.d.folderUrl || '#') + '" target="_blank" rel="noopener">Project Issues &amp; Action Plan folder</a>' +
    (d && d.saved_at ? '. Last saved ' + esc(fmtDate(d.saved_at, true)) + (d.saved_by ? ' by ' + esc(userName(d.saved_by)) : '') + '.' : '.');
}

/* ---------- editor (a history step: #i=<No.> or #new, so Back closes it) ---------- */
var NAV = { pushed: false };
function openIssue(id) { NAV.pushed = true; location.hash = 'i=' + encodeURIComponent(id); }
function newIssue() { NAV.pushed = true; location.hash = 'new'; }
function goList() { if (!/^#(i=|new)/.test(location.hash)) return; if (NAV.pushed) { NAV.pushed = false; history.back(); } else location.hash = ''; }
function route() {
  var m = /^#i=(.+)$/.exec(location.hash), isNew = location.hash === '#new';
  if (S.editor) { var o = S.editor; S.editor = null; o.silent = true; o.close(); }
  if (!S.d) return;
  if (m) { var it = items().filter(function (i) { return i.id === decodeURIComponent(m[1]); })[0]; if (it) showEditor(it); else { toast('That issue is not in the list any more.', true); location.hash = ''; } }
  else if (isNew) showEditor(null);
}
window.addEventListener('hashchange', route);
function nextNo(client) {
  var its = items().filter(function (i) { return i.client === client; }); if (!its.length) return '';
  var pre = (/^(.*?)(\d+)\s*$/.exec(its[0].no) || [0, its[0].no + '-'])[1];
  var w = (/(\d+)\s*$/.exec(its[0].no) || ['', ''])[1].length, n = Math.max.apply(null, its.map(function (i) { return numOf(i.no); })) + 1;
  return pre + (w > 1 ? String(n).padStart(w, '0') : n);
}
function ta(id, v, ph) { return '<textarea id="' + id + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '>' + esc(v) + '</textarea>'; }
function showEditor(it) {
  var cl = clientList(), cur = it ? it.client : (S.clients.size === 1 ? Array.from(S.clients)[0] : (cl[0] && cl[0].client) || '__new');
  var catOpts = Array.from(new Set(Object.keys(CAT_CN).concat(items().map(function (i) { return i.cat_en; }).filter(Boolean)))).sort();
  var html = '<div class="ed"><h3>' + (it ? 'Edit ' + esc(it.no) : 'New issue 新问题') + '</h3>' +
    (it ? '<div class="sub">' + esc(it.client) + ' · ' + esc(it.project) + (it.updated_by ? ' · last change ' + esc(ago(it.updated_at)) + ' by ' + esc(userName(it.updated_by)) : '') + '</div>' : '') +
    '<div class="g4"><div><label for="eClient">Client</label><select id="eClient"' + (it ? ' disabled' : '') + '>' + cl.map(function (c) { return '<option' + (c.client === cur ? ' selected' : '') + '>' + esc(c.client) + '</option>'; }).join('') + '<option value="__new"' + (cur === '__new' ? ' selected' : '') + '>+ New client…</option></select></div>' +
    '<div><label for="eNo">No.</label><input id="eNo" maxlength="20" value="' + esc(it ? it.no : nextNo(cur)) + '"' + (it ? ' disabled' : '') + '></div>' +
    '<div><label for="eCat">Category</label><input id="eCat" list="catList" value="' + esc(it ? it.cat_en : '') + '"><datalist id="catList">' + catOpts.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
    '<div><label for="eCatCn">类别</label><input id="eCatCn" value="' + esc(it ? it.cat_cn : '') + '"></div></div>' +
    '<div class="g4' + (cur === '__new' && !it ? '' : ' hidden') + '" id="newClient"><div><label for="eNewClient">New client name</label><input id="eNewClient"></div><div><label for="eProject">Project</label><input id="eProject"></div><div><label for="eProjectCn">项目</label><input id="eProjectCn"></div><div></div></div>' +
    '<div class="g4"><div><label for="eStatus">Status 状态</label><select id="eStatus"><option value="OPEN"' + (!it || it.status !== 'CLOSED' ? ' selected' : '') + '>OPEN 未结</option><option value="CLOSED"' + (it && it.status === 'CLOSED' ? ' selected' : '') + '>CLOSED 已结</option></select></div>' +
    '<div><label for="eRec">Date recorded 记录日期</label><input id="eRec" type="date" value="' + esc(it ? str(it.recorded_at).slice(0, 10) : today()) + '"></div></div>' +
    '<div class="note">Write in English or 中文. The other language is filled in automatically when you save. 只需填写一种语言，保存时自动翻译另一种。</div>' +
    [['Description 描述', 'desc'], ['Action plan 行动计划', 'act'], ['Remarks 备注', 'rem']].map(function (p) {
      return '<div class="ph">' + p[0] + '</div><div class="g2"><div><label for="e_' + p[1] + '_en">English</label>' + ta('e_' + p[1] + '_en', it ? it[p[1] + '_en'] : '') + '</div><div><label for="e_' + p[1] + '_cn">中文</label>' + ta('e_' + p[1] + '_cn', it ? it[p[1] + '_cn'] : '') + '</div></div>';
    }).join('') +
    '<div class="btns"><button class="btn sec" type="button" id="eCancel">Cancel</button><button class="btn" type="button" id="eSave">Save</button></div>' +
    (it && isAdmin() ? '<div class="del"><button class="btn sm bad" type="button" id="eDel">Delete</button><span id="delAsk" class="hidden">Delete ' + esc(it.no) + ' for everyone? <button class="btn sm bad" type="button" id="eDelYes">Yes, delete</button> <button class="btn sm sec" type="button" id="eDelNo">Keep</button></span></div>' : '') +
    '</div>';
  var o = openSheet(html, function () { if (S.editor === o) S.editor = null; if (!o.silent) goList(); });
  o.querySelector('.sheet').classList.add('ed');
  S.editor = o;
  var sel = $('#eClient', o);
  sel.onchange = function () { var v = sel.value; $('#newClient', o).classList.toggle('hidden', v !== '__new'); $('#eNo', o).value = v === '__new' ? '' : nextNo(v); };
  $('#eCat', o).oninput = function () { var cn = CAT_CN[this.value.trim()]; if (cn) $('#eCatCn', o).value = cn; };
  $('#eCancel', o).onclick = function () { o.close(); };
  $('#eSave', o).onclick = function () { saveEditor(o, it, this); };
  if ($('#eDel', o)) {
    $('#eDel', o).onclick = function () { $('#delAsk', o).classList.remove('hidden'); this.classList.add('hidden'); };
    $('#eDelNo', o).onclick = function () { $('#delAsk', o).classList.add('hidden'); $('#eDel', o).classList.remove('hidden'); };
    $('#eDelYes', o).onclick = function () {
      api('deleteIssue', [it.id]).then(function () {
        S.d.issues = items().filter(function (i) { return i.id !== it.id; }); S.excluded.delete(it.id); cacheSet('boot', S.d); toast(it.no + ' deleted'); o.close(); render();
      }).catch(fail);
    };
  }
}
function saveEditor(o, it, btn) {
  var v = function (id) { return $('#' + id, o).value.trim(); };
  var client, project, project_cn, order, cl = clientList();
  if (it) { client = it.client; project = it.project; project_cn = it.project_cn; order = it.client_order; }
  else if ($('#eClient', o).value === '__new') {
    client = v('eNewClient'); project = v('eProject'); project_cn = v('eProjectCn');
    if (!client) { toast('Enter the new client\'s name.', true); return; }
    order = Math.max.apply(null, [0].concat(items().map(function (i) { return Number(i.client_order) || 0; }))) + 1;
  } else { var c = cl.filter(function (x) { return x.client === $('#eClient', o).value; })[0]; client = c.client; project = c.project; project_cn = c.project_cn; order = c.order; }
  var no = it ? it.no : v('eNo');
  if (!it && !/^[A-Za-z0-9_\-.]{1,20}$/.test(no)) { toast('No. can use letters, numbers and dashes only, e.g. AD-11.', true); return; }
  if (!it && items().some(function (i) { return i.id === no; })) { toast(no + ' already exists. Pick another No.', true); return; }
  if (!v('eCat')) { toast('Enter a category.', true); return; }
  var data = { no: no, client: client, project: project || '', project_cn: project_cn || '', client_order: order, cat_en: v('eCat'), cat_cn: v('eCatCn') || CAT_CN[v('eCat')] || '',
    status: $('#eStatus', o).value, recorded_at: $('#eRec', o).value || today() };
  ['desc', 'act', 'rem'].forEach(function (k) { data[k + '_en'] = v('e_' + k + '_en'); data[k + '_cn'] = v('e_' + k + '_cn'); });
  btn.disabled = true;
  (S.fresh || Promise.resolve()).then(function () {
    return api('saveIssue', [data, !it, it ? it.updated_at : '']);
  }).then(function (saved) {
    var list = items().filter(function (i) { return i.id !== saved.id; }); list.push(saved); S.d.issues = list; cacheSet('boot', S.d);
    toast(saved.no + ' saved'); o.close(); render();
  }).catch(function (e) { btn.disabled = false; fail(e); });
}

/* ---------- exports (libraries load only when used) ---------- */
var LIBS = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', pdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' };
var _libs = {};
function loadLib(k) {
  return _libs[k] || (_libs[k] = new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = LIBS[k]; s.onload = res; s.onerror = function () { _libs[k] = null; rej(new Error('Could not load the export library. Check your connection and try again.')); };
    document.head.appendChild(s);
  }));
}
function exportGroups() { return filtered().map(function (g) { return Object.assign({}, g, { rows: g.rows.filter(function (r) { return !S.excluded.has(r.id); }) }); }).filter(function (g) { return g.rows.length; }); }
function exportCols(lang) {
  var c = [{ h: 'CLIENT', k: 'client', w: 18 }, { h: 'PROJECT', k: 'project', w: 18 }, { h: 'NO.', k: 'no', w: 9 }, { h: 'ISSUE', k: 'cat', w: 13 }, { h: 'STATUS', k: 'status', w: 10 }, { h: 'DATE RECORDED', k: 'recorded_at', w: 14 }];
  [['DESCRIPTION', '描述', 'desc'], ['ACTION PLAN', '行动计划', 'act'], ['REMARKS', '备注', 'rem']].forEach(function (p) {
    if (lang !== 'cn') c.push({ h: p[0], k: p[2] + '_en', w: lang === 'both' ? 42 : 60 });
    if (lang !== 'en') c.push({ h: p[1], k: p[2] + '_cn', w: lang === 'both' ? 34 : 55 });
  });
  return c;
}
function cellVal(it, k, lang) {
  if (k === 'cat') return lang === 'en' ? it.cat_en : lang === 'cn' ? (it.cat_cn || CAT_CN[it.cat_en] || it.cat_en) : [it.cat_en, it.cat_cn || CAT_CN[it.cat_en]].filter(Boolean).join('\n');
  if (k === 'status') return lang === 'en' ? it.status : lang === 'cn' ? ST_CN[it.status] : it.status + '\n' + (ST_CN[it.status] || '');
  if (k === 'project') return lang === 'en' ? it.project : lang === 'cn' ? (it.project_cn || it.project) : [it.project, it.project_cn].filter(Boolean).join('\n');
  if (k === 'recorded_at') return dDate(it.recorded_at);
  return str(it[k]);
}
function buildXlsx(groups, lang) {
  return loadLib('xlsx').then(function () {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Issues', { views: [{ state: 'frozen', ySplit: 1 }] }), cols = exportCols(lang);
    ws.columns = cols.map(function (c) { return { header: c.h, key: c.k, width: c.w }; });
    var line = { style: 'thin', color: { argb: 'FFBFBFBF' } }, border = { top: line, left: line, bottom: line, right: line }, font = { name: 'Montserrat', size: 10 };
    ws.getRow(1).height = 22;
    ws.getRow(1).eachCell(function (c) { c.font = { name: 'Montserrat', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5F7A61' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; });
    var r = 2, si = cols.findIndex(function (c) { return c.k === 'status'; }) + 1;
    groups.forEach(function (g) {
      var start = r;
      g.rows.forEach(function (it, n) {
        var row = ws.getRow(r);
        cols.forEach(function (c, i) {
          var cell = row.getCell(i + 1); cell.value = cellVal(it, c.k, lang) || null; cell.font = font; cell.alignment = { vertical: 'top', wrapText: true }; cell.border = border;
          if (n % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2EC' } };
        });
        var sc = row.getCell(si); sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: it.status === 'CLOSED' ? 'FFE2F3E8' : 'FFF9ECE7' } }; sc.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
        r++;
      });
      [1, 2].forEach(function (ci) {
        if (r - 1 > start) ws.mergeCells(start, ci, r - 1, ci);
        var c = ws.getCell(start, ci); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.font = { name: 'Montserrat', bold: true, size: 10 }; c.border = border;
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EFE7' } };
      });
    });
    return wb.xlsx.writeBuffer();
  });
}
function stamp() { return today(); }
function filterLabel() {
  var p = []; if (S.clients.size) p.push(Array.from(S.clients).join(', ')); if (S.status !== 'ALL') p.push(S.status === 'OPEN' ? 'Open' : 'Closed'); if (S.cat) p.push(S.cat);
  return p.length ? p.join(' - ') : 'All';
}
function download(name, blob) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportXlsx() {
  var g = exportGroups(); if (!g.length) { toast('Nothing to export with these filters.', true); return; }
  var b = $('#bXlsx'); b.classList.add('fl-busy');
  buildXlsx(g, S.lang).then(function (buf) { download('Project Issues (' + filterLabel() + ') ' + stamp() + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); })
    .catch(fail).then(function () { b.classList.remove('fl-busy'); });
}
function buildPdfSheet(groups, lang) {
  var s = $('#pdfsheet'), cols = exportCols(lang), total = groups.reduce(function (a, g) { return a + g.rows.length; }, 0);
  var h = '<div class="t"><img src="/logo.png" alt=""><h3>Project issues &amp; action plan · 项目问题与行动计划</h3></div>' +
    '<div class="meta">Filter: ' + esc(filterLabel()) + ' · ' + total + ' items · exported ' + esc(fmtDate(new Date().toISOString())) + '</div>' +
    '<table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.h) + '</th>'; }).join('') + '</tr></thead><tbody>';
  groups.forEach(function (g) {
    g.rows.forEach(function (it, i) {
      h += '<tr>' + cols.map(function (c) {
        if (c.k === 'client' || c.k === 'project') return i ? '' : '<td class="g" rowspan="' + g.rows.length + '">' + esc(cellVal(it, c.k, lang)) + '</td>';
        return '<td' + (c.k === 'status' ? ' class="' + (it.status === 'CLOSED' ? 'c' : 'o') + '"' : '') + '>' + esc(cellVal(it, c.k, lang)) + '</td>';
      }).join('') + '</tr>';
    });
  });
  s.innerHTML = h + '</tbody></table><div class="ft"><i></i><b>Endless Flexibility In Automation</b></div>';
  return s;
}
function exportPdf() {
  var groups = exportGroups(); if (!groups.length) { toast('Nothing to export with these filters.', true); return; }
  var b = $('#bPdf'); b.classList.add('fl-busy', 'fl-light');
  Promise.all([loadLib('h2c'), loadLib('pdf')]).then(function () {
    var s = buildPdfSheet(groups, S.lang);
    return Promise.all([document.fonts ? document.fonts.ready : 0, new Promise(function (r) { var im = s.querySelector('img'); if (im.complete) r(); else { im.onload = im.onerror = r; } })]).then(function () {
      var scale = 2;
      return html2canvas(s, { scale: scale, backgroundColor: '#ffffff', windowWidth: 1500 }).then(function (canvas) {
        var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 24, ratio = (pw - 2 * m) / canvas.width, pageH = Math.floor((ph - 2 * m) / ratio);
        var top = s.getBoundingClientRect().top;
        var breaks = $$('tbody tr', s).map(function (tr) { return Math.round((tr.getBoundingClientRect().top - top) * scale); }); breaks.push(canvas.height);
        var y = 0, first = true;
        while (y < canvas.height - 2) {                         // break only between rows, never through one
          var end = y + pageH;
          if (end < canvas.height) { var cand = breaks.filter(function (x) { return x > y + 40 && x <= end; }); if (cand.length) end = cand[cand.length - 1]; } else end = canvas.height;
          var part = document.createElement('canvas'); part.width = canvas.width; part.height = end - y;
          part.getContext('2d').drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
          if (!first) pdf.addPage(); first = false;
          pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, canvas.width * ratio, (end - y) * ratio);
          y = end;
        }
        download('Project Issues (' + filterLabel() + ') ' + stamp() + '.pdf', pdf.output('blob'));
      });
    });
  }).catch(fail).then(function () { b.classList.remove('fl-busy', 'fl-light'); $('#pdfsheet').innerHTML = ''; });
}
function b64(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function saveDrive() {
  var all = clientList().map(function (c) { return Object.assign({}, c, { rows: c.items.slice().sort(sortItems) }); });
  if (!all.length) { toast('Nothing to save yet.', true); return; }
  var title = 'Project Issues & Action Plan (' + fmtDate(new Date().toISOString()) + ')';
  buildXlsx(all, 'both').then(function (buf) { return api('saveToDrive', [b64(buf), title]); })
    .then(function (meta) { S.d.drive = meta; cacheSet('boot', S.d); renderDriveNote(); toast('Saved to Google Drive. The folder now holds the latest copy.'); })
    .catch(fail);
}

/* ---------- start ---------- */
function goHome() { S.status = 'OPEN'; S.clients.clear(); S.cat = ''; S.q = ''; if (/^#(i=|new)/.test(location.hash)) goList(); render(); }
function run(cachedOnly) {
  var c = cacheGet('boot'); if (c && !S.d) { S.d = c; render(); route(); }
  if (cachedOnly) return;
  if (/PASTE/.test(API_URL)) { $('#main').innerHTML = '<div class="empty">The Issue Log backend is not connected yet (API_URL is not set).</div>'; return; }
  S.fresh = api('bootstrap', []).then(function (d) {
    var first = !S.d; S.d = d; cacheSet('boot', d);
    if (!S.editor) render(); else renderDriveNote();
    if (first) route();
  });
  S.fresh.catch(function (e) { if (!S.d) $('#main').innerHTML = '<div class="empty">Could not load the issues: ' + esc(e.message) + '</div>'; else fail(e); });
  return S.fresh;
}
/* other people's changes: quiet refresh every 2 minutes while the page is open, and when you come back to it */
function quietRefresh() {
  if (document.hidden || S.editor || !S.d || /PASTE/.test(API_URL)) return;
  api('listIssues', []).then(function (list) { S.d.issues = list; cacheSet('boot', S.d); if (!S.editor) render(); }).catch(function () { });
}
setInterval(quietRefresh, 120000);
document.addEventListener('visibilitychange', function () { if (!document.hidden) quietRefresh(); });
$('#fab').onclick = function () { newIssue(); };
startPage(run);
