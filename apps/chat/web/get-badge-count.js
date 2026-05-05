(function () {
  return Array.from(
    document.querySelectorAll(`[aria-label*="unread message"].TeR7uc`)
  )
  .reduce((sum, e) => sum + parseInt(e.innerText, 10), 0)
})();