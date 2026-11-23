// Error bar: registered before anything else, so a fatal error is never a silent black screen.
(function () {
  var errs = [];
  window.__errs = errs;
  function show(m) {
    errs.push(m);
    var b = document.getElementById('errbar');
    if (!b) {
      b = document.createElement('div');
      b.id = 'errbar';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#b00020;color:#fff;font:12px/1.4 monospace;padding:4px 10px;z-index:99;white-space:pre-wrap';
      (document.body || document.documentElement).appendChild(b);
    }
    b.textContent = 'ERROR: ' + errs.slice(-3).join('  |  ');
  }
  window.__showErr = show;
  window.addEventListener('error', function (e) { show((e.message || 'error') + ' @' + (e.lineno || '?')); });
  window.addEventListener('unhandledrejection', function (e) { show('promise: ' + ((e.reason && e.reason.message) || e.reason)); });
})();
