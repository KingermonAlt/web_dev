// Ogrefall - Python Backend Client
const API_URL = 'http://localhost:5000/api';

let gameState = {
  section: 0,
  level: 0,
  coins: 0,
  score: 0,
  weapon: 0,
  started: false,
  unlocked: Array(70).fill(false)
};

gameState.unlocked[0] = true;

let realms = [];
let weapons = [];

// Initialize
async function init() {
  try {
    const realmsRes = await fetch(`${API_URL}/realms`);
    const realmsData = await realmsRes.json();
    realms = realmsData.realms;
    
    const weaponsRes = await fetch(`${API_URL}/weapons`);
    const weaponsData = await weaponsRes.json();
    weapons = weaponsData.weapons;
    
    await loadState();
    render();
  } catch (error) {
    console.error('Failed to initialize:', error);
    setStatus('Connection error. Make sure the Python server is running on port 5000.');
  }
}

async function loadState() {
  try {
    const res = await fetch(`${API_URL}/state`);
    const data = await res.json();
    gameState = data;
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

const $ = id => document.getElementById(id);
const levelIndex = () => gameState.section * 10 + gameState.level;
const ogreTotal = () => 3 + (gameState.level + 1) % 4;
const materialTotal = () => 4 + (gameState.level + 1) % 5;
const weapon = () => weapons[gameState.weapon];

function setStatus(message) {
  $('status').textContent = message;
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}

function render() {
  if (realms.length === 0 || weapons.length === 0) return;
  
  const realm = realms[gameState.section];
  
  $('coins').textContent = gameState.coins;
  $('score').textContent = gameState.score;
  $('weapon').textContent = weapon() ? weapon()[0] : 'Rusty Sword';
  $('realmName').textContent = realm[0];
  $('themeName').textContent = realm[1];
  $('bossName').textContent = realm[2];
  $('levelNumber').textContent = String(gameState.level + 1).padStart(2, '0');
  
  const isDone = gameState.items && gameState.items[gameState.section] && gameState.items[gameState.section][gameState.level];
  const ogreDone = gameState.ogres && gameState.ogres[gameState.section] && gameState.ogres[gameState.section][gameState.level];
  const materialDone = gameState.materials && gameState.materials[gameState.section] && gameState.materials[gameState.section][gameState.level];
  
  $('ogreProgress').textContent = `${ogreDone ? ogreTotal() : 0} / ${ogreTotal()}`;
  $('materialProgress').textContent = `${materialDone ? materialTotal() : 0} / ${materialTotal()}`;
  $('ogreBar').style.width = `${ogreDone ? 100 : 0}%`;
  $('materialBar').style.width = `${materialDone ? 100 : 0}%`;
  
  renderMap();
  renderShop();
  renderCraft();
  renderLeaderboard();
  draw();
}

function renderMap() {
  $('levelGrid').innerHTML = realms.map((realm, s) => {
    const levels = Array.from({ length: 10 }, (_, l) => {
      const i = s * 10 + l;
      const isLocked = !gameState.unlocked[i];
      const isCurrent = s === gameState.section && l === gameState.level;
      const isDone = gameState.items && gameState.items[s] && gameState.items[s][l];
      const cls = isLocked ? 'locked' : isCurrent ? 'current' : isDone ? 'done' : '';
      
      return `<button class="level ${cls}" data-level="${s}-${l}" ${isLocked ? 'disabled' : ''}>${l + 1}</button>`;
    }).join('');
    
    return `<div class="section-column"><h3>${s + 1}. ${realm[0]}</h3><div class="levels">${levels}</div></div>`;
  }).join('');
  
  document.querySelectorAll('.level').forEach(b => {
    b.onclick = async () => {
      const [s, l] = b.dataset.level.split('-').map(Number);
      try {
        const res = await fetch(`${API_URL}/select-level`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: s, level: l })
        });
        const data = await res.json();
        gameState = data.state;
        setStatus(data.message);
        render();
      } catch (error) {
        console.error('Failed to select level:', error);
      }
    };
  });
}

function itemMarkup(item, i, craft = false) {
  const isEquipped = gameState.weapon === i;
  const btnText = isEquipped ? 'Equipped' : craft ? 'Craft / equip' : 'Buy / equip';
  return `<div class="item ${isEquipped ? 'equipped' : ''}">
    <div>
      <h3>${item[0]}</h3>
      <p>${item[3]} · ${item[1]} damage ${item[2] ? '· ' + item[2] + ' coins' : ''}</p>
    </div>
    <button data-weapon="${i}">${btnText}</button>
  </div>`;
}

function renderShop() {
  $('shopList').innerHTML = weapons.map((w, i) => itemMarkup(w, i)).join('');
  document.querySelectorAll('#shopList [data-weapon]').forEach(b => {
    b.onclick = async () => {
      const idx = Number(b.dataset.weapon);
      try {
        const res = await fetch(`${API_URL}/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weapon: idx })
        });
        const data = await res.json();
        if (data.state) {
          gameState = data.state;
          setStatus(data.message);
          render();
        } else {
          setStatus(data.error);
        }
      } catch (error) {
        console.error('Failed to buy:', error);
      }
    };
  });
}

function renderCraft() {
  const inventory = 'Materials: Wood 0 · Iron 0 · Leather 0 · Crystal 0 · Ember 0 · Sun Shards 0';
  $('inventory').textContent = inventory;
  $('craftList').innerHTML = weapons.map((w, i) => itemMarkup(w, i, true)).join('');
  document.querySelectorAll('#craftList [data-weapon]').forEach(b => {
    b.onclick = async () => {
      const idx = Number(b.dataset.weapon);
      try {
        const res = await fetch(`${API_URL}/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weapon: idx })
        });
        const data = await res.json();
        if (data.state) {
          gameState = data.state;
          setStatus(data.message);
          render();
        } else {
          setStatus(data.error);
        }
      } catch (error) {
        console.error('Failed to craft:', error);
      }
    };
  });
}

