let proxyInitialized = false;
let fetchImpl = globalThis.fetch;
let undiciModule = null;

function getProxyUrlFromEnv() {
  return (
    process.env.SKILLMANAGER_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

function getUndici() {
  if (undiciModule) return undiciModule;
  try {
    // eslint-disable-next-line global-require
    undiciModule = require('undici');
    return undiciModule;
  } catch {
    return null;
  }
}

function ensureProxyInitialized() {
  if (proxyInitialized) return;
  proxyInitialized = true;

  const proxyUrl = getProxyUrlFromEnv();
  const undici = getUndici();

  // 如果有 undici，就优先用它的 fetch（这样 setGlobalDispatcher 才能生效）
  if (undici?.fetch) fetchImpl = undici.fetch.bind(undici);

  if (!proxyUrl) return;

  try {
    if (!undici?.ProxyAgent || !undici?.setGlobalDispatcher) {
      throw new Error('未找到 undici ProxyAgent/setGlobalDispatcher');
    }

    undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));
    // eslint-disable-next-line no-console
    console.log(`使用代理：${proxyUrl}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('警告：初始化代理失败，将不使用代理。');
    // eslint-disable-next-line no-console
    console.warn(e?.message || String(e));
  }
}

async function httpFetch(url, options) {
  ensureProxyInitialized();
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 环境不支持 fetch（需要 Node 18+ 或提供 undici.fetch）');
  }
  return await fetchImpl(url, options);
}

module.exports = { httpFetch };

