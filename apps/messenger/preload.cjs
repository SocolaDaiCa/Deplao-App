'use strict';

// Load default shared preload first
require('../_shared/preload-default.cjs');

// Listen for clicks on links and open non-messages URLs in a new tab (system browser)
document.addEventListener('click', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;

  const anchor = e.target.closest('a');
  if (anchor && anchor.href) {
    const url = anchor.href;
    // Intercept only standard http/https links
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Check if it starts with the messages URL or is the root messages URL
      const isMessagesUrl = url.startsWith('https://www.facebook.com/messages/') || url === 'https://www.facebook.com/messages';
      
      if (!isMessagesUrl) {
        e.preventDefault();
        e.stopPropagation();
        window.open(url, '_blank');
      }
    }
  }
}, true);
