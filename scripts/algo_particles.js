let cols, rows;
let cellSize = 2;

const TOTAL_MASS = 4000; 
let particles = []; // La liste brute des pixels
let clusters = [];  // Les groupes aimantés (Amas)

let trailMap = []; 
let currentMode = 'CHAOS'; 

const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; 

export function getGridDimensions(canvasWidth, canvasHeight, mainCellSize) {
  cellSize = mainCellSize; 
  cols = Math.floor(canvasWidth / cellSize);
  rows = Math.floor(canvasHeight / cellSize);
  return { cols, rows };
}

export function init() {
  particles = [];
  clusters = [];
  trailMap = Array(rows).fill(0).map(() => Array(cols).fill(0));
  currentMode = 'CHAOS';

  for (let i = 0; i < TOTAL_MASS; i++) {
    let initialDir = dirs[Math.floor(Math.random() * 4)];
    let p = {
      x: Math.floor(Math.random() * cols),
      y: Math.floor(Math.random() * rows),
      targetX: -1,
      targetY: -1,
      headingX: initialDir[0],
      headingY: initialDir[1],
      isHighlighted: false,
      cluster: null
    };
    
    // Au départ, chaque particule est son propre amas de taille 1
    let c = { elements: [p], headingX: initialDir[0], headingY: initialDir[1], dead: false };
    p.cluster = c;
    
    particles.push(p);
    clusters.push(c);
  }
}

export function isTextFullyFormed() {
  if (currentMode !== 'FORMATION' || particles.length === 0) return false;
  return particles.every(p => p.x === p.targetX && p.y === p.targetY);
}

// ==========================================
// CONTRÔLE DES ÉTATS 
// ==========================================
export function startChaos() {
  currentMode = 'CHAOS';
  clusters = [];
  
  // Le signal s'arrête : les particules redeviennent de petits aimants solitaires
  // prêtes à recréer de nouveaux amas au fil des collisions.
  for (let p of particles) {
    p.targetX = -1;
    p.targetY = -1;
    let dir = dirs[Math.floor(Math.random() * 4)];
    p.headingX = dir[0];
    p.headingY = dir[1];
    
    let c = { elements: [p], headingX: dir[0], headingY: dir[1], dead: false };
    p.cluster = c;
    clusters.push(c);
  }
}

export function startFormation(textPixels) {
  if (textPixels.length === 0) return;
  currentMode = 'FORMATION';

  // 1. LA SCISSION
  // On dissout instantanément tous les amas. La colle disparaît !
  for (let p of particles) {
    p.cluster = null; 
  }
  clusters = []; // Fin de la notion d'amas pendant la formation

  // 2. TRI SPATIAL (Garantit que chaque pixel indépendant trouve sa place)
  let duplicatedTargets = [];
  for(let i = 0; i < particles.length; i++) {
    duplicatedTargets.push(textPixels[i % textPixels.length]);
  }
  
  particles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  duplicatedTargets.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  for (let i = 0; i < particles.length; i++) {
    particles[i].targetX = duplicatedTargets[i].x;
    particles[i].targetY = duplicatedTargets[i].y;
    particles[i].isHighlighted = duplicatedTargets[i].isHighlighted;
  }
}

