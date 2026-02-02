async function mapWithConcurrency(items, limit, mapper) {
  const arr = Array.from(items || []);
  const n = Math.max(1, Number(limit || 1));
  const results = new Array(arr.length);

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= arr.length) return;
      results[i] = await mapper(arr[i], i);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(n, arr.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

module.exports = { mapWithConcurrency };

