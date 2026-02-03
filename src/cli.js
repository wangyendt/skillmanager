#!/usr/bin/env node
/* eslint-disable no-console */

const { Command } = require('commander');

const { bootstrap } = require('./commands/bootstrap');
const { selectUi } = require('./commands/select');
const { where } = require('./commands/where');
const { update } = require('./commands/update');
const { uninstall } = require('./commands/uninstall');
const { webui } = require('./commands/webui');
const { listSources, addSource, removeSource, setEnabled } = require('./commands/source');
const { showConfig, setDefaultProfileCmd, setRemoteProfileUrlCmd, pushProfileCmd, pullProfileCmd } = require('./commands/config');

async function main() {
  const program = new Command();

  program
    .name('skillmanager')
    .description('跨平台 Agent Skills 管理器（基于 openskills）')
    .version(require('../package.json').version);

  program
    .command('install')
    .description('安装 skills：按 sources 配置安装全部，或用 Web UI 选择子集安装。')
    .option('--global', '安装到全局（默认：当前项目）', false)
    .option('--universal', '使用通用目录 .agent/skills（默认：.claude/skills）', false)
    .option('--output <path>', 'sync 输出文件（默认：AGENTS.md）')
    .option('--no-sync', '跳过 openskills sync', false)
    .option('--dry-run', '仅打印将执行的内容，不实际安装', false)
    .option('--concurrency <n>', '选择模式下的并发扫描数（默认：3）', '3')
    .option('--profile <name>', '选择配置名（默认：来自 config 或 SKILLMANAGER_PROFILE 环境变量）')
    .action(async (opts) => {
      await bootstrap(opts);
    });

  program
    .command('webui')
    .description('打开 Web UI：用于选择并安装（install）或选择并卸载（uninstall）。')
    .option('--mode <install|uninstall>', '模式：install（选择并安装）或 uninstall（选择并卸载）', 'install')
    .option('--profile <name>', '作用：install 模式下使用/保存到的 profile（默认：使用默认 profile）')
    .option('--global', '作用：把目标切到全局目录（~/.claude/skills 或 ~/.agent/skills）', false)
    .option('--universal', '作用：使用 .agent/skills（通用 AGENTS.md 场景；默认是 .claude/skills）', false)
    .option('--output <path>', '作用：sync 输出文件路径（默认：AGENTS.md）')
    .option('--no-sync', '作用：不执行 openskills sync（仅安装/卸载，不更新 AGENTS.md）', false)
    .option('--concurrency <n>', '作用：install 模式下并发拉取/扫描来源仓库，提高速度（默认：3）', '3')
    .action(async (opts) => {
      await webui(opts);
    });

  program
    .command('paths')
    .description('打印 skillmanager 的配置/缓存目录，以及 sources.json 位置。')
    .action(async () => {
      await where();
    });

  program
    .command('update')
    .description('更新 skills，并同步生成/更新 AGENTS.md。')
    .option('--global', '安装到全局（默认：当前项目）', false)
    .option('--universal', '使用通用目录 .agent/skills（默认：.claude/skills）', false)
    .option('--output <path>', 'sync 输出文件（默认：AGENTS.md）')
    .option('--no-sync', '跳过 openskills sync', false)
    .option('--profile <name>', '按 profile 选择集更新（会重新安装选中的 skills）')
    .option('--concurrency <n>', '选择模式下的并发扫描数（默认：3）', '3')
    .action(async (opts) => {
      await update(opts);
    });

  program
    .command('uninstall')
    .description('卸载 skills（从 .claude/skills 或 .agent/skills 删除，并可 sync 更新 AGENTS.md）。')
    .argument('[skillNames...]', '要卸载的 skill 名称（目录名），可多个')
    .option('--global', '卸载全局目录（默认：当前项目）', false)
    .option('--universal', '使用通用目录 .agent/skills（默认：.claude/skills）', false)
    .option('--all', '卸载目标目录下所有已安装 skills', false)
    .option('--output <path>', 'sync 输出文件（默认：AGENTS.md）')
    .option('--no-sync', '跳过 openskills sync', false)
    .action(async (skillNames, opts) => {
      await uninstall(opts, skillNames);
    });

  const config = program.command('config').description('配置管理：默认 profile、Web UI 选择等。');

  config
    .command('set-default-profile')
    .description('设置默认 profile（当你不传 --profile 时会用它）。')
    .argument('<name>', 'profile 名称，例如 laptop')
    .action(async (name) => {
      await setDefaultProfileCmd(name);
    });

  config
    .command('set-remote-profile-url')
    .description('设置远端 profile URL（用于 config push/pull）。')
    .argument('<url>', '例如 https://<bucket>.<region>.aliyuncs.com/skillmanager/')
    .action(async (url) => {
      await setRemoteProfileUrlCmd(url);
    });

  config
    .command('push')
    .description('上传某个 profile 到远端 URL（HTTP PUT）。')
    .option('--profile <name>', 'profile 名称（默认：default）', 'default')
    .option('--url <url>', '远端 URL（可省略，使用 config.remoteProfileUrl 或 SKILLMANAGER_PROFILE_URL）')
    .action(async (opts) => {
      await pushProfileCmd(opts);
    });

  config
    .command('pull')
    .description('从远端 URL 下载 profile 并保存到本地（HTTP GET）。')
    .option('--profile <name>', 'profile 名称（默认：default）', 'default')
    .option('--url <url>', '远端 URL（可省略，使用 config.remoteProfileUrl 或 SKILLMANAGER_PROFILE_URL）')
    .action(async (opts) => {
      await pullProfileCmd(opts);
    });

  config
    .command('show')
    .description('显示配置（含默认 profile）。')
    .action(async () => {
      await showConfig();
    });

  const source = program.command('source').description('管理 skills 来源仓库（官方/第三方/自研）。');

  source
    .command('list')
    .description('列出当前 sources.json 中的来源。')
    .action(async () => {
      await listSources();
    });

  source
    .command('add')
    .description('添加来源：支持 owner/repo、GitHub URL、或 git@... SSH URL。')
    .argument('<repoOrRef>', '例如 ComposioHQ/awesome-claude-skills 或 https://github.com/obra/superpowers')
    .option('--id <id>', '指定来源 id（可选）')
    .option('--name <name>', '显示名称（可选）')
    .option('--ref <openskillsRef>', '指定 openskillsRef（可选，形如 owner/repo）')
    .option('--disabled', '添加为禁用（bootstrap 默认不安装）', false)
    .action(async (repoOrRef, opts) => {
      await addSource(repoOrRef, opts);
    });

  source
    .command('remove')
    .description('删除来源（按 id）。')
    .argument('<id>', '来源 id')
    .action(async (id) => {
      await removeSource(id);
    });

  source
    .command('enable')
    .description('启用来源（按 id）。')
    .argument('<id>', '来源 id')
    .action(async (id) => {
      await setEnabled(id, true);
    });

  source
    .command('disable')
    .description('禁用来源（按 id）。')
    .argument('<id>', '来源 id')
    .action(async (id) => {
      await setEnabled(id, false);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});

