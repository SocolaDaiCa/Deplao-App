(function () {
  // Look for unread count in DM notification badges
  var badges = document.querySelectorAll('span[aria-label]');
  for (var i = 0; i < badges.length; i++) {
    var label = badges[i].getAttribute('aria-label') || '';
    var match = label.match(/(\d+)/);
    if (match && badges[i].closest('a[href*="/direct/"]')) {
      return parseInt(match[1], 10) || '';
    }
  }
  // Fallback: count unread thread indicators
  var unread = document.querySelectorAll('div[role="listitem"] span[data-visualcompletion="ignore"]');
  return unread.length || '';
})();
