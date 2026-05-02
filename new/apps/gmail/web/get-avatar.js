(function () {
  var img = document.querySelector('img[aria-label*="Google"], img[data-profile-identifier], a[href*="accounts.google.com"] img');
  if (img && img.src && img.src.indexOf('googleusercontent.com') !== -1) return img.src;
  var av = document.querySelector('header img[src*="googleusercontent"]');
  return av && av.src ? av.src : null;
})();
