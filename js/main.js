// Démarrage.
'use strict';

(() => {
  DH.save.load();
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) {
    document.getElementById('menu-root').innerHTML = '<div class="panel"><h2>WebGL indisponible</h2><p>Votre navigateur ne supporte pas WebGL, nécessaire pour ce jeu.</p></div>';
    return;
  }
  const game = new DH.Game();
  DH.game = game;
  if (game.input.isTouch) document.body.classList.add('touch');
  DH.ui.init(game);
  DH.ui.showMain();
  const pauseBtn = document.querySelector('[data-btn="pause"]');
  if (pauseBtn) pauseBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    game.pause();
  });
})();
