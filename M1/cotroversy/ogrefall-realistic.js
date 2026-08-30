import * as THREE from './three.module.js?v=2';

const $ = id => document.getElementById(id);
const realms = [
  ['Meadow of Beginnings', 'Gorak the Rootbound', 'Rootheart Charm', 0x4e936a], ['Ashen Mines', 'Brakka Flame-Eater', 'Ember Core', 0xc85b3f], ['Whispering Woods', 'The Moss Widow', 'Mosscloak', 0x5f8f55], ['Frozen Reach', 'Ymir Stonehide', 'Frost Titan Shard', 0x659bb6], ['Sunken Ruins', 'Drownmaw', 'Tidecaller Pearl', 0x3d719d], ['Storm Citadel', 'Voltus Prime', 'Storm Lens', 0x795bae], ["Ogre King's Throne", 'Ogron, King of Ogres', 'Crown of the Ogre King', 0xb9914a]
];
const weapons = [['Rusty Sword', 12, 0], ['Twin Daggers', 20, 80], ['War Hammer', 35, 180], ['Storm Bow', 50, 320], ['SUNBLADE', 90, 500]];
const game = { s: 0, l: 0, coins: 0, score: 0, health: 100, weapon: 0, started: false, keys: {}, player: null, ogres: [], gems: [], boss: null, item: null, levels: Array.from({ length: 70 }, () => ({ o: 0, m: 0, b: false, i: false })), open: Array(70).fill(false), time: 0, attackUntil: 0, playerInvulnerableUntil: 0, moveVelocity: new THREE.Vector3(), wasMoving: false };
game.open[0] = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 1, .1, 180);
const renderer = new THREE.WebGLRenderer({ canvas: $('gameCanvas'), antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight(0xcfe8ed, 0x17241d, 2));
const sunlight = new THREE.DirectionalLight(0xffefd1, 3.2); sunlight.position.set(-8, 16, 12); sunlight.castShadow = true; scene.add(sunlight);
const world = new THREE.Group(); scene.add(world);
const materials = {};
function resize() { const area = $('gameCanvas').parentElement.getBoundingClientRect(); const width = Math.max(320, area.width); const height = Math.max(240, width * 0.535); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
function mat(color, roughness = .7, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function limb(parent, name, size, color, position, rotation = [0, 0, 0]) { const part = new THREE.Mesh(new THREE.CapsuleGeometry(size[0], size[1], 6, 10), mat(color, .72)); part.name = name; part.position.set(...position); part.rotation.set(...rotation); part.castShadow = true; parent.add(part); return part; }
function sphere(parent, name, radius, color, position) { const part = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), mat(color, .7)); part.name = name; part.position.set(...position); part.castShadow = true; parent.add(part); return part; }
function box(parent, name, size, color, position, rotation = [0, 0, 0]) { const part = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color, .55, .05)); part.name = name; part.position.set(...position); part.rotation.set(...rotation); part.castShadow = true; parent.add(part); return part; }
function clearWorld() { while (world.children.length) world.remove(world.children[0]); }
function humanoid(x, z, skin, armor, boss = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.userData = { hp: boss ? 300 : 55, max: boss ? 300 : 55, boss };
  const scale = boss ? 1.45 : 1;
  box(g, 'pelvis', [.62 * scale, .34 * scale, .38 * scale], armor, [0, 1.02 * scale, 0]);
  limb(g, 'torso', [.48 * scale, .72 * scale], armor, [0, 1.58 * scale, 0]);
  sphere(g, 'neck', .18 * scale, skin, [0, 2.12 * scale, 0]); sphere(g, 'head', .39 * scale, skin, [0, 2.48 * scale, 0]);
  box(g, 'hair', [.68 * scale, .17 * scale, .5 * scale], boss ? 0x26352f : 0x33251d, [0, 2.78 * scale, -.03]);
  for (const side of [-1, 1]) {
    sphere(g, 'shoulder', .19 * scale, armor, [side * .58 * scale, 1.92 * scale, 0]);
    limb(g, 'upperArm', [.16 * scale, .42 * scale], skin, [side * .67 * scale, 1.56 * scale, 0], [0, 0, side * .13]);
    limb(g, 'forearm', [.14 * scale, .38 * scale], skin, [side * .7 * scale, 1.16 * scale, -.02], [0, 0, side * .08]);
    sphere(g, 'hand', .15 * scale, skin, [side * .7 * scale, .91 * scale, 0]);
    limb(g, 'thigh', [.2 * scale, .48 * scale], armor, [side * .24 * scale, .62 * scale, 0], [0, 0, side * .05]);
    limb(g, 'shin', [.17 * scale, .45 * scale], skin, [side * .25 * scale, .18 * scale, 0]);
    box(g, 'boot', [.35 * scale, .16 * scale, .55 * scale], 0x201e27, [side * .25 * scale, -.08 * scale, -.08]);
    sphere(g, 'ear', .12 * scale, skin, [side * .41 * scale, 2.5 * scale, 0]);
  }
  const eye = mat(boss ? 0xff553f : 0x1b1720, .3, .2);
  for (const side of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.055 * scale, 8, 8), eye); e.position.set(side * .14 * scale, 2.51 * scale, .35 * scale); g.add(e); }
  const sword = box(g, 'weapon', [.08 * scale, .08 * scale, 1.25 * scale], 0xd8e6e9, [.74 * scale, 1.18 * scale, .12], [Math.PI / 2, 0, -.55]);
  sword.material.metalness = .85; sword.material.roughness = .2;
  if (boss) {
    const chitin = 0x5f715d;
    const eye = mat(0xc7df74, .28, .15);
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        const compoundEye = new THREE.Mesh(new THREE.SphereGeometry(.09 * scale, 8, 8), eye);
        compoundEye.position.set(side * (.18 + row * .025) * scale, (2.43 + row * .09) * scale, .34 * scale);
        g.add(compoundEye);
      }
      limb(g, 'antenna', [.045 * scale, .42 * scale], chitin, [side * .2 * scale, 3.03 * scale, .02], [0, side * .18, side * .2]);
      sphere(g, 'antennaTip', .07 * scale, 0xd6b85a, [side * .27 * scale, 3.25 * scale, .02]);
      limb(g, 'mandible', [.09 * scale, .25 * scale], chitin, [side * .16 * scale, 2.24 * scale, .31 * scale], [side * .35, 0, side * .3]);
      box(g, 'wingCase', [.13 * scale, .7 * scale, .48 * scale], 0x34483f, [side * .48 * scale, 1.9 * scale, -.28 * scale], [0, side * .2, side * .12]);
    }
    box(g, 'crown', [1.05 * scale, .14 * scale, .52 * scale], 0xd6b85a, [0, 3.04 * scale, 0]);
  }
  world.add(g); return g;
}
function crystal(x, z, color = 0xa8dd72) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(.4), mat(color, .25, .25)); g.position.set(x, .55, z); g.castShadow = true; world.add(g); return g; }
function startLevel() { game.started = true; game.health = 100; game.time = 0; clearWorld(); const realm = realms[game.s], p = game.levels[game.s * 10 + game.l], totalOgres = 3 + (game.l + 1) % 4, totalMaterials = 4 + (game.l + 1) % 5; box(world, 'ground', [38, .35, 14], 0x314d40, [0, -.2, 0]); for (let i = -15; i <= 15; i += 2) box(world, 'groundLine', [.025, .02, 14], 0x62806d, [i, .01, 0]); for (let i = -12; i < 13; i += 6) { const rock = box(world, 'rock', [2, 2.5, 1.8], 0x263f45, [i, 1, -3]); rock.rotation.y = i * .1; } game.player = humanoid(0, 0, 0xe9ad82, 0x3c8fd4); game.ogres = []; for (let i = p.o; i < totalOgres; i++) game.ogres.push(humanoid(-8 + i * 4, 0, 0x6e9c60, 0x4d5340)); game.gems = []; for (let i = p.m; i < totalMaterials; i++) game.gems.push(crystal(-9 + i * 4, i % 2 ? 3 : -2)); game.boss = p.b ? null : humanoid(11, 0, 0x697a61, 0x35493f, true); if (game.boss) game.boss.userData.nextAttack = 0; game.item = p.i ? null : crystal(11, -2, 0xf7c969); camera.position.set(0, 6, 15); camera.lookAt(0, 1.4, 0); notify(`Level ${game.l + 1}: gather materials, defeat ogres, then face the boss.`); render(); }
function notify(message) { $('status').textContent = message; $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('toast').classList.remove('show'), 2400); }
function nearest(list) { return list.filter(x => x.parent).sort((a, b) => a.position.distanceTo(game.player.position) - b.position.distanceTo(game.player.position))[0]; }
function collect() { const gem = nearest(game.gems); if (!gem || gem.position.distanceTo(game.player.position) > 2.2) return notify('Move beside a glowing crystal and press E.'); world.remove(gem); game.gems.splice(game.gems.indexOf(gem), 1); game.levels[game.s * 10 + game.l].m++; notify(`Material gathered: ${game.levels[game.s * 10 + game.l].m} / ${3 + (game.l + 1) % 4 + 1}`); render(); }
function attack(type) { const now = performance.now(); if (!game.started || now < game.attackUntil) return; game.attackUntil = now + (type === 'heavy' ? 550 : 260); const reach = type === 'ability' ? 5 : type === 'heavy' ? 3.4 : 2.5, damage = weapons[game.weapon][1] * (type === 'ability' ? 2.4 : type === 'heavy' ? 1.7 : 1), enemy = game.ogres.find(e => e.parent && e.position.distanceTo(game.player.position) < reach); if (enemy) { world.remove(enemy); game.ogres.splice(game.ogres.indexOf(enemy), 1); game.levels[game.s * 10 + game.l].o++; game.coins += 5; game.score += 20; notify('Ogre defeated! +5 coins.'); } else if (game.boss && game.boss.position.distanceTo(game.player.position) < reach) { game.boss.userData.hp -= damage; if (game.boss.userData.hp <= 0) { world.remove(game.boss); game.boss = null; game.levels[game.s * 10 + game.l].b = true; game.item = crystal(11, -2, 0xf7c969); game.coins += 100; game.score += 100 + game.s * 50 + game.l * 10; notify('Boss defeated! +100 coins. Pick up the special item.'); } else notify(`${type} attack dealt ${Math.round(damage)} damage.`); } else notify('Move close to an enemy and attack.'); render(); }
function pickup() { if (!game.item || game.item.position.distanceTo(game.player.position) > 2.3) return notify('Defeat the boss, then move beside its special item.'); world.remove(game.item); game.item = null; game.levels[game.s * 10 + game.l].i = true; if (game.s * 10 + game.l < 69) game.open[game.s * 10 + game.l + 1] = true; notify(`${realms[game.s][2]} collected! Next level unlocked.`); render(); }
function next() { if (!game.levels[game.s * 10 + game.l].i) return notify('Collect the boss item before continuing.'); if (game.s * 10 + game.l === 69) return notify('You conquered all 70 levels!'); game.l++; if (game.l === 10) { game.s++; game.l = 0; } startLevel(); }
function buy(i) { if (!weapons[i][2]) { game.weapon = i; return render(); } if (game.coins < weapons[i][2]) return notify(`${weapons[i][0]} costs ${weapons[i][2]} coins.`); game.coins -= weapons[i][2]; game.weapon = i; notify(`${weapons[i][0]} equipped.`); render(); }
function animateCharacter(character, moving, speed, time) { const swing = moving ? Math.sin(time * speed) * .28 : 0; const arms = character.getObjectsByProperty('name', 'upperArm'), legs = character.getObjectsByProperty('name', 'thigh'); if (arms[0]) arms[0].rotation.z = THREE.MathUtils.lerp(arms[0].rotation.z, swing, .18); if (arms[1]) arms[1].rotation.z = THREE.MathUtils.lerp(arms[1].rotation.z, -swing, .18); if (legs[0]) legs[0].rotation.z = THREE.MathUtils.lerp(legs[0].rotation.z, -swing * .65, .18); if (legs[1]) legs[1].rotation.z = THREE.MathUtils.lerp(legs[1].rotation.z, swing * .65, .18); }
function damagePlayer(amount) { const now = performance.now(); if (now < game.playerInvulnerableUntil) return; game.playerInvulnerableUntil = now + 900; game.health = Math.max(0, game.health - amount); notify(`The boss struck you for ${amount} damage. Health: ${game.health}/100`); if (game.health === 0) { game.started = false; notify('You were defeated. Press Start adventure to try again.'); } }
function update(dt) { if (!game.started) return; game.time += dt; const k = game.keys, x = (k.d || k.ArrowRight ? 1 : 0) - (k.a || k.ArrowLeft ? 1 : 0), z = (k.s || k.ArrowDown ? 1 : 0) - (k.w || k.ArrowUp ? 1 : 0), moving = x !== 0 || z !== 0; const input = new THREE.Vector3(x, 0, z); if (input.lengthSq()) input.normalize().multiplyScalar(5); game.moveVelocity.lerp(input, 1 - Math.exp(-14 * dt)); game.player.position.addScaledVector(game.moveVelocity, dt); game.player.position.x = THREE.MathUtils.clamp(game.player.position.x, -15, 15); game.player.position.z = THREE.MathUtils.clamp(game.player.position.z, -5, 5); if (x) game.player.rotation.y = x > 0 ? 0 : Math.PI; game.wasMoving = moving; animateCharacter(game.player, game.moveVelocity.length() > .15, 8, game.time); game.gems.forEach(g => g.rotation.y += dt * 2); game.ogres.forEach(e => { if (e.position.distanceTo(game.player.position) > 1.6) { e.position.addScaledVector(game.player.position.clone().sub(e.position).setY(0).normalize(), dt * .8); animateCharacter(e, true, 5, game.time); } else damagePlayer(3); }); if (game.boss) { const distance = game.boss.position.distanceTo(game.player.position); game.boss.lookAt(game.player.position.x, game.boss.position.y, game.player.position.z); if (distance > 2.25) { game.boss.position.addScaledVector(game.player.position.clone().sub(game.boss.position).setY(0).normalize(), dt * .65); animateCharacter(game.boss, true, 4, game.time); } else if (game.time > game.boss.userData.nextAttack) { game.boss.userData.nextAttack = game.time + 2.2; notify(`${realms[game.s][1]} raises its weapon! Move away.`); damagePlayer(12 + game.s * 2); } } camera.lookAt(game.player.position.x, 1.4, game.player.position.z); }
function render() { const p = game.levels[game.s * 10 + game.l], t = { o: 3 + (game.l + 1) % 4, m: 4 + (game.l + 1) % 5 }, r = realms[game.s]; $('coins').textContent = game.coins; $('score').textContent = game.score; $('weapon').textContent = weapons[game.weapon][0]; $('realmName').textContent = r[0]; $('themeName').textContent = 'Realistic 3D realm'; $('bossName').textContent = r[1]; $('levelNumber').textContent = String(game.l + 1).padStart(2, '0'); $('ogreProgress').textContent = `${p.o} / ${t.o}`; $('materialProgress').textContent = `${p.m} / ${t.m}`; $('ogreBar').style.width = `${p.o / t.o * 100}%`; $('materialBar').style.width = `${p.m / t.m * 100}%`; $('levelGrid').innerHTML = realms.map((r, s) => `<div class="section-column"><h3>${s + 1}. ${r[0]}</h3><div class="levels">${Array.from({ length: 10 }, (_, l) => { const i = s * 10 + l, c = !game.open[i] ? 'locked' : s === game.s && l === game.l ? 'current' : game.levels[i].i ? 'done' : ''; return `<button class="level ${c}" data-level="${s}-${l}" ${!game.open[i] ? 'disabled' : ''}>${l + 1}</button>`; }).join('')}</div></div>`).join(''); document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { const [s, l] = b.dataset.level.split('-').map(Number); game.s = s; game.l = l; startLevel(); }); }
document.querySelectorAll('.tab').forEach(t => t.onclick = () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.view').forEach(x => x.classList.remove('active-view')); t.classList.add('active'); $(t.dataset.view).classList.add('active-view'); }); $('startBtn').onclick = startLevel; $('gatherBtn').onclick = collect; $('ogreBtn').onclick = () => notify('Move near an ogre and use J, K, or L.'); $('bossBtn').onclick = () => notify('Move near the boss and use J, K, or L.'); $('itemBtn').onclick = pickup; $('nextBtn').onclick = next;
let displayZoom = 1;
function updateZoom() { document.documentElement.style.setProperty('--game-zoom', displayZoom); document.querySelector('.app-shell').style.zoom = displayZoom; $('zoomValue').textContent = `${Math.round(displayZoom * 100)}%`; }
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
function changeZoom(amount) { displayZoom = Math.max(.8, Math.min(1.3, displayZoom + amount)); updateZoom(); }
$('fullscreenBtn').onclick = toggleFullscreen; $('zoomOutBtn').onclick = () => changeZoom(-.1); $('zoomInBtn').onclick = () => changeZoom(.1); updateZoom();
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && game.player && game.player.position.y <= 1.05) game.player.position.y = 2; } game.keys[e.key] = true; if (e.key === 'e' || e.key === 'E') collect(); if (e.key === 'j' || e.key === 'J') attack('light'); if (e.key === 'k' || e.key === 'K') attack('heavy'); if (e.key === 'l' || e.key === 'L') attack('ability'); }); addEventListener('keyup', e => { if (e.code === 'Space') e.preventDefault(); game.keys[e.key] = false; });
let last = performance.now(); function loop(now) { const dt = Math.min(.04, (now - last) / 1000); last = now; update(dt); if (game.player && game.player.position.y > 0) game.player.position.y = Math.max(0, game.player.position.y - 7 * dt); renderer.render(scene, camera); requestAnimationFrame(loop); } resize(); render(); requestAnimationFrame(loop);
