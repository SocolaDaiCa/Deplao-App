(function () {
  /** Đếm từ title khi đang ở inbox / tab có tiền tố unread. */
  function fromTitle(t) {
    if (!t) return null;
    var m = t.match(/Inbox \((\d+)\)/);
    if (m) return parseInt(m[1], 10);
    m = t.match(/Hộp thư đến \((\d+)\)/);
    if (m) return parseInt(m[1], 10);
    m = t.match(/^\((\d+)\)\s*-?\s*Inbox/i);
    if (m) return parseInt(m[1], 10);
    /** Gmail đôi khi dùng "(12) Gmail" hoặc "(12) Subject … - Gmail". */
    m = t.match(/^\((\d+)\)/);
    if (m && /Gmail/i.test(t)) return parseInt(m[1], 10);
    return null;
  }

  /** Đọc từ sidebar (vẫn có khi đang xem thread). */
  function fromSidebar() {
    var nodes = document.querySelectorAll(
      'nav a[href*="#inbox"], [role="navigation"] a[href*="inbox"], a[href*="mail/u/"][href*="#inbox"]'
    );
    var i;
    var j;
    for (i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (href.indexOf('inbox') === -1) continue;
      var lab = ((a.getAttribute('aria-label') || '') + ' ' + (a.getAttribute('title') || '')).trim();
      var um = lab.match(/(\d[\d,\s]*)\s*(unread|chưa\s*đọc)/i);
      if (um) return parseInt(um[1].replace(/[\s,]/g, ''), 10);
      var lines = (a.innerText || '')
        .split(/\n/)
        .map(function (x) {
          return x.trim();
        })
        .filter(Boolean);
      for (j = 0; j < lines.length; j++) {
        if (/^\d{1,6}$/.test(lines[j])) return parseInt(lines[j], 10);
      }
    }
    return null;
  }

  var t = document.title;
  var n = fromTitle(t);
  if (n !== null) return n;
  n = fromSidebar();
  if (n !== null) return n;
  return 0;
})();
