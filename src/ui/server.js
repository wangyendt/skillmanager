const express = require('express');
const { spawn } = require('child_process');

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtml({ title }) {
  const t = htmlEscape(title || 'skillmanager');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; margin: 0; background: #0b1220; color: #e7eaf0; }
    header { position: sticky; top: 0; backdrop-filter: blur(8px); background: rgba(11,18,32,0.85); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 14px 16px; }
    h1 { font-size: 16px; margin: 0 0 10px; font-weight: 650; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    input[type="search"]{ width: min(520px, 100%); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e7eaf0; }
    button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08); color: #e7eaf0; cursor: pointer; }
    button.primary { background: #3b82f6; border-color: rgba(59,130,246,0.6); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    main { padding: 14px 16px 40px; }
    .meta { opacity: 0.8; font-size: 12px; }
    .group { margin-top: 16px; border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; overflow: hidden; }
    .groupHeader { display:flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .groupTitle { font-weight: 650; }
    .list { display: grid; grid-template-columns: 1fr; }
    .item { display:flex; gap: 10px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); }
    .item:first-child { border-top: 0; }
    .name { font-weight: 600; }
    .desc { opacity: 0.85; font-size: 12px; margin-top: 2px; }
    .right { margin-left: auto; display:flex; gap: 8px; align-items: center; }
    .pill { font-size: 11px; opacity: 0.85; border: 1px solid rgba(255,255,255,0.14); padding: 3px 8px; border-radius: 999px; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(11,18,32,0.92); border-top: 1px solid rgba(255,255,255,0.08); padding: 10px 16px; display:flex; justify-content: space-between; align-items: center; gap: 12px; }
    .status { font-size: 12px; opacity: 0.9; }
    a { color: #93c5fd; }
  </style>
</head>
<body>
  <header>
    <h1>skillmanager 选择要安装的 skills</h1>
    <div class="row">
      <input id="q" type="search" placeholder="搜索 name / description / source..." />
      <button id="all">全选</button>
      <button id="none">全不选</button>
      <button id="invert">反选</button>
      <span class="meta" id="meta"></span>
    </div>
  </header>
  <main id="app"></main>
  <div class="footer">
    <div class="status" id="status">加载中…</div>
    <div class="right">
      <span class="pill" id="count">0 selected</span>
      <button class="primary" id="submit" disabled>保存并继续</button>
    </div>
  </div>
<script>
  const state = {
    skills: [],
    selected: new Set(),
    query: ''
  };

  const elApp = document.getElementById('app');
  const elQ = document.getElementById('q');
  const elAll = document.getElementById('all');
  const elNone = document.getElementById('none');
  const elInvert = document.getElementById('invert');
  const elSubmit = document.getElementById('submit');
  const elStatus = document.getElementById('status');
  const elCount = document.getElementById('count');
  const elMeta = document.getElementById('meta');

  function norm(s){ return (s || '').toLowerCase(); }

  function matches(skill) {
    if (!state.query) return true;
    const q = state.query;
    return norm(skill.name).includes(q) || norm(skill.description).includes(q) || norm(skill.sourceName).includes(q) || norm(skill.sourceId).includes(q);
  }

  function groupBySource(skills) {
    const map = new Map();
    for (const s of skills) {
      const k = s.sourceId;
      if (!map.has(k)) map.set(k, { sourceId: s.sourceId, sourceName: s.sourceName, items: [] });
      map.get(k).items.push(s);
    }
    return Array.from(map.values());
  }

  function render() {
    const filtered = state.skills.filter(matches);
    const groups = groupBySource(filtered);
    elApp.innerHTML = '';

    for (const g of groups) {
      const group = document.createElement('div');
      group.className = 'group';

      const header = document.createElement('div');
      header.className = 'groupHeader';
      header.innerHTML = '<div class="groupTitle"></div><div class="right"><button class="btnSelAll">本源全选</button><button class="btnSelNone">本源全不选</button></div>';
      header.querySelector('.groupTitle').textContent = g.sourceName + ' (' + g.items.length + ')';

      header.querySelector('.btnSelAll').onclick = () => { for (const s of g.items) state.selected.add(s.id); updateFooter(); render(); };
      header.querySelector('.btnSelNone').onclick = () => { for (const s of g.items) state.selected.delete(s.id); updateFooter(); render(); };

      const list = document.createElement('div');
      list.className = 'list';

      for (const s of g.items) {
        const row = document.createElement('div');
        row.className = 'item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.selected.has(s.id);
        cb.onchange = () => {
          if (cb.checked) state.selected.add(s.id); else state.selected.delete(s.id);
          updateFooter();
        };

        const text = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = s.name;
        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = s.description || '';
        text.appendChild(name);
        text.appendChild(desc);

        const right = document.createElement('div');
        right.className = 'right';
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = s.sourceId;
        right.appendChild(pill);

        row.appendChild(cb);
        row.appendChild(text);
        row.appendChild(right);
        list.appendChild(row);
      }

      group.appendChild(header);
      group.appendChild(list);
      elApp.appendChild(group);
    }

    elMeta.textContent = filtered.length + ' / ' + state.skills.length + ' shown';
  }

  function updateFooter() {
    elCount.textContent = state.selected.size + ' selected';
    elSubmit.disabled = state.selected.size === 0;
  }

  async function load() {
    const r = await fetch('/api/skills');
    const j = await r.json();
    state.skills = j.skills || [];
    state.selected = new Set(j.selectedSkillIds || []);
    updateFooter();
    render();
    elStatus.textContent = '就绪：请选择并点击“保存并继续”';
  }

  elQ.oninput = () => { state.query = norm(elQ.value).trim(); render(); };
  elAll.onclick = () => { for (const s of state.skills) state.selected.add(s.id); updateFooter(); render(); };
  elNone.onclick = () => { state.selected.clear(); updateFooter(); render(); };
  elInvert.onclick = () => {
    const next = new Set();
    for (const s of state.skills) if (!state.selected.has(s.id)) next.add(s.id);
    state.selected = next;
    updateFooter();
    render();
  };

  elSubmit.onclick = async () => {
    elSubmit.disabled = true;
    elStatus.textContent = '已提交，正在处理…（你可以回到终端查看后续安装输出）';
    const body = { selectedSkillIds: Array.from(state.selected) };
    const payload = JSON.stringify(body);
    try {
      // Best-effort: ensure request reaches server even if page closes quickly.
      let beaconOk = false;
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          beaconOk = navigator.sendBeacon('/api/submit', blob);
        }
      } catch {}

      // Secondary path: fetch. In some cases the server may already close after receiving the beacon;
      // if so, treat fetch failure as non-fatal.
      try {
        await fetch('/api/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true
        });
      } catch (e) {
        if (!beaconOk) throw e;
      }

      elStatus.textContent = '已提交完成：正在关闭页面…（若未自动关闭，请手动关闭此标签页）';
      // Best-effort: browsers often only allow closing windows opened by script.
      setTimeout(() => {
        try { window.close(); } catch {}
      }, 500);

      // Fallback UI if close is blocked
      setTimeout(() => {
        const hint = document.createElement('div');
        hint.style.marginTop = '10px';
        hint.innerHTML = '<button id="closeBtn" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.08);color:#e7eaf0;cursor:pointer;">关闭页面</button>';
        elStatus.appendChild(hint);
        const btn = document.getElementById('closeBtn');
        if (btn) btn.onclick = () => { try { window.close(); } catch {} };
      }, 800);
    } catch (e) {
      elStatus.textContent = '提交失败：' + (e && e.message ? e.message : String(e));
      elSubmit.disabled = false;
    }
  };

  load().catch((e) => {
    elStatus.textContent = '加载失败：' + (e && e.message ? e.message : String(e));
  });
