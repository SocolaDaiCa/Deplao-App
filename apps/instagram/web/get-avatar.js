(function () {
  // Try to get the profile picture from the nav or header area
  var imgs = document.querySelectorAll('img[alt*="profile picture"], img[data-testid*="user-avatar"]');
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].src;
    if (src && (src.indexOf('cdninstagram') !== -1 || src.indexOf('fbcdn') !== -1)) {
      return src;
    }
  }
  // Fallback: any small profile-like image in nav
  var allImgs = document.querySelectorAll('img');
  for (var j = 0; j < allImgs.length; j++) {
    var el = allImgs[j];
    if (el.src && (el.src.indexOf('cdninstagram') !== -1 || el.src.indexOf('fbcdn') !== -1) && el.width > 20 && el.width < 60) {
      return el.src;
    }
  }
  return null;
})();
