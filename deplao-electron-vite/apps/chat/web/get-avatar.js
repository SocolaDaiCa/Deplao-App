(function () {
  const img = document.querySelector(`[aria-label*="Google Account"] img`);
  const srcset = img.srcset;

  if (!srcset) {
    return img.src;
  }

  const candidates = srcset.split(',').map(s => {
    const [url, descriptor] = s.trim().split(' ');
    const size = parseInt(descriptor?.replace('w', '') || '0', 10);
    return { url, size };
  });

  candidates.sort((a, b) => b.size - a.size);

  return candidates[0].url;
})();