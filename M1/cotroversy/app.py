from flask import Flask, jsonify, request
from flask_cors import CORS
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Game data
REALMS = [
    ['Meadow of Beginnings','Green fields','Gorak the Rootbound','Rootheart Charm'],
    ['Ashen Mines','Molten caverns','Brakka Flame-Eater','Ember Core'],
    ['Whispering Woods','Ancient forest','The Moss Widow','Mosscloak'],
    ['Frozen Reach','Icy cliffs','Ymir Stonehide','Frost Titan Shard'],
    ['Sunken Ruins','Flooded temples','Drownmaw','Tidecaller Pearl'],
    ['Storm Citadel','Lightning towers','Voltus Prime','Storm Lens'],
    ["Ogre King's Throne",'Final fortress','Ogron, King of Ogres','Crown of the Ogre King']
]

WEAPONS = [
    ['Rusty Sword',12,0,'Free starter weapon'],
    ['Twin Daggers',20,80,'Fast dual strikes'],
    ['War Hammer',35,180,'Stuns ogres'],
    ['Storm Bow',50,320,'Ranged damage'],
    ['SUNBLADE',90,500,'Most powerful weapon']
]

# Game state
game_state = {
    'section': 0,
    'level': 0,
    'coins': 0,
    'score': 0,
    'weapon': 0,
    'started': False,
    'x': 220,
    'y': 330,
    'facing': 1,
    'lastAttack': 0,
    'ogres': [[False]*10 for _ in range(7)],
    'materials': [[False]*10 for _ in range(7)],
    'bosses': [[False]*10 for _ in range(7)],
    'items': [[False]*10 for _ in range(7)],
    'unlocked': [True] + [False]*69,
    'stamina': 100,
    'grounded': True,
    'vy': 0
}

# Live game state
live_state = {
    'section': 0,
    'level': 0,
    'started': False,
    'x': 120,
    'y': 350,
    'vy': 0,
    'facing': 1,
    'grounded': True,
    'stamina': 100,
    'cooldown': 0,
    'enemies': [],
    'gems': [],
    'boss': None,
    'levels': [{'ogres': 0, 'materials': 0, 'boss': False, 'item': False} for _ in range(70)]
}

def level_index(section, level):
    return section * 10 + level

def ogre_total(level):
    return 3 + (level + 1) % 4

def material_total(level):
    return 4 + (level + 1) % 5

@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(game_state)

@app.route('/api/state', methods=['POST'])
def update_state():
    data = request.json
    for key, value in data.items():
        if key in game_state:
            game_state[key] = value
    return jsonify(game_state)

@app.route('/api/start', methods=['POST'])
def start_adventure():
    game_state['started'] = True
    message = f'Level started. Gather materials, defeat ogres, then face the boss.'
    return jsonify({'status': 'started', 'message': message, 'state': game_state})

