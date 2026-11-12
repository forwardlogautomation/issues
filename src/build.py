"""Build issues/index.html from the main page's shared parts (head styles, FL-LOADER v2, header, shared JS)
plus the Issue Log page CSS/JS.  usage: python3 build.py <API_URL>"""
import sys, re, os
D = os.path.dirname(os.path.abspath(__file__))
API = sys.argv[1] if len(sys.argv) > 1 else 'PASTE_EXEC_URL_HERE'
src = open('/home/user/forwardlogautomation.github.io/index.html').read()

head_end = src.index('</style>\n</head>')
head = src[:head_end]
head = head.replace('<title>Forwardlog Automation</title>', '<title>Issues · Issue Log · Forwardlog</title>')
# drop the main-page tile styles (from the tiles block on) – keep the company-style tokens above them
cut = head.index('.tiles{display:grid')
head = head[:cut] + open(os.path.join(D, 'page.css')).read()

body_start = src.index('<body>')
loader_start = src.index('<script>window.FL_LOADER=')
loader_end = src.index('<header class="top">')
loader = src[loader_start:loader_end]
loader = re.sub(r'<script>window\.FL_LOADER=\{.*?\}</script>',
                lambda m: '<script>window.FL_LOADER={"quiet": ["listIssues"], "messages": {"saveIssue": "Saving and translating\\u2026", "saveToDrive": "Saving to Google Drive\\u2026", "deleteIssue": "Deleting\\u2026"}, "app": "Issue Log"}</script>', loader, count=1, flags=re.S)

header = '''<header class="top">
  <a class="logolink" id="logoHome" href="./" aria-label="Home" title="Home"><img class="logo" alt="Forwardlog" src="/logo.png"></a>
  <div id="acct"></div>
  <div class="htitle"><a class="flhub" href="https://forwardlogautomation.github.io/" title="All Forwardlog portals" style="font-size:11px;font-weight:700;letter-spacing:.3px;color:#5F7A61;text-decoration:none;white-space:nowrap;margin-right:8px">&#8962; All portals</a><span class="app">Issue Log</span><h1>Issues &amp; action plan</h1></div>
</header>
<main class="iss" id="main"><div class="empty">Loading…</div></main>
<button class="btn fab" id="fab" type="button">+ New issue</button>
<div id="pdfsheet" aria-hidden="true"></div>
'''

js_start = src.index('<script>\n/* ===== Solution Calc')
js_end = src.index('/* ---- solutions ---- */')
shared = src[js_start:js_end].rstrip() + '\n</script>\n'
shared = shared.replace('/* ===== Solution Calc – shared JS (auth, API, cache, offline queue, helpers) ===== */',
                        '/* ===== Forwardlog portal shared JS (auth, API, cache, helpers) – same as the main page ===== */')
shared = re.sub(r"var API_URL = '[^']*', LOGO_URL = '[^']*',", "var API_URL = '" + API + "',", shared)
shared = shared.replace("var APP_TITLE = 'Forwardlog Automation', K = 'fl_';", "var APP_TITLE = 'Issue Log', K = 'iss_';")
# shared sign-in for every portal lives in 'fl_auth' (K is the page's own prefix for everything else)
shared = shared.replace("ls(K + 'auth'", "ls('fl_auth'")
assert "K + 'auth'" not in shared
assert 'LOGO_URL' not in shared, 'LOGO_URL still referenced'

page = '<script>\n' + open(os.path.join(D, 'page.js')).read() + '</script>\n'
out = head + '</style>\n</head>\n<body>\n' + loader + header + shared + page + '</body>\n</html>\n'
# icons are this repo's own files (already relative: icon-32.png etc.)
open('/home/user/issues/index.html', 'w').write(out)
print('built', len(out), 'bytes')