</script>
</body>
</html>`;
}

async function openInBrowser(url) {
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  // best-effort: detached so CLI can keep running
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  // If open command doesn't exist (e.g. minimal Linux without xdg-open), don't crash.
  child.on('error', () => {});
  child.unref();
}

async function launchSelectionUi({ skills, selectedSkillIds, title }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  let resolveSubmit;
  const submitted = new Promise((resolve) => (resolveSubmit = resolve));
  let submittedOnce = false;

  app.get('/', (_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(buildHtml({ title }));
  });

  app.get('/api/skills', (_req, res) => {
    res.json({
      skills,
      selectedSkillIds
    });
  });

  app.post('/api/submit', (req, res) => {
    const ids = Array.isArray(req.body?.selectedSkillIds) ? req.body.selectedSkillIds : [];
    if (!submittedOnce) {
      submittedOnce = true;
      resolveSubmit(ids);
    }
    res.json({ ok: true });
    // graceful shutdown is handled by caller after promise resolves
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;

  // eslint-disable-next-line no-console
  console.log(`\n已启动 Web UI：${url}`);
  // eslint-disable-next-line no-console
  console.log('如果没有自动打开浏览器，请复制上面的地址手动打开；选择完成后点击“保存并继续”，终端才会继续。\n');

  await openInBrowser(url);

  const chosen = await submitted;
  // Give the browser a brief window to finish any in-flight fetch after submit (beacon/fetch race).
  await new Promise((r) => setTimeout(r, 800));
  await new Promise((resolve) => server.close(() => resolve()));
  return chosen;
}

module.exports = { launchSelectionUi };

