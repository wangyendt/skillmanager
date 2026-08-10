/* eslint-disable no-console */

const { ensureSelfRegistration, isGlobalNpmInstall } = require('./lib/self-register');

async function main() {
  if (!isGlobalNpmInstall()) return;

  try {
    const result = await ensureSelfRegistration({ force: true });
    console.log(
      result.selfSourceRemoved
        ? '[skilltruck] 已保留用户对 skilltruck 内置来源的移除设置。'
        : `[skilltruck] 已确保内置来源启用，并为 ${result.profilesChanged} 个已有 profile 新增勾选 skilltruck。`
    );
  } catch (err) {
    // Do not make the CLI unusable because one local config file is malformed or
    // temporarily unwritable. The CLI startup migration will retry later.
    console.warn('[skilltruck] 自动补充配置失败；未覆盖原文件，首次运行 CLI 时会重试。');
    console.warn(err?.message || String(err));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.warn(err?.message || String(err));
  });
}

module.exports = { main };
