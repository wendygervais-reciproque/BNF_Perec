// On importe nos "musiciens" !
import * as TextManager from './textManager.js';
import * as Algo from './algo_conway.js'; // C'est ici qu'on changera d'algorithme plus tard !

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('right');

canvas.width = container.clientWidth;
canvas.height = container.clientHeight;

// ==========================================
// 1. PARAMÈTRES DU TEMPS ET DE L'INTERFACE
// ==========================================
const formationDuration = 3.0;    
const destructionDuration = 1.5;  
const extinctionDuration = 0.8;   
const gravityTension = 6;

const silenceDuration = 0.2;      
const simmerDuration = 1.0;       

const texts = [
  "Dans le coin gauche de la pièce, il y a un grand *fauteuil moderne*, posé sur un piétement de métal chromé...",
  "Le *Jeu de la vie* est un automate cellulaire imaginé par John Horton Conway...",
  "*L'ordre et le chaos* ne sont que deux mots pour désigner une seule et même chose..."
];
let currentTextIndex = 0;
let pendingText = null; 

// ==========================================
// 2. LA MACHINE À ÉTATS
// ==========================================
const STATE_SIMMERING = 0;       
const STATE_FORMING = 1;         
const STATE_IDLE = 2;            
const STATE_DESTRUCTURING = 3;   
const STATE_EXTINCTION = 4;      
const STATE_SILENCE = 5;         

let currentState = STATE_SIMMERING;
let animationProgress = 0.0;     
let extinctionProgress = 0.0;    
let simmerTimer = simmerDuration;
let silenceTimer = 0;
let lastTime = 0;                

// ==========================================
// 3. LA BOUCLE D'ANIMATION
// ==========================================
function animate(timestamp) {
  if (!lastTime) lastTime = timestamp; 
  let dt = (timestamp - lastTime) / 1000; 
  lastTime = timestamp;
  if (dt > 0.1) dt = 0.1;

  let gravityForce = Math.pow(animationProgress, gravityTension);
  let cellGenesisAlpha = 1.0;

  // --- LOGIQUE TEMPORELLE ---
  if (currentState === STATE_SIMMERING) {
    if (simmerTimer > 0) simmerTimer -= dt; 
    
    // Calcul de l'opacité radiale de l'algorithme
    let genesisProgress = 1.0 - Math.max(0, simmerTimer / simmerDuration);
    cellGenesisAlpha = Math.sqrt(genesisProgress);
    
    if (simmerTimer <= 0 && pendingText !== null) {
      // Le Chef d'orchestre demande au typographe les cibles, et les donne à l'algorithme !
      let dims = Algo.getGridDimensions(canvas.width, canvas.height);
      let coords = TextManager.getCoordinates(pendingText, dims.cols, dims.rows);
      Algo.setTargets(coords.textPixels, coords.highlightBgPixels);
      
      pendingText = null;           
      currentState = STATE_FORMING; 
    }
  } 
  else if (currentState === STATE_FORMING) {
    animationProgress += dt / formationDuration; 
    if (animationProgress >= 1.0) {
      animationProgress = 1.0;
      currentState = STATE_IDLE;
    }
  } 
  else if (currentState === STATE_DESTRUCTURING) {
    animationProgress -= dt / destructionDuration;
    if (animationProgress <= 0.0) {
      animationProgress = 0.0;
      currentState = STATE_EXTINCTION;
    }
  } 
  else if (currentState === STATE_EXTINCTION) {
    extinctionProgress += dt / extinctionDuration;
    if (extinctionProgress >= 1.0) {
      extinctionProgress = 1.0; 
      silenceTimer = silenceDuration; 
      currentState = STATE_SILENCE;
    }
  }
  else if (currentState === STATE_SILENCE) {
    silenceTimer -= dt;
    if (silenceTimer <= 0) {
      extinctionProgress = 0.0;
      animationProgress = 0.0;
      
      Algo.init(); // On relance le chaos de l'algorithme
      
      simmerTimer = simmerDuration; 
      currentState = STATE_SIMMERING; 
    }
  }

  // --- APPEL DE L'ALGORITHME ---
  Algo.update(dt, gravityForce, extinctionProgress);
  Algo.draw(ctx, canvas.width, canvas.height, gravityForce, cellGenesisAlpha);

  requestAnimationFrame(animate); 
}

// ==========================================
// 4. LES BOUTONS
// ==========================================
const btnLoad = document.getElementById('btn-load');
const btnSend = document.getElementById('btn-send');

if (btnLoad && btnSend) {
  btnLoad.addEventListener('click', () => {
    if (currentState === STATE_IDLE || currentState === STATE_FORMING) {
      currentState = STATE_DESTRUCTURING; 
      btnLoad.disabled = true;
      btnLoad.innerText = 'Génération en cours...';
      btnSend.disabled = false; 
    }
  });

  btnSend.addEventListener('click', () => {
    currentTextIndex = (currentTextIndex + 1) % texts.length;
    pendingText = texts[currentTextIndex]; 
    
    btnLoad.disabled = false;
    btnLoad.innerText = '1. Charger un nouveau texte';
    btnSend.disabled = true;
  });
}

// Lancement
Algo.getGridDimensions(canvas.width, canvas.height); // Calcule la taille 
Algo.init(); // Allume la matrice
pendingText = texts[currentTextIndex]; // Prépare le premier texte
requestAnimationFrame(animate);