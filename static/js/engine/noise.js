// Bruit de Perlin 3D — implémentation de référence de Ken Perlin.
//
// Module volontairement clos : aucune dépendance, aucun état partagé. Il
// fournit le champ continu qui fait errer les particules et incurve leur
// trajectoire vers leur cible (cf. getHoundMove dans physics.js).
//
// La troisième dimension sert de temps : faire avancer z anime le champ,
// et décaler z par particule leur donne des trajectoires distinctes dans un
// même champ.

const perm = new Uint8Array(512);

const p_arr = new Uint8Array([151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,234,137,133,222,143,76,78,134,103,121,111,90,203,7,253,13,25,124,115,103,95,190,57,196,142,74,157,40,15,212,189,93,121,156,211,67,64,44,239,218,180,245,217,162,156,233,96,22,239,122,81,131,76,132,157,11,108,189,28,42,223,184,57,163,221,66,220,31,242,210,126,172,13,22,130,214,118,78,121,108,86,28,42,34,184,150,32,213,221,137,208,68,141,128,195,134,95,129,36,191,7,122,160,95,161,243,11,183,119,166,120,241,138,216,161,162,3,23,115,154,150,78,81,108,28,42,126,169,118,78,121,108,86,183,120,241,138,216,161,162,122,160,95,161,243,11,183,119,166,120,241,138,216,161,162,3,23,115,154,150,78,81,108,28,42,126,169,118,78,121,108,86]);

for (let i = 0; i < 512; i++) perm[i] = p_arr[i & 255];

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function lerp(t, a, b) { return a + t * (b - a); }

function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise(x, y, z) {
  let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  let u = fade(x), v = fade(y), w = fade(z);
  let a = perm[X]+Y, aa = perm[a]+Z, ab = perm[a+1]+Z, b = perm[X+1]+Y, ba = perm[b]+Z, bb = perm[b+1]+Z;
  return lerp(w, lerp(v, lerp(u, grad(perm[aa  ], x  , y  , z   ), grad(perm[ba  ], x-1, y  , z   )), lerp(u, grad(perm[ab  ], x  , y-1, z   ), grad(perm[bb  ], x-1, y-1, z   ))),
                 lerp(v, lerp(u, grad(perm[aa+1], x  , y  , z-1 ), grad(perm[ba+1], x-1, y  , z-1 )), lerp(u, grad(perm[ab+1], x  , y-1, z-1 ), grad(perm[bb+1], x-1, y-1, z-1 ))));
}
