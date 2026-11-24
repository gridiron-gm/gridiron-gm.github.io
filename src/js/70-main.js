// Boot: load data, restore save, wire events.
var DATA = null;
(function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (UI.modal || UI.sheet)) { UI.modal = null; UI.offer = null; UI.sheet = null; render(); return; }
    onKey(e);
  });
  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d; window.DATA = d; BASE = d.meta;
    render();
  }).catch(function () {
    document.getElementById('app').innerHTML = '<div class="startpage"><div class="start"><h1 class="logo">Gridiron GM</h1><p class="bad">Could not load player data. Reload the page to try again.</p></div></div>';
  });
})();
