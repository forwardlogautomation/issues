/* =====================================================================
   Forwardlog Issue Log – Apps Script backend (JSON API for GitHub Pages)
   Frontend: https://forwardlogautomation.github.io/issues/
   Bound to the Google Sheet "Forwardlog Issue Log Portal".

   One-time setup (see README.md):
     1. Script properties: CLIENT_ID (same Google client ID as the other portals),
        optional API_URL (the /exec URL, for the control-centre health check).
     2. Run setup() once from the editor: creates the tabs and copies the issues
        from the old Claude tracker (Seed.gs) into the Issues tab.
     3. Deploy > New deployment > Web app: Execute as Me, Who has access: Anyone.
   ===================================================================== */

var ALLOWED_DOMAIN = 'forwardlogauto.com';
var ADMIN_SHEET_ID = '1uylSkGNDrHcwePWyXarCyxrJT8PBlCNbu1KJRK06DAg';   // Forwardlog Admin Portal (control centre)
var PORTAL = 'issues';
var DRIVE_FOLDER_ID = '1Mdb6S-YoSVi3a-oFMNNOanqDZPZ-i4Kc';             // "Project Issues & Action Plan" folder
var SITE_URL = 'https://forwardlogautomation.github.io/issues/';

var COLS = ['id', 'no', 'client', 'client_order', 'project', 'project_cn', 'cat_en', 'cat_cn', 'status', 'recorded_at',
  'desc_en', 'desc_cn', 'act_en', 'act_cn', 'rem_en', 'rem_cn', 'created_at', 'created_by', 'updated_at', 'updated_by'];
var CAT_CN = { Sorting: '分拣', Printing: '打印', Hardware: '硬件', Integration: '系统对接', Interface: '界面', Improvement: '改进' };
var TEXT_PAIRS = ['desc', 'act', 'rem'];

var AUTH_EMAIL = '';

/* ---------------- entry points ---------------- */
function doGet() {
  return HtmlService.createHtmlOutput('<p style="font:15px sans-serif">The Issue Log has moved: <a href="' + SITE_URL + '">' + SITE_URL + '</a></p>');
}

function doPost(e) {
  var fns = { bootstrap: bootstrap_, listIssues: listIssues_, saveIssue: saveIssue_, deleteIssue: deleteIssue_, saveToDrive: saveToDrive_, ping: ping_ };
  var OPEN_FNS = { ping: 1 };                    // everything else needs Google sign-in and portal access
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var f = fns[req.fn]; if (!f) throw new Error('Unknown function: ' + req.fn);
    AUTH_EMAIL = '';
    if (!OPEN_FNS[req.fn]) {
      AUTH_EMAIL = verifyUser_(req.token);
      if (!AUTH_EMAIL) throw new Error('LOGIN_REQUIRED');
      if (!portalAccess_(AUTH_EMAIL, PORTAL).ok) throw new Error('You do not have access to the Issue Log. Ask an admin to add you in Settings (control centre).');
    }
    out = { ok: true, result: f.apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- auth (Google Identity Services ID token) ---------------- */
function verifyUser_(idToken) {
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId) throw new Error('The Issue Log is not set up yet (script property CLIENT_ID is missing).');   // fail closed
  if (!idToken) throw new Error('LOGIN_REQUIRED');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 43);
  var hit = cache.get(key); if (hit) return hit;
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('LOGIN_REQUIRED');
  var t = JSON.parse(r.getContentText()), left = Number(t.exp) * 1000 - Date.now();
  if (t.aud !== clientId || String(t.email_verified) !== 'true' || left <= 0) throw new Error('LOGIN_REQUIRED');
  if (t.hd !== ALLOWED_DOMAIN) throw new Error('Please sign in with your @' + ALLOWED_DOMAIN + ' account');
  if (left > 70000) cache.put(key, t.email, Math.min(3000, Math.floor(left / 1000) - 60));
  return t.email;
}

