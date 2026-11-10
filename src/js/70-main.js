// Boot: load data, restore save, wire events.
var DATA = null;
(function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && UI.modal) { UI.modal = null; UI.offer = null; render(); } });
  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d; window.DATA = d; BASE = d.meta;
    render();
  }).catch(function () {
    document.getElementById('app').innerHTML = '<div class="start"><h1>NFL GM</h1><p class="bad">Could not load player data. Reload the page to try again.</p></div>';
  });
})();
