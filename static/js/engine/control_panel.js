import { PARAMS, getStats } from '/js/engine/algo_block.js';

export class ControlPanel {
  constructor() {
    this.isVisible = false; // masqué par défaut — touche "D" pour l'afficher
    this.frames = 0;
    this.lastTime = performance.now();
    this.fps = 0;

    // Création de l'interface visuelle (UI)
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(15, 15, 15, 0.9);
      border: 1px solid #333;
      color: #f0f0f0;
      font-family: monospace;
      font-size: 12px;
      padding: 15px;
      border-radius: 5px;
      z-index: 9999;
      width: 280px;
      max-height: 90vh;
      overflow-y: auto;
      backdrop-filter: blur(4px);
      transition: opacity 0.2s ease;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      opacity: 0;
      pointer-events: none;
    `;

    // 1. MONITORING
    this.monitorSection = document.createElement('div');
    this.monitorSection.innerHTML = `
      <div style="color:#00ffcc; font-weight:bold; font-size:14px; margin-bottom:10px" id="cp-fps">FPS: 0</div>
      <div style="color:#aaa; display:flex; justify-content:space-between;"><span>Particules:</span> <span id="cp-part">0</span></div>
      <div style="color:#aaa; display:flex; justify-content:space-between;"><span>Plasma Actif:</span> <span id="cp-plas">0</span></div>
      <div style="color:#aaa; display:flex; justify-content:space-between;"><span>État:</span> <span id="cp-state">CHAOS</span></div>
      <div style="color:#aaa; display:flex; justify-content:space-between; margin-bottom:15px"><span>Inactivité:</span> <span id="cp-idle">—</span></div>
    `;
    this.panel.appendChild(this.monitorSection);

    // 2. CONTRÔLES — chaque rubrique ouvre son conteneur, dans lequel
    // addSlider/addColor rangent les entrées suivantes
    this.addSection('MOTEUR GRAPHIQUE');
    this.addSlider('Bruit (Errement)', 'NOISE_SCALE', 0.001, 0.05, 0.001);
    this.addSlider('Cône de Vision (°)', 'maxConeAngleDegrees', 10, 360, 10);
    this.addSlider('Inertie (Accélération)', 'accelerationSpeed', 0.1, 2.0, 0.1);
    this.addSlider('Quota Plasma (Lag)', 'maxPlasmaCells', 500, 10000, 100);

    this.addSection('ÉCOSYSTÈME (Défibrillateur)');
    this.addSlider('Densité de Survie', 'defibDensity', 0.0, 1.0, 0.05);
    this.addSlider('Étincelles (Vide)', 'defibEphemeralSparks', 0.001, 0.05, 0.001);
    this.addSlider('Rayon d\'Action', 'defibRadius', 1, 15, 1);

    this.addSection('COULEURS & ESTHÉTIQUE');
    this.addSlider('Opacité Plasma Max', 'alphaEphemeral', 0.1, 1.0, 0.1);
    this.addSlider('Disparition Plasma', 'plasmaFadeOutSpeed', 0.01, 0.2, 0.01);
    this.addSlider('Refroidissement Collision', 'collisionCoolingSpeed', 0.01, 0.2, 0.01);
    this.addColor('Couleur Plasma', 'colorEphemeral');
    this.addColor('Couleur Collision', 'colorCollision');

    document.body.appendChild(this.panel);

    // Bascule de l'affichage avec la touche "D"
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
        this.isVisible = !this.isVisible;
        this.panel.style.opacity = this.isVisible ? '1' : '0';
        this.panel.style.pointerEvents = this.isVisible ? 'auto' : 'none'; 
      }
    });

    // Caching des éléments du DOM pour mise à jour rapide
    this.fpsEl = document.getElementById('cp-fps');
    this.partEl = document.getElementById('cp-part');
    this.plasEl = document.getElementById('cp-plas');
    this.stateEl = document.getElementById('cp-state');
    this.idleEl = document.getElementById('cp-idle');
  }

  // Ouvre une rubrique : titre + nouveau conteneur pour les entrées suivantes
  addSection(title) {
    const sep = document.createElement('div');
    sep.innerHTML = `<hr style="border-color:#444; margin: 15px 0;"><span style="color:#888; font-size:10px; font-weight:bold;">${title}</span>`;
    this.panel.appendChild(sep);
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.style.marginTop = '10px';
    this.panel.appendChild(this.controlsContainer);
  }

  // Fonction utilitaire pour créer un Slider
  addSlider(label, paramKey, min, max, step) {
    let row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 10px; display:flex; flex-direction:column;';
    
    let top = document.createElement('div');
    top.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:4px;';
    
    let lbl = document.createElement('span');
    lbl.innerText = label;
    let val = document.createElement('span');
    val.innerText = PARAMS[paramKey];
    val.style.color = '#fff';

    top.appendChild(lbl);
    top.appendChild(val);

    let input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = PARAMS[paramKey];
    input.style.width = '100%';

    input.addEventListener('input', (e) => {
      let v = parseFloat(e.target.value);
      PARAMS[paramKey] = v; // On modifie directement l'algorithme !
      val.innerText = v;
    });

    row.appendChild(top);
    row.appendChild(input);
    this.controlsContainer.appendChild(row);
  }

  // Fonction utilitaire pour créer un color picker
  addColor(label, paramKey) {
    let row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center;';
    
    let lbl = document.createElement('span');
    lbl.innerText = label;

    let input = document.createElement('input');
    input.type = 'color';
    input.value = PARAMS[paramKey];
    input.style.cursor = 'pointer';

    input.addEventListener('input', (e) => {
      PARAMS[paramKey] = e.target.value; // Change la couleur en direct !
    });

    row.appendChild(lbl);
    row.appendChild(input);
    this.controlsContainer.appendChild(row);
  }

  // idleStatus vient de main.js — le compte à rebours d'inactivité n'est pas
  // une affaire du moteur, le panneau se contente de l'afficher.
  update(idleStatus = null) {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    // Mise à jour de l'affichage toutes les 500 ms pour être réactif
    if (elapsed >= 500) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      
      if (this.fps >= 50) this.fpsEl.style.color = '#00ffcc'; 
      else if (this.fps >= 30) this.fpsEl.style.color = '#ffcc00'; 
      else this.fpsEl.style.color = '#ff3333'; 

      this.fpsEl.innerText = `FPS : ${this.fps}`;
      
      // On récupère les informations de l'algo
      const stats = getStats();
      this.partEl.innerText = stats.particles;
      this.plasEl.innerText = stats.plasma;
      this.stateEl.innerText = stats.state;

      // Compte à rebours d'inactivité : suspendu tant que le texte s'anime,
      // il repart de zéro une fois l'écran stabilisé.
      if (!idleStatus) {
        this.idleEl.innerText = '—';
        this.idleEl.style.color = '#aaa';
      } else if (idleStatus.state === 'active') {
        this.idleEl.innerText = 'mode inactif';
        this.idleEl.style.color = '#00ffcc';
      } else if (idleStatus.state === 'suspended') {
        this.idleEl.innerText = 'suspendu (animation)';
        this.idleEl.style.color = '#ffcc00';
      } else {
        const s = (idleStatus.elapsedMs / 1000).toFixed(1);
        const total = (idleStatus.delayMs / 1000).toFixed(0);
        this.idleEl.innerText = `${s} / ${total} s`;
        this.idleEl.style.color = '#aaa';
      }

      // Le texte du plasma devient rouge s'il approche de la limite (Quota)
      if (stats.plasma >= PARAMS.maxPlasmaCells * 0.9) this.plasEl.style.color = '#ff3333';
      else this.plasEl.style.color = '#aaa';

      this.frames = 0;
      this.lastTime = now;
    }
  }
}