/* access from the control centre (Settings). Never fails open. */
function portalAccess_(email, portal) {
  email = String(email || '').toLowerCase().trim();
  var cache = CacheService.getScriptCache(), key = 'acc_' + portal + '_' + email;
  var hit = cache.get(key); if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
  var rows = function (n) { var sh = ss.getSheetByName(n); return sh ? sh.getDataRange().getValues() : [[]]; };
  var globalAdmin = rows('Admins').slice(1).some(function (r) { return String(r[0]).toLowerCase().trim() === email; });
  var mode = 'domain';
  rows('Settings').slice(1).forEach(function (r) { if (String(r[0]) === portal && String(r[1]) === 'accessMode') mode = String(r[2]).trim(); });
  var acc = rows('Access'), col = acc[0].indexOf(portal), val = '';
  if (col >= 0) acc.slice(1).forEach(function (r) { if (String(r[0]).toLowerCase().trim() === email) val = String(r[col]).toLowerCase().trim(); });
  var admin = globalAdmin || val === 'admin';
  var ok = admin || (mode === 'listed' ? val === 'allow' : val !== 'block');
  var res = { ok: ok, admin: admin };
  cache.put(key, JSON.stringify(res), 120);   // control-centre changes apply within 2 minutes
  return res;
}
function isAdmin_() { return !!AUTH_EMAIL && portalAccess_(AUTH_EMAIL, PORTAL).admin; }

/* ---------------- sheet helpers ---------------- */
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(name, head) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#5F7A61').setFontColor('#ffffff'); sh.setFrozenRows(1); }
  return sh;
}
function issuesSheet_() { return sheet_('Issues', COLS); }
/* read by header name, never by position */
function readIssues_() {
  var sh = issuesSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String), out = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { if (h) o[h] = cell_(v[i][j]); });
    if (o.no) out.push(o);
  }
  return { sh: sh, head: head, rows: out };
}
function cell_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  return x === null || x === undefined ? '' : x;
}
function clean_(o) { var c = {}; COLS.forEach(function (k) { c[k] = o[k] === undefined ? '' : o[k]; }); c.client_order = Number(c.client_order) || 99; return c; }
function log_(action, id, detail) {
  try { sheet_('Log', ['ts', 'email', 'action', 'id', 'detail']).appendRow([new Date(), AUTH_EMAIL, action, id, String(detail || '').slice(0, 500)]); } catch (e) { }
}

/* ---------------- API ---------------- */
function ping_() { return { ok: true, at: new Date().toISOString() }; }

function bootstrap_() {
  var p = PropertiesService.getScriptProperties();
  var drive = p.getProperty('DRIVE_FILE') ? JSON.parse(p.getProperty('DRIVE_FILE')) : null;
  return { issues: listIssues_(), me: { email: AUTH_EMAIL, admin: isAdmin_() }, drive: drive, folderUrl: 'https://drive.google.com/drive/folders/' + DRIVE_FOLDER_ID, catCn: CAT_CN };
}
function listIssues_() { return readIssues_().rows.map(clean_); }

/* d: the issue fields. isNew: true when adding. base: the updated_at the editor started from (conflict check). */
function saveIssue_(d, isNew, base) {
  d = d || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = readIssues_(), no = String(d.no || '').trim();
    var cur = all.rows.filter(function (r) { return String(r.id) === no || String(r.no) === no; })[0];
    if (isNew) {
      if (!/^[A-Za-z0-9_\-.]{1,20}$/.test(no)) throw new Error('No. can use letters, numbers and dashes only, e.g. AD-11.');
      if (cur) throw new Error(no + ' already exists. Pick another No.');
    } else {
      if (!cur) throw new Error(no + ' was not found. It may have been deleted.');
      if (base && String(cur.updated_at) && String(cur.updated_at) !== String(base)) throw new Error(no + ' was changed by ' + (cur.updated_by || 'someone') + ' just now. Close it and open it again to see their change.');
    }
    if (!String(d.client || '').trim()) throw new Error('Pick a client.');
    if (!String(d.cat_en || '').trim()) throw new Error('Enter a category.');
    var now = new Date().toISOString();
    var it = clean_(cur || {});
    ['client', 'client_order', 'project', 'project_cn', 'cat_en', 'cat_cn', 'status', 'recorded_at',
      'desc_en', 'desc_cn', 'act_en', 'act_cn', 'rem_en', 'rem_cn'].forEach(function (k) { if (d[k] !== undefined) it[k] = typeof d[k] === 'string' ? d[k].trim() : d[k]; });
    it.status = it.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
    if (isNew) { it.id = no; it.no = no; it.created_at = now; it.created_by = AUTH_EMAIL; }
    if (!it.recorded_at) it.recorded_at = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
    if (!it.cat_cn) it.cat_cn = CAT_CN[it.cat_en] || '';
    translate_(it, cur);
    it.updated_at = now; it.updated_by = AUTH_EMAIL;
    var head = all.head, row = head.map(function (h) { return it[h] === undefined ? '' : it[h]; });
    var sh = all.sh;
    if (cur) sh.getRange(cur._row, 1, 1, head.length).setValues([row]);
    else sh.appendRow(row);
    log_(isNew ? 'add' : 'edit', no, it.status);
    return it;
  } finally { lock.releaseLock(); }
}

