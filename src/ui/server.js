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
    header { position: sticky; top: 0; z-index: 20; backdrop-filter: blur(8px); background: rgba(11,18,32,0.88); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 14px 16px; }
    h1 { font-size: 16px; margin: 0 0 6px; font-weight: 650; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    input[type="search"]{ width: min(520px, 100%); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e7eaf0; }
    button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08); color: #e7eaf0; cursor: pointer; }
    button.primary { background: #3b82f6; border-color: rgba(59,130,246,0.6); }
    button.tab { padding: 8px 12px; border-radius: 999px; }
    button.tab.active { background: #22c55e; border-color: rgba(34,197,94,0.6); color: #07130a; font-weight: 700; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    main { padding: 14px 16px 64px; }
    .workspace { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 14px; align-items: start; }
    .card { border: 1px solid rgba(255,255,255,0.10); border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.03); }
    .cardHead { display:flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 650; }
    .cardBody { padding: 10px 12px; }
    .cardBody + .cardBody { border-top: 1px solid rgba(255,255,255,0.08); }
    .meta { opacity: 0.8; font-size: 12px; }
    .tabs { display: flex; gap: 8px; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; }
    .list { display: grid; grid-template-columns: 1fr; max-height: calc(100vh - 300px); overflow: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; }
    .item { display:flex; gap: 10px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); }
    .item:first-child { border-top: 0; }
    .name { font-weight: 600; }
    .desc { opacity: 0.85; font-size: 12px; margin-top: 2px; word-break: break-word; }
    .right { margin-left: auto; display:flex; gap: 8px; align-items: center; }
    .pill { font-size: 11px; opacity: 0.85; border: 1px solid rgba(255,255,255,0.14); padding: 3px 8px; border-radius: 999px; }
    .empty { padding: 20px; text-align: center; opacity: 0.8; font-size: 13px; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(11,18,32,0.92); border-top: 1px solid rgba(255,255,255,0.08); padding: 10px 16px; display:flex; justify-content: space-between; align-items: center; gap: 12px; }
    .status { font-size: 12px; opacity: 0.9; }
    .counts { display: flex; gap: 8px; align-items: center; }
    a { color: #93c5fd; }
    @media (max-width: 980px) {
      .workspace { grid-template-columns: 1fr; }
      .list { max-height: 40vh; }
    }
  </style>
</head>
<body>
  <header>
    <h1>skillmanager 选择要安装/卸载的内容</h1>
    <div class="meta">左侧选择安装目标 agents，右侧按来源标签高效筛选 skills。</div>
  </header>
  <main>
    <div class="workspace">
      <section class="card">
        <div class="cardHead">
          <span>Supported Agents</span>
          <span class="meta" id="agentsMeta"></span>
        </div>
        <div class="cardBody">
          <div class="row">
            <button id="agentsAll">全选</button>
            <button id="agentsNone">全不选</button>
            <button id="agentsInvert">反选</button>
          </div>
        </div>
        <div class="cardBody">
          <div class="list" id="agentsApp"></div>
        </div>
      </section>

      <section class="card">
        <div class="cardHead">
          <span>Skills</span>
          <span class="meta" id="meta"></span>
        </div>
        <div class="cardBody">
          <div class="row">
            <input id="q" type="search" placeholder="搜索 skill name / description / source..." />
            <button id="all">全选可见</button>
            <button id="none">全不选可见</button>
            <button id="invert">反选可见</button>
          </div>
        </div>
        <div class="cardBody">
          <div class="tabs" id="sourceTabs"></div>
        </div>
        <div class="cardBody">
          <div class="list" id="skillsApp"></div>
        </div>
      </section>
    </div>
  </main>
  <div class="footer">
    <div class="status" id="status">加载中…</div>
    <div class="right">
      <div class="counts">
        <span class="pill" id="agentCount">0 agents</span>
        <span class="pill" id="skillCount">0 skills</span>
      </div>
      <button class="primary" id="submit" disabled>保存并继续</button>
    </div>
  </div>
<script>
  const state = {
    skills: [],
    selectedSkills: new Set(),
    agents: [],
    selectedAgents: new Set(),
    query: '',
    activeSource: '__all__'
  };

  const elSkillsApp = document.getElementById('skillsApp');
  const elAgentsApp = document.getElementById('agentsApp');
  const elSourceTabs = document.getElementById('sourceTabs');
  const elQ = document.getElementById('q');
  const elAll = document.getElementById('all');
  const elNone = document.getElementById('none');
  const elInvert = document.getElementById('invert');
  const elAgentsAll = document.getElementById('agentsAll');
  const elAgentsNone = document.getElementById('agentsNone');
  const elAgentsInvert = document.getElementById('agentsInvert');
  const elSubmit = document.getElementById('submit');
  const elStatus = document.getElementById('status');
  const elSkillCount = document.getElementById('skillCount');
  const elAgentCount = document.getElementById('agentCount');
  const elMeta = document.getElementById('meta');
  const elAgentsMeta = document.getElementById('agentsMeta');

  function norm(s){ return (s || '').toLowerCase(); }

  function allSources() {
    const map = new Map();
    for (const s of state.skills) {
      const id = String(s.sourceId || 'unknown');
      if (!map.has(id)) map.set(id, { sourceId: id, sourceName: s.sourceName || id });
    }
    return Array.from(map.values()).sort((a, b) => String(a.sourceName).localeCompare(String(b.sourceName)));
  }

  function skillsAfterQuery() {
    return state.skills.filter((skill) => {
      if (!state.query) return true;
      const q = state.query;
      return (
        norm(skill.name).includes(q) ||
        norm(skill.description).includes(q) ||
        norm(skill.sourceName).includes(q) ||
        norm(skill.sourceId).includes(q)
      );
    });
  }

  function visibleSkills() {
    const base = skillsAfterQuery();
    if (!state.activeSource || state.activeSource === '__all__') return base;
    return base.filter((s) => String(s.sourceId) === state.activeSource);
  }

  function renderAgents() {
    elAgentsApp.innerHTML = '';
    if (!state.agents.length) {
      elAgentsApp.innerHTML = '<div class="empty">无可选 agent</div>';
      return;
    }

    for (const a of state.agents) {
      const row = document.createElement('div');
      row.className = 'item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selectedAgents.has(a.id);
      cb.onchange = () => {
        if (cb.checked) state.selectedAgents.add(a.id); else state.selectedAgents.delete(a.id);
        updateFooter();
      };

      const text = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = a.name;
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = 'project: ' + (a.projectPath || '') + ' | global: ' + (a.globalPath || '');
      text.appendChild(name);
      text.appendChild(desc);

      const right = document.createElement('div');
      right.className = 'right';
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = a.id;
      right.appendChild(pill);

      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(right);
      elAgentsApp.appendChild(row);
    }
    elAgentsMeta.textContent = state.selectedAgents.size + ' / ' + state.agents.length + ' selected';
  }

  function renderSourceTabs() {
    elSourceTabs.innerHTML = '';
    const filteredCount = skillsAfterQuery().length;
    const allTab = document.createElement('button');
    allTab.className = 'tab' + (state.activeSource === '__all__' ? ' active' : '');
    allTab.textContent = '全部来源 (' + filteredCount + ')';
    allTab.onclick = () => {
      state.activeSource = '__all__';
      renderSourceTabs();
      renderSkills();
      updateFooter();
    };
    elSourceTabs.appendChild(allTab);

    for (const source of allSources()) {
      const count = skillsAfterQuery().filter((s) => String(s.sourceId) === source.sourceId).length;
      const tab = document.createElement('button');
      tab.className = 'tab' + (state.activeSource === source.sourceId ? ' active' : '');
      tab.textContent = source.sourceName + ' (' + count + ')';
      tab.onclick = () => {
        state.activeSource = source.sourceId;
        renderSourceTabs();
        renderSkills();
        updateFooter();
      };
      elSourceTabs.appendChild(tab);
    }
  }

  function renderSkills() {
    const filtered = visibleSkills();
    const sorted = [...filtered].sort((a, b) => {
      const aSource = String(a.sourceName || a.sourceId || '');
      const bSource = String(b.sourceName || b.sourceId || '');
      if (aSource !== bSource) return aSource.localeCompare(bSource);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    elSkillsApp.innerHTML = '';
    if (!sorted.length) {
      elSkillsApp.innerHTML = '<div class="empty">当前筛选条件下无 skills</div>';
      const totalAfterQuery = skillsAfterQuery().length;
      elMeta.textContent = '0 / ' + totalAfterQuery + ' shown';
      return;
    }

    for (const s of sorted) {
      const row = document.createElement('div');
      row.className = 'item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selectedSkills.has(s.id);
      cb.onchange = () => {
        if (cb.checked) state.selectedSkills.add(s.id); else state.selectedSkills.delete(s.id);
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
      pill.textContent = s.sourceName || s.sourceId;
      right.appendChild(pill);

      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(right);
      elSkillsApp.appendChild(row);
    }
    const totalAfterQuery = skillsAfterQuery().length;
    elMeta.textContent = sorted.length + ' / ' + totalAfterQuery + ' shown';
  }

  function canSubmit() {
    const agentReady = state.agents.length === 0 || state.selectedAgents.size > 0;
    const skillReady = state.selectedSkills.size > 0;
    return agentReady && skillReady;
  }

  function updateFooter() {
    elAgentCount.textContent = state.selectedAgents.size + ' agents';
    elSkillCount.textContent = state.selectedSkills.size + ' skills';
    elSubmit.disabled = !canSubmit();
    elAgentsMeta.textContent = state.selectedAgents.size + ' / ' + state.agents.length + ' selected';
  }

  async function load() {
    const r = await fetch('/api/skills');
    const j = await r.json();
    state.skills = j.skills || [];
    state.selectedSkills = new Set(j.selectedSkillIds || []);
    state.agents = j.agents || [];
    state.selectedAgents = new Set(j.selectedAgentIds || []);
    if (state.skills.length) {
      const sourceIds = new Set(state.skills.map((s) => String(s.sourceId || '')));
      if (!sourceIds.has(state.activeSource)) state.activeSource = '__all__';
    }
    renderAgents();
    renderSourceTabs();
    renderSkills();
    updateFooter();
    elStatus.textContent = '就绪：请选择 agents + skills，然后点击“保存并继续”';
  }

  elQ.oninput = () => { state.query = norm(elQ.value).trim(); renderSourceTabs(); renderSkills(); };
  elAll.onclick = () => {
    for (const s of visibleSkills()) state.selectedSkills.add(s.id);
    updateFooter();
    renderSkills();
  };
  elNone.onclick = () => {
    for (const s of visibleSkills()) state.selectedSkills.delete(s.id);
    updateFooter();
    renderSkills();
  };
  elInvert.onclick = () => {
    for (const s of visibleSkills()) {
      if (state.selectedSkills.has(s.id)) state.selectedSkills.delete(s.id);
      else state.selectedSkills.add(s.id);
    }
    updateFooter();
    renderSkills();
  };

  elAgentsAll.onclick = () => { for (const a of state.agents) state.selectedAgents.add(a.id); updateFooter(); renderAgents(); };
  elAgentsNone.onclick = () => { state.selectedAgents.clear(); updateFooter(); renderAgents(); };
  elAgentsInvert.onclick = () => {
    const next = new Set();
    for (const a of state.agents) if (!state.selectedAgents.has(a.id)) next.add(a.id);
    state.selectedAgents = next;
    updateFooter();
    renderAgents();
  };

  elSubmit.onclick = async () => {
    elSubmit.disabled = true;
    elStatus.textContent = '已提交，正在处理…（你可以回到终端查看后续输出）';
    const body = {
      selectedSkillIds: Array.from(state.selectedSkills),
      selectedAgentIds: Array.from(state.selectedAgents)
    };
    const payload = JSON.stringify(body);
    try {
      let beaconOk = false;
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          beaconOk = navigator.sendBeacon('/api/submit', blob);
        }
      } catch {}

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
      setTimeout(() => {
        try { window.close(); } catch {}
      }, 500);
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

  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

async function launchSelectionUi({ skills, selectedSkillIds, agents, selectedAgentIds, title }) {
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
      selectedSkillIds,
      agents: Array.isArray(agents) ? agents : [],
      selectedAgentIds: Array.isArray(selectedAgentIds) ? selectedAgentIds : []
    });
  });

  app.post('/api/submit', (req, res) => {
    const ids = Array.isArray(req.body?.selectedSkillIds) ? req.body.selectedSkillIds : [];
    const agentIds = Array.isArray(req.body?.selectedAgentIds) ? req.body.selectedAgentIds : [];
    if (!submittedOnce) {
      submittedOnce = true;
      resolveSubmit({ selectedSkillIds: ids, selectedAgentIds: agentIds });
    }
    res.json({ ok: true });
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
  await new Promise((r) => setTimeout(r, 800));
  await new Promise((resolve) => server.close(() => resolve()));
  return chosen;
}

module.exports = { launchSelectionUi };
