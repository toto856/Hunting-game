// Point d'entrée.
'use strict';
window.addEventListener('DOMContentLoaded', () => {
  const S = HG.save.load();
  HG.audio.setVolume(S.options.volume);
  const game = new HG.Game(document.getElementById('game'));
  window.game = game;
  game.ui.showMainMenu();
  document.body.addEventListener('pointerdown', () => HG.audio.init(), { once: false });
});