/* fill the missing language with Google Translate (built into Apps Script, no key needed).
   Same rule as the old tracker: translate when one side is empty, or when only one side was changed. */
function translate_(it, prev) {
  prev = prev || {};
  var pairs = TEXT_PAIRS.map(function (k) { return [k + '_en', k + '_cn']; }).concat([['cat_en', 'cat_cn'], ['project', 'project_cn']]);
  pairs.forEach(function (p) {
    var en = String(it[p[0]] || '').trim(), cn = String(it[p[1]] || '').trim();
    var enCh = en !== String(prev[p[0]] || '').trim(), cnCh = cn !== String(prev[p[1]] || '').trim();
    try {
      if (en && (!cn || (enCh && !cnCh))) it[p[1]] = LanguageApp.translate(en, 'en', 'zh-CN');
      else if (cn && (!en || (cnCh && !enCh))) it[p[0]] = LanguageApp.translate(cn, 'zh-CN', 'en');
    } catch (e) { /* keep as typed if translation is unavailable */ }
  });
}

function deleteIssue_(no) {
  if (!isAdmin_()) throw new Error('Only Issue Log admins can delete an issue. Change its status to CLOSED instead.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = readIssues_(), cur = all.rows.filter(function (r) { return String(r.id) === String(no) || String(r.no) === String(no); })[0];
    if (!cur) return true;
    all.sh.deleteRow(cur._row);
    log_('delete', no, cur.desc_en || cur.desc_cn);
    return true;
  } finally { lock.releaseLock(); }
}

/* Excel copy in the Drive folder: one file, replaced each time */
function saveToDrive_(b64, title) {
  if (!b64) throw new Error('Nothing to save.');
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', String(title || 'Project Issues & Action Plan') + '.xlsx');
  var file = folder.createFile(blob);
  var p = PropertiesService.getScriptProperties(), old = p.getProperty('DRIVE_FILE') ? JSON.parse(p.getProperty('DRIVE_FILE')) : null;
  if (old && old.file_id && old.file_id !== file.getId()) { try { DriveApp.getFileById(old.file_id).setTrashed(true); } catch (e) { } }
  var meta = { file_id: file.getId(), url: file.getUrl(), saved_at: new Date().toISOString(), saved_by: AUTH_EMAIL, title: file.getName() };
  p.setProperty('DRIVE_FILE', JSON.stringify(meta));
  log_('drive', meta.file_id, meta.title);
  return meta;
}

/* ---------------- one-time setup (run from the editor) ---------------- */
function setup() {
  var sh = issuesSheet_();
  sheet_('Log', ['ts', 'email', 'action', 'id', 'detail']);
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SHEET_ID')) p.setProperty('SHEET_ID', ss_().getId());
  var have = {}; readIssues_().rows.forEach(function (r) { have[r.no] = 1; });
  var add = (typeof SEED !== 'undefined' ? SEED : []).filter(function (s) { return s.no && !have[s.no]; }).map(function (s) {
    var it = clean_(s); it.id = s.no; it.created_at = s.updated_at || ''; it.created_by = 'Imported from the Claude tracker';
    it.updated_by = it.updated_by || 'Imported from the Claude tracker';
    return COLS.map(function (k) { return it[k]; });
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, COLS.length).setValues(add);
  sh.getRange(2, COLS.indexOf('recorded_at') + 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
  sh.setColumnWidths(COLS.indexOf('desc_en') + 1, 6, 260);
  Logger.log('Issues tab ready. Imported ' + add.length + ' issue(s). Sheet: ' + ss_().getUrl());
}