@app.route('/api/gather', methods=['POST'])
def gather_materials():
    if not game_state['started']:
        return jsonify({'error': 'Press Start Adventure first.'}), 400
    
    section = game_state['section']
    level = game_state['level']
    
    if game_state['materials'][section][level]:
        return jsonify({'error': 'All materials collected in this level.'}), 400
    
    game_state['materials'][section][level] = True
    mat_total = material_total(level)
    message = f'Collected {mat_total} materials.'
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/defeat-ogres', methods=['POST'])
def defeat_ogres():
    if not game_state['started']:
        return jsonify({'error': 'Press Start Adventure first.'}), 400
    
    section = game_state['section']
    level = game_state['level']
    
    if game_state['ogres'][section][level]:
        return jsonify({'error': 'Every ogre here is already defeated.'}), 400
    
    game_state['ogres'][section][level] = True
    og_total = ogre_total(level)
    coins_earned = og_total * 5
    game_state['coins'] += coins_earned
    
    message = f'{og_total} ogres defeated! +{coins_earned} coins.'
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/fight-boss', methods=['POST'])
def fight_boss():
    section = game_state['section']
    level = game_state['level']
    
    if not game_state['ogres'][section][level] or not game_state['materials'][section][level]:
        return jsonify({'error': 'Defeat all ogres and gather materials first.'}), 400
    
    if game_state['bosses'][section][level]:
        return jsonify({'error': 'Boss defeated. Pick up the special item.'}), 400
    
    game_state['bosses'][section][level] = True
    game_state['coins'] += 100
    game_state['score'] += 100 + section * 50 + level * 10
    
    boss_name = REALMS[section][2]
    message = f'{boss_name} defeated! +100 coins.'
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/take-item', methods=['POST'])
def take_item():
    section = game_state['section']
    level = game_state['level']
    
    if not game_state['bosses'][section][level]:
        return jsonify({'error': 'Defeat the boss to reveal the special item.'}), 400
    
    if game_state['items'][section][level]:
        return jsonify({'error': 'Special item already collected.'}), 400
    
    game_state['items'][section][level] = True
    idx = level_index(section, level)
    if idx < 69:
        game_state['unlocked'][idx + 1] = True
    
    item_name = REALMS[section][3]
    message = f'Collected {item_name}! Next level unlocked.'
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/next-level', methods=['POST'])
def next_level():
    section = game_state['section']
    level = game_state['level']
    idx = level_index(section, level)
    
    if not game_state['items'][section][level]:
        return jsonify({'error': 'Pick up the boss item before continuing.'}), 400
    
    if idx >= 69:
        return jsonify({'error': 'You conquered all 70 levels!'}), 400
    
    game_state['level'] += 1
    if game_state['level'] == 10:
        game_state['section'] += 1
        game_state['level'] = 0
    
    message = f"{REALMS[game_state['section']][0]} - Level {game_state['level'] + 1} begins."
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/select-level', methods=['POST'])
def select_level():
    data = request.json
    section = data.get('section')
    level = data.get('level')
    
    game_state['section'] = section
    game_state['level'] = level
    game_state['started'] = False
    
    message = f"{REALMS[section][0]} - Level {level + 1} selected."
    return jsonify({'message': message, 'state': game_state})

@app.route('/api/buy', methods=['POST'])
def buy_weapon():
    data = request.json
    weapon_idx = data.get('weapon')
    
    if weapon_idx < 0 or weapon_idx >= len(WEAPONS):
        return jsonify({'error': 'Invalid weapon.'}), 400
    
    weapon = WEAPONS[weapon_idx]
    
    # Free weapon
    if weapon[2] == 0:
        game_state['weapon'] = weapon_idx
        return jsonify({'message': f"{weapon[0]} equipped!", 'state': game_state})
    
    # Check coins
    if game_state['coins'] < weapon[2]:
        return jsonify({'error': f"{weapon[0]} costs {weapon[2]} coins."}), 400
    
    game_state['coins'] -= weapon[2]
    game_state['weapon'] = weapon_idx
    
    return jsonify({'message': f"{weapon[0]} equipped!", 'state': game_state})

@app.route('/api/attack', methods=['POST'])
def attack():
    data = request.json
    attack_type = data.get('type')  # 'light', 'heavy', 'ability'
    
    if not game_state['started']:
        return jsonify({'error': 'Start the level first.'}), 400
    
    weapon = WEAPONS[game_state['weapon']]
    base_damage = weapon[1]
    
    if attack_type == 'light':
        damage = base_damage
    elif attack_type == 'heavy':
        damage = base_damage * 2
    elif attack_type == 'ability':
        damage = base_damage * 3
    else:
        return jsonify({'error': 'Invalid attack type.'}), 400
    
    message = f'{attack_type.capitalize()} attack! {damage} damage dealt.'
    return jsonify({'message': message, 'damage': damage})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    rows = [
        ['Mira', 4800, '7-10'],
        ['CodeKnight', 3600, '5-8'],
        ['OgreBane', 2250, '4-3'],
        ['You', game_state['score'], f"{game_state['section']+1}-{game_state['level']+1}"]
    ]
    rows.sort(key=lambda x: x[1], reverse=True)
    return jsonify({'leaderboard': rows})

@app.route('/api/weapons', methods=['GET'])
def get_weapons():
    return jsonify({'weapons': WEAPONS})

@app.route('/api/realms', methods=['GET'])
def get_realms():
    return jsonify({'realms': REALMS})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
