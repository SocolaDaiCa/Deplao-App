(function () {
  var selectors = [
    // 'img[data-testid="user-avatar-content"]',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el && el.src) return el.src;
  }
  return null;
})();