// ==========================================
// LA PHYSIQUE ORGANIQUE
// ==========================================
export function update(dt, speedMultiplier = 1.0, maxClusterSize = 20) {
  
  // Évaporation des pistes
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) trailMap[y][x] *= 0.90; 
  }

  if (currentMode === 'CHAOS') {
    // Gouttes de phéromones aléatoires
    for (let i = 0; i < 5; i++) {
      let rx = Math.floor(Math.random() * cols);
      let ry = Math.floor(Math.random() * rows);
      trailMap[ry][rx] += 10.0; 
    }

    // Carte du terrain pour gérer les collisions géométriques
    let gridMap = Array(rows).fill(null).map(() => Array(cols).fill(null));
    for (let p of particles) {
      gridMap[p.y][p.x] = p; 
    }

    // Déplacement des Amas (Corps Rigides)
    for (let c of clusters) {
      if (c.dead) continue;

      // Poids : un amas de 15 particules bouge beaucoup plus lentement qu'un pixel seul
      let speedFactor = 1 / Math.sqrt(c.elements.length);
      if (Math.random() > speedFactor * speedMultiplier) continue;

      let canMove = true;
      let hitCluster = null;

      // On vérifie si l'amas a la place d'avancer
      for (let p of c.elements) {
        let nx = (p.x + c.headingX + cols) % cols;
        let ny = (p.y + c.headingY + rows) % rows;
        let occupant = gridMap[ny][nx];

        // S'il y a un obstacle et qu'il ne fait pas partie de notre propre amas : Collision !
        if (occupant && occupant.cluster !== c) {
          canMove = false;
          hitCluster = occupant.cluster;
          break;
        }
      }

      if (canMove) {
        // L'amas avance comme une seule entité !
        for (let p of c.elements) {
          gridMap[p.y][p.x] = null;
          p.x = (p.x + c.headingX + cols) % cols;
          p.y = (p.y + c.headingY + rows) % rows;
          gridMap[p.y][p.x] = p;
        }

        // Changement de direction aléatoire (Inertie)
        if (Math.random() < 0.05) {
          if (c.headingX !== 0) { c.headingX = 0; c.headingY = Math.random() < 0.5 ? 1 : -1; }
          else { c.headingY = 0; c.headingX = Math.random() < 0.5 ? 1 : -1; }
        }
      } else {
        // COLLISION : On essaie de fusionner avec l'autre amas !
        if (hitCluster && !hitCluster.dead) {
          
          // NOUVEAU : On utilise VOTRE variable pour brider la fusion
          if (c.elements.length + hitCluster.elements.length <= maxClusterSize) {
            
            for (let p of c.elements) {
              p.cluster = hitCluster;
              hitCluster.elements.push(p);
            }
            c.dead = true; 
          } else {
            // Si c'est trop gros, on rebondit
            c.headingX *= -1;
            c.headingY *= -1;
          }
        }
      }
    }

    // Nettoyage de la mémoire
    clusters = clusters.filter(c => !c.dead);

  } 
else {
    // --- MODE FORMATION ---
    let steps = Math.floor(speedMultiplier) + (Math.random() < (speedMultiplier % 1) ? 1 : 0);

    for (let p of particles) {
      if (p.x === p.targetX && p.y === p.targetY) continue;

      for (let s = 0; s < steps; s++) {
        if (p.x === p.targetX && p.y === p.targetY) break;

        let dirX = Math.sign(p.targetX - p.x);
        let dirY = Math.sign(p.targetY - p.y);
        let moveAxis = '';

        if (dirX !== 0 && dirY !== 0) {
          // SÉCURITÉ ABSOLUE : On vérifie les limites de la grille AVANT de renifler
          let scentX = 0;
          let scentY = 0;
          
          if (p.y >= 0 && p.y < rows && p.x + dirX >= 0 && p.x + dirX < cols) {
            scentX = trailMap[p.y][p.x + dirX];
          }
          if (p.y + dirY >= 0 && p.y + dirY < rows && p.x >= 0 && p.x < cols) {
            scentY = trailMap[p.y + dirY][p.x];
          }

          if (scentX > scentY + 0.1) moveAxis = 'X';
          else if (scentY > scentX + 0.1) moveAxis = 'Y';
          else {
            if (p.headingX === dirX) moveAxis = 'X';
            else if (p.headingY === dirY) moveAxis = 'Y';
            else moveAxis = Math.random() < 0.5 ? 'X' : 'Y';
            
            if (Math.random() < 0.15) moveAxis = (moveAxis === 'X') ? 'Y' : 'X';
          }
        } 
        else if (dirX !== 0) moveAxis = 'X';
        else if (dirY !== 0) moveAxis = 'Y';

        // Application du mouvement
        p.x += (moveAxis === 'X') ? dirX : 0;
        p.y += (moveAxis === 'Y') ? dirY : 0;
        p.headingX = (moveAxis === 'X') ? dirX : 0;
        p.headingY = (moveAxis === 'Y') ? dirY : 0;

        // Blocage strict aux frontières de l'écran
        p.x = Math.max(0, Math.min(p.x, cols - 1));
        p.y = Math.max(0, Math.min(p.y, rows - 1));

        // Dépôt de la trace 100% sécurisé
        if (p.y >= 0 && p.y < rows && p.x >= 0 && p.x < cols) {
          trailMap[p.y][p.x] += 0.5;
        }
      }
    }
  }
}

// Le Rendu est devenu d'une simplicité et d'une pureté absolue
export function draw(ctx) {
  for (let p of particles) {
    let isOnTarget = (currentMode === 'FORMATION' && p.x === p.targetX && p.y === p.targetY);
    
    if (isOnTarget && p.isHighlighted) ctx.fillStyle = '#1a1a1a';
    else ctx.fillStyle = '#f0f0f0';

    // Terminé les faux "gros carrés" ! Chaque particule est dessinée fidèlement
    // sous la forme d'un pixel de base. Si elles forment un amas, c'est uniquement 
    // parce qu'elles se touchent géométriquement sur la grille.
    ctx.fillRect(p.x * cellSize, p.y * cellSize, cellSize - 1, cellSize - 1);
  }
}