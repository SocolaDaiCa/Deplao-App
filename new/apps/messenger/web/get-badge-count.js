(function () {
  return document.querySelector(`a[href="https://mail.google.com/mail/u/0/#inbox"]`).getAttribute('aria-label').match(/\d+/)[0] || '';
})();
