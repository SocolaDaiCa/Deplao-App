(function () {
  var navEls = document.querySelectorAll(`
    body > header [data-track-label="merge_requests_menu"] span,
    body > header [data-track-label="todos_link"] span
  `);
  var total = 0;

  for (var j = 0; j < navEls.length; j++) {
    var item = navEls[j];
    total += Number.parseInt(item?.innerText || '0', 10) / 2;
  }

  return total;
})();