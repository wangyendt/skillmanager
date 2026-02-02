let proxyInitialized = false;

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

function ensureProxyInitialized() {
  if (proxyInitialized) return;
  proxyInitialized = true;

  const proxyUrl = getProxyUrlFromEnv();
  if (!proxyUrl) return;

  try {
    // Node 20+ ships undici. Use ProxyAgent so global fetch respects proxy.
    // eslint-disable-next-line global-require
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
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
  return await fetch(url, options);
}

module.exports = { httpFetch };