async function renderLeaderboard() {
  try {
    const res = await fetch(`${API_URL}/leaderboard`);
    const data = await res.json();
    const rows = data.leaderboard;
    $('leaderboardList').innerHTML = rows.map((r, i) => 
      `<div class="rank"><b>${String(i + 1).padStart(2, '0')}</b><strong>${r[0]}</strong><span>${r[1]} pts</span><span>${r[2]}</span></div>`
    ).join('');
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
  }
}

async function start() {
  try {
    const res = await fetch(`${API_URL}/start`, { method: 'POST' });
    const data = await res.json();
    gameState = data.state;
    setStatus(data.message);
    render();
  } catch (error) {
    console.error('Failed to start:', error);
  }
}

async function gather() {
  try {
    const res = await fetch(`${API_URL}/gather`, { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      gameState = data.state;
      setStatus(data.message);
      render();
    } else {
      setStatus(data.error);
    }
  } catch (error) {
    console.error('Failed to gather:', error);
  }
}

async function defeatOgres() {
  try {
    const res = await fetch(`${API_URL}/defeat-ogres`, { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      gameState = data.state;
      setStatus(data.message);
      render();
    } else {
      setStatus(data.error);
    }
  } catch (error) {
    console.error('Failed to defeat ogres:', error);
  }
}

async function fightBoss() {
  try {
    const res = await fetch(`${API_URL}/fight-boss`, { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      gameState = data.state;
      setStatus(data.message);
      render();
    } else {
      setStatus(data.error);
    }
  } catch (error) {
    console.error('Failed to fight boss:', error);
  }
}

async function takeItem() {
  try {
    const res = await fetch(`${API_URL}/take-item`, { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      gameState = data.state;
      setStatus(data.message);
      render();
    } else {
      setStatus(data.error);
    }
  } catch (error) {
    console.error('Failed to take item:', error);
  }
}

async function nextLevel() {
  try {
    const res = await fetch(`${API_URL}/next-level`, { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      gameState = data.state;
      setStatus(data.message);
      render();
    } else {
      setStatus(data.error);
    }
  } catch (error) {
    console.error('Failed to advance:', error);
  }
}

// Canvas drawing
function draw() {
  const c = $('gameCanvas');
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Sky gradient
  let sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#122c4c');
  sky.addColorStop(1, '#87b9ad');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  
  // Ground
  ctx.fillStyle = '#26475b';
  ctx.fillRect(0, 300, w, 150);
  ctx.fillStyle = '#356d55';
  ctx.fillRect(0, 385, w, 65);
  
  // Grass
  for (let x = 0; x < w; x += 75) {
    ctx.fillStyle = '#5eae77';
    ctx.fillRect(x, 376, 34, 9);
  }
  
  // Sky elements
  ctx.fillStyle = '#cbe7d7';
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.arc(675, 75, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Trees
  for (let x = 90; x < w; x += 160) {
    ctx.fillStyle = '#193b4c';
    ctx.fillRect(x, 260, 70, 120);
    ctx.fillStyle = '#275b62';
    ctx.fillRect(x - 15, 290, 100, 90);
  }
  
  // Player
  drawHero(ctx);
  
  // Text
  ctx.fillStyle = '#f7c969';
  ctx.font = 'bold 16px Space Grotesk';
  ctx.fillText(`Realm ${gameState.section + 1} · Level ${gameState.level + 1}`, 22, 28);
}

function drawHero(ctx) {
  const x = 220;
  const y = 330;
  
  ctx.fillStyle = '#61d7e7';
  ctx.fillRect(x - 20, y - 52, 40, 52);
  
  ctx.fillStyle = '#f5b27d';
  ctx.beginPath();
  ctx.arc(x, y - 70, 20, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#16243a';
  ctx.fillRect(x + 5, y - 74, 5, 5);
  
  ctx.fillStyle = '#f4cb62';
  ctx.fillRect(x - 17, y, 13, 9);
  ctx.fillRect(x + 4, y, 13, 9);
}

// Event listeners
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    tab.classList.add('active');
    $(tab.dataset.view).classList.add('active-view');
  };
});

$('startBtn').onclick = start;
$('gatherBtn').onclick = gather;
$('ogreBtn').onclick = defeatOgres;
$('bossBtn').onclick = fightBoss;
$('itemBtn').onclick = takeItem;
$('nextBtn').onclick = nextLevel;

// Keyboard controls
window.addEventListener('keydown', e => {
  if (['j', 'J'].includes(e.key)) {
    fetch(`${API_URL}/attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'light' })
    }).then(r => r.json()).then(d => setStatus(d.message));
  }
  if (['k', 'K'].includes(e.key)) {
    fetch(`${API_URL}/attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'heavy' })
    }).then(r => r.json()).then(d => setStatus(d.message));
  }
  if (['l', 'L'].includes(e.key)) {
    fetch(`${API_URL}/attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ability' })
    }).then(r => r.json()).then(d => setStatus(d.message));
  }
});

// Start the game
init();
