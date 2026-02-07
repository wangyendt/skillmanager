const {
  createPrompt,
  useState,
  useKeypress,
  usePagination,
  usePrefix,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isEnterKey
} = require('@inquirer/core');
const colors = require('yoctocolors-cjs');

function groupSkills(skills) {
  const bySource = new Map();
  for (const skill of skills) {
    const key = skill.sourceName || skill.sourceId || 'unknown';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(skill);
  }
  for (const [key, list] of bySource.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    bySource.set(key, list);
  }
  return Array.from(bySource.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function buildItems(skills) {
  const grouped = groupSkills(skills);
  const items = [];
  let groupIndex = 0;
  for (const [sourceName, list] of grouped) {
    items.push({ type: 'separator', label: `-- ${sourceName} --`, groupIndex });
    for (const skill of list) {
      items.push({
        type: 'choice',
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        groupIndex
      });
    }
    groupIndex += 1;
  }
  return items;
}

function getSelectableIndexes(items) {
  const indexes = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'choice') indexes.push(i);
  }
  return indexes;
}

function findNextSelectable(items, startIndex, direction) {
  const step = direction >= 0 ? 1 : -1;
  for (let i = startIndex + step; i >= 0 && i < items.length; i += step) {
    if (items[i].type === 'choice') return i;
  }
  return null;
}

function findGroupStart(items, groupIndex) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'choice' && items[i].groupIndex === groupIndex) return i;
  }
  return null;
}

const promptSkillSelection = createPrompt((config, done) => {
  const items = buildItems(config.skills || []);
  const selectableIndexes = getSelectableIndexes(items);
  const firstSelectable = selectableIndexes[0] ?? 0;
  const lastSelectable = selectableIndexes[selectableIndexes.length - 1] ?? 0;
  const [activeIndex, setActiveIndex] = useState(firstSelectable);
  const [status, setStatus] = useState('idle');
  const [selectedSet, setSelectedSet] = useState(
    new Set(Array.isArray(config.initialSelectedIds) ? config.initialSelectedIds : [])
  );

  const moveToIndex = (idx) => {
    if (idx == null) return;
    if (items[idx]?.type !== 'choice') return;
    setActiveIndex(idx);
  };

  const moveBy = (dir) => {
    const next = findNextSelectable(items, activeIndex, dir);
    if (next != null) {
      setActiveIndex(next);
      return;
    }
    // loop to start/end
    setActiveIndex(dir > 0 ? firstSelectable : lastSelectable);
  };

  const moveGroup = (dir) => {
    const currentGroup = items[activeIndex]?.groupIndex ?? 0;
    const maxGroup = Math.max(0, ...items.map((i) => i.groupIndex ?? 0));
    const nextGroup = dir > 0 ? (currentGroup + 1 > maxGroup ? 0 : currentGroup + 1) : currentGroup - 1 < 0 ? maxGroup : currentGroup - 1;
    moveToIndex(findGroupStart(items, nextGroup));
  };

  const toggleActive = () => {
    const item = items[activeIndex];
    if (!item || item.type !== 'choice') return;
    const next = new Set(selectedSet);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    setSelectedSet(next);
  };

  const selectAll = () => {
    const next = new Set(selectedSet);
    for (const idx of selectableIndexes) next.add(items[idx].id);
    setSelectedSet(next);
  };

  const invertAll = () => {
    const next = new Set();
    for (const idx of selectableIndexes) {
      const id = items[idx].id;
      if (!selectedSet.has(id)) next.add(id);
    }
    setSelectedSet(next);
  };

  useKeypress((key) => {
    const keyName = key?.name || key?.sequence;
    if (isUpKey(key)) return moveBy(-1);
    if (isDownKey(key)) return moveBy(1);
    if (isSpaceKey(key)) return toggleActive();
    if (isEnterKey(key)) {
      setStatus('done');
      return done(Array.from(selectedSet));
    }
    if (keyName === 'escape') {
      setStatus('done');
      return done(null);
    }
    if (keyName === 'a') return selectAll();
    if (keyName === 'i') return invertAll();
    if (keyName === 'h') return moveToIndex(firstSelectable);
    if (keyName === 'e') return moveToIndex(lastSelectable);
    if (keyName === '[') return moveGroup(-1);
    if (keyName === ']') return moveGroup(1);
  });

  const prefix = usePrefix({ status });
  const titleText = config.title || config.message || 'Select skills to install';
  const total = selectableIndexes.length;
  const selected = selectedSet.size;
  const counter = colors.dim(`${selected} / ${total} selected`);
  const message = `${colors.bold(titleText)}  ${counter}`;
  const activeItem = items[activeIndex];
  const desc =
    activeItem?.type === 'choice' && activeItem.description
      ? `\n${colors.yellow(activeItem.description.trim())}`
      : '';

  const page = usePagination({
    items,
    active: activeIndex,
    pageSize: config.pageSize || 18,
    loop: false,
    renderItem: ({ item, index, isActive }) => {
      if (item.type === 'separator') {
        return `\n  ${colors.bold(colors.cyan(item.label))}`;
      }
      const cursor = isActive ? colors.cyan('>') : ' ';
      const isChecked = selectedSet.has(item.id);
      const dot = isChecked ? colors.green('●') : colors.dim('○');
      const label = isChecked ? colors.green(item.name) : isActive ? colors.white(item.name) : colors.dim(item.name);
      return `${cursor} ${dot} ${label}`;
    }
  });

  const help =
    '\n' +
    colors.dim('↑↓ 选择 · 空格 勾选 · a 全选 · i 反选 · h 顶部 · e 底部 · [ ] 切组 · Esc 退出 · ⏎ 确认');

  if (status === 'done') {
    return `${prefix} ${colors.bold(titleText)}  ${colors.green(`✔ ${selected} skills selected`)}`;
  }

  return `${prefix} ${message}\n${page}${desc}${help}`;
});

async function promptSkillSelectionWrapper({ title, skills, initialSelectedIds }) {
  const chosen = await promptSkillSelection({
    title,
    skills,
    initialSelectedIds
  });
  if (chosen == null) return null;
  return Array.isArray(chosen) ? chosen : [];
}

module.exports = { promptSkillSelection: promptSkillSelectionWrapper };
