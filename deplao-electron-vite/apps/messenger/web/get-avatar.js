(function () {
  var nav = document.querySelector('div[role="navigation"]');
  if (nav) {
    var images = nav.querySelectorAll('svg image');
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var href = img.getAttribute('xlink:href') || img.getAttribute('href');
      if (href && (href.indexOf('scontent') !== -1 || href.indexOf('fbcdn') !== -1)) return href;
    }
  }
  var allSvg = document.querySelectorAll('svg image');
  for (var j = 0; j < allSvg.length; j++) {
    var im = allSvg[j];
    var h = im.getAttribute('xlink:href') || im.getAttribute('href');
    if (h && (h.indexOf('scontent') !== -1 || h.indexOf('fbcdn') !== -1)) return h;
  }
  var imgs = document.querySelectorAll('img');
  for (var k = 0; k < imgs.length; k++) {
    var el = imgs[k];
    if (el.src && (el.src.indexOf('scontent') !== -1 || el.src.indexOf('fbcdn') !== -1) && el.width > 20 && el.width < 100) {
      return el.src;
    }
  }
  return null;
})();
