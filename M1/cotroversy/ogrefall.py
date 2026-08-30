import pygame
import math
import random
from enum import Enum
from dataclasses import dataclass
from typing import List, Tuple

pygame.init()

# Constants
WIDTH, HEIGHT = 1200, 600
FPS = 60
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
CANVAS_WIDTH, CANVAS_HEIGHT = 840, 450

# Colors
SKY_DARK = (18, 44, 76)
SKY_LIGHT = (135, 185, 173)
GROUND_DARK = (38, 71, 91)
GROUND_MID = (53, 109, 85)
GRASS = (94, 174, 119)
PLAYER_COLOR = (97, 215, 231)
SKIN_COLOR = (245, 178, 125)
FACE_COLOR = (22, 36, 58)
GOLD_COLOR = (247, 201, 105)
OGRE_BODY = (114, 189, 114)
OGRE_HEAD = (183, 220, 120)
BOSS_BODY = (174, 99, 137)
BOSS_HEAD = (229, 138, 157)
GEM_COLOR = (168, 221, 114)
HEALTH_BG = (29, 37, 53)
HEALTH_FG = (255, 129, 112)

# Realm Data
REALMS = [
    ['Meadow of Beginnings', 'Green fields', 'Gorak the Rootbound', 'Rootheart Charm', (76, 191, 138)],
    ['Ashen Mines', 'Molten caverns', 'Brakka Flame-Eater', 'Ember Core', (233, 120, 77)],
    ['Whispering Woods', 'Ancient forest', 'The Moss Widow', 'Mosscloak', (116, 191, 98)],
    ['Frozen Reach', 'Icy cliffs', 'Ymir Stonehide', 'Frost Titan Shard', (118, 201, 232)],
    ['Sunken Ruins', 'Flooded temples', 'Drownmaw', 'Tidecaller Pearl', (87, 155, 224)],
    ['Storm Citadel', 'Lightning towers', 'Voltus Prime', 'Storm Lens', (178, 139, 232)],
    ["Ogre King's Throne", 'Final fortress', 'Ogron, King of Ogres', 'Crown of the Ogre King', (237, 198, 91)]
]

# Weapons: [name, damage, cost, description]
WEAPONS = [
    ['Rusty Sword', 12, 0, 'Free starter weapon'],
    ['Twin Daggers', 20, 80, 'Fast dual strikes'],
    ['War Hammer', 35, 180, 'Stuns ogres'],
    ['Storm Bow', 50, 320, 'Ranged damage'],
    ['SUNBLADE', 90, 500, 'Most powerful weapon']
]

@dataclass
class Enemy:
    x: float
    y: float
    hp: float
    max_hp: float
    alive: bool = True

@dataclass
class Gem:
    x: float
    y: float
    taken: bool = False

@dataclass
class Boss:
    x: float
    y: float
    hp: float
    max_hp: float
    alive: bool = True

class GameMode(Enum):
    ADVENTURE = 0
    SHOP = 1
    CRAFT = 2
    LEADERBOARD = 3

class GameState:
    def __init__(self):
        self.mode = GameMode.ADVENTURE
        self.section = 0
        self.level = 0
        self.coins = 0
        self.score = 0
        self.weapon = 0
        self.started = False
        
        # Live game state
        self.x = 120
        self.y = 350
        self.vy = 0
        self.facing = 1
        self.grounded = True
        self.stamina = 100
        self.cooldown = 0
        
        # Level tracking
        self.levels = [{'ogres': 0, 'materials': 0, 'boss': False, 'item': False} for _ in range(70)]
        self.unlocked = [False] * 70
        self.unlocked[0] = True
        
        # Current level entities
        self.enemies: List[Enemy] = []
        self.gems: List[Gem] = []
        self.boss: Boss = None
        
        # Keyboard state
        self.keys = {}
        
        # Toast message
        self.toast_message = ""
        self.toast_timer = 0

    def level_index(self):
        return self.section * 10 + self.level
    
    def current_level_data(self):
        return self.levels[self.level_index()]
    
    def ogre_total(self):
        return 3 + (self.level + 1) % 4
    
    def material_total(self):
        return 4 + (self.level + 1) % 5
    
    def current_weapon(self):
        return WEAPONS[self.weapon]

class OgrefallGame:
    def __init__(self):
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Ogrefall - Adventure RPG")
        self.clock = pygame.time.Clock()
        self.font_large = pygame.font.Font(None, 28)
        self.font_medium = pygame.font.Font(None, 20)
        self.font_small = pygame.font.Font(None, 16)
        
        self.state = GameState()
        self.running = True
        self.last_time = pygame.time.get_ticks()

    def show_message(self, message):
        self.state.toast_message = message
        self.state.toast_timer = 2600

    def spawn_level(self):
        level_data = self.state.current_level_data()
        totals = {
            'ogres': self.state.ogre_total(),
            'materials': self.state.material_total()
        }
        
        # Spawn remaining ogres
        self.state.enemies = []
        for n in range(level_data['ogres'], totals['ogres']):
            hp = 45 + self.state.level * 5
            self.state.enemies.append(Enemy(
                x=340 + n * 125,
                y=350,
                hp=hp,
                max_hp=hp
            ))
        
        # Spawn remaining gems
        self.state.gems = []
        for n in range(level_data['materials'], totals['materials']):
            self.state.gems.append(Gem(x=220 + n * 105, y=330))
        
        # Spawn boss if not defeated
        if not level_data['boss']:
            hp = 230 + self.state.section * 45 + self.state.level * 8
            self.state.boss = Boss(x=735, y=350, hp=hp, max_hp=hp)
        else:
            self.state.boss = None

    def start_level(self):
        if not self.state.started:
            self.state.started = True
            self.state.x = 120
            self.state.y = 350
            self.state.vy = 0
            self.spawn_level()
            level_data = self.state.current_level_data()
            msg = f"Level {self.state.level + 1}: Gather materials, defeat ogres, then fight the boss."
            self.show_message(msg)

    def collect_gem(self):
        if not self.state.started:
            self.show_message("Press Start Adventure first.")
            return
        
        for gem in self.state.gems:
            if not gem.taken and abs(gem.x - self.state.x) < 48 and abs(gem.y - self.state.y) < 55:
                gem.taken = True
                level_data = self.state.current_level_data()
                level_data['materials'] += 1
                msg = f"Material gathered: {level_data['materials']} / {self.state.material_total()}"
                self.show_message(msg)
                return
        
        self.show_message("Move beside a glowing crystal and press E.")

    def attack(self, attack_type: str):
        if not self.state.started:
            return
        
        now = pygame.time.get_ticks()
        costs = {'light': 0, 'heavy': 20, 'ability': 35}
        cooldowns = {'light': 260, 'heavy': 500, 'ability': 260}
        
        cost = costs.get(attack_type, 0)
        cooldown = cooldowns.get(attack_type, 260)
        
        if now < self.state.cooldown:
            return
        
        if self.state.stamina < cost:
            self.show_message("Not enough stamina.")
            return
        
        self.state.cooldown = now + cooldown
        self.state.stamina -= cost
        
        multipliers = {'light': 1.0, 'heavy': 1.7, 'ability': 2.4}
        reaches = {'light': 90, 'heavy': 125, 'ability': 220}
        
        damage = self.state.current_weapon()[1] * multipliers[attack_type]
        reach = reaches[attack_type]
        hit_x = self.state.x + self.state.facing * reach
        
        # Check enemy hits
        level_data = self.state.current_level_data()
        for enemy in self.state.enemies:
            if enemy.alive and abs(enemy.x - hit_x) < reach and abs(enemy.y - self.state.y) < 75:
                enemy.hp -= damage
                if enemy.hp <= 0:
                    enemy.alive = False
                    level_data['ogres'] += 1
                    self.state.coins += 5
                    self.state.score += 20
                    self.show_message("Ogre defeated! +5 coins.")
        
        # Check boss hit
        if self.state.boss and self.state.boss.alive and abs(self.state.boss.x - hit_x) < reach and abs(self.state.boss.y - self.state.y) < 90:
            self.state.boss.hp -= damage
            if self.state.boss.hp <= 0:
                self.state.boss.alive = False
                level_data['boss'] = True
                self.state.coins += 100
                self.state.score += 100 + self.state.section * 50 + self.state.level * 10
                boss_name = REALMS[self.state.section][2]
                self.show_message(f"{boss_name} defeated! +100 coins.")

    def pickup_item(self):
        level_data = self.state.current_level_data()
        if not level_data['boss']:
            self.show_message("Defeat the boss first.")
            return
        
        if level_data['item']:
            self.show_message("Special item already collected.")
            return
        
        level_data['item'] = True
        idx = self.state.level_index()
        if idx < 69:
            self.state.unlocked[idx + 1] = True
        
        item_name = REALMS[self.state.section][3]
        self.show_message(f"{item_name} collected! Next level unlocked.")

    def next_level(self):
        level_data = self.state.current_level_data()
        if not level_data['item']:
            self.show_message("Finish the boss and collect its item first.")
            return
        
        idx = self.state.level_index()
        if idx >= 69:
            self.show_message("You conquered all 70 levels!")
            return
        
        self.state.level += 1
        if self.state.level == 10:
            self.state.section += 1
            self.state.level = 0
        
        self.start_level()

    def update(self):
        now = pygame.time.get_ticks()
        dt = min(0.035, (now - self.last_time) / 1000.0)
        self.last_time = now
        
        if self.state.toast_timer > 0:
            self.state.toast_timer -= int(dt * 1000)
        
        if not self.state.started:
            return
        
        # Movement
        dx = 0
        if self.state.keys.get('a') or self.state.keys.get('left'):
            dx = -1
        if self.state.keys.get('d') or self.state.keys.get('right'):
            dx = 1
        
        if dx:
            self.state.x = max(25, min(815, self.state.x + dx * 220 * dt))
            self.state.facing = dx
        
        if self.state.keys.get('w') or self.state.keys.get('up'):
            self.state.y = max(270, self.state.y - 120 * dt)
        if self.state.keys.get('s') or self.state.keys.get('down'):
            self.state.y = min(350, self.state.y + 120 * dt)
        
        # Physics
        self.state.vy += 900 * dt
        self.state.y += self.state.vy * dt
        
        if self.state.y >= 350:
            self.state.y = 350
            self.state.vy = 0
            self.state.grounded = True
        else:
            self.state.grounded = False
        
        # Stamina regen
        self.state.stamina = min(100, self.state.stamina + 18 * dt)
        
        # Enemy AI
        for enemy in self.state.enemies:
            if enemy.alive and abs(enemy.x - self.state.x) > 55:
                direction = 1 if self.state.x > enemy.x else -1
                enemy.x += direction * 38 * dt
        
        # Boss AI
        if self.state.boss and self.state.boss.alive and abs(self.state.boss.x - self.state.x) > 110:
            direction = 1 if self.state.x > self.state.boss.x else -1
            self.state.boss.x += direction * 14 * dt

    def draw_canvas(self, surface: pygame.Surface):
        canvas = pygame.Surface((CANVAS_WIDTH, CANVAS_HEIGHT))
        
        # Sky gradient
        for y in range(CANVAS_HEIGHT):
            ratio = y / CANVAS_HEIGHT
            r = int(SKY_DARK[0] + (SKY_LIGHT[0] - SKY_DARK[0]) * ratio)
            g = int(SKY_DARK[1] + (SKY_LIGHT[1] - SKY_DARK[1]) * ratio)
            b = int(SKY_DARK[2] + (SKY_LIGHT[2] - SKY_DARK[2]) * ratio)
            pygame.draw.line(canvas, (r, g, b), (0, y), (CANVAS_WIDTH, y))
        
        # Ground layers
        pygame.draw.rect(canvas, GROUND_DARK, (0, 245, CANVAS_WIDTH, 205))
        pygame.draw.rect(canvas, GROUND_MID, (0, 367, CANVAS_WIDTH, 83))
        
        # Grass
        for i in range(0, CANVAS_WIDTH, 72):
            pygame.draw.rect(canvas, GRASS, (i, 358, 34, 8))
        
        # Draw gems
        for gem in self.state.gems:
            if not gem.taken:
                points = [
                    (gem.x, gem.y - 25),
                    (gem.x + 14, gem.y),
                    (gem.x, gem.y + 20),
                    (gem.x - 14, gem.y)
                ]
                pygame.draw.polygon(canvas, GEM_COLOR, points)
        
        # Draw enemies
        for enemy in self.state.enemies:
            if enemy.alive:
                pygame.draw.rect(canvas, OGRE_BODY, (enemy.x - 28, enemy.y - 72, 56, 72))
                pygame.draw.circle(canvas, OGRE_HEAD, (int(enemy.x), int(enemy.y - 88)), 31)
                pygame.draw.rect(canvas, FACE_COLOR, (int(enemy.x - 16), int(enemy.y - 93), 7, 7))
                pygame.draw.rect(canvas, FACE_COLOR, (int(enemy.x + 10), int(enemy.y - 93), 7, 7))
                self.draw_health_bar(canvas, int(enemy.x - 25), int(enemy.y - 112), 50, enemy.hp / enemy.max_hp)
        
        # Draw boss
        if self.state.boss and self.state.boss.alive:
            pygame.draw.rect(canvas, BOSS_BODY, (int(self.state.boss.x - 43), int(self.state.boss.y - 105), 86, 105))
            pygame.draw.circle(canvas, BOSS_HEAD, (int(self.state.boss.x), int(self.state.boss.y - 125)), 48)
            self.draw_health_bar(canvas, int(self.state.boss.x - 55), int(self.state.boss.y - 185), 110, self.state.boss.hp / self.state.boss.max_hp)
        
        # Draw player
        player_rect = pygame.draw.rect(canvas, PLAYER_COLOR, (int(self.state.x - 21), int(self.state.y - 53), 42, 53))
        pygame.draw.circle(canvas, SKIN_COLOR, (int(self.state.x), int(self.state.y - 70)), 21)
        pygame.draw.rect(canvas, FACE_COLOR, (int(self.state.x + 6), int(self.state.y - 74), 5, 5))
        
        # Sword effect
        sword_start = (int(self.state.x + 17), int(self.state.y - 38))
        sword_end = (int(self.state.x + 57), int(self.state.y - 62))
        pygame.draw.line(canvas, WHITE, sword_start, sword_end, 4)
        
        # Text overlay
        realm_text = self.font_medium.render(f"REALM {self.state.section + 1} · LEVEL {self.state.level + 1}", True, GOLD_COLOR)
        canvas.blit(realm_text, (20, 10))
        
        return canvas

    def draw_health_bar(self, surface, x, y, width, value):
        pygame.draw.rect(surface, HEALTH_BG, (x, y, width, 6))
        pygame.draw.rect(surface, HEALTH_FG, (x, y, int(width * max(0, value)), 6))

    def draw_ui(self, surface: pygame.Surface):
        # Panel background
        pygame.draw.rect(surface, (20, 30, 40), (CANVAS_WIDTH, 0, WIDTH - CANVAS_WIDTH, HEIGHT))
        
        x_start = CANVAS_WIDTH + 20
        y_pos = 20
        line_height = 28
        
        # Stats
        stats_text = [
            f"Coins: {self.state.coins}",
            f"Score: {self.state.score}",
            f"Weapon: {self.state.current_weapon()[0]}",
            "",
            f"Realm: {REALMS[self.state.section][0]}",
            f"Theme: {REALMS[self.state.section][1]}",
            f"Boss: {REALMS[self.state.section][2]}",
            "",
            f"Level: {self.state.level + 1:02d}",
        ]
        
        for text in stats_text:
            if text:
                rendered = self.font_small.render(text, True, WHITE)
                surface.blit(rendered, (x_start, y_pos))
            y_pos += line_height
        
        # Progress bars
        level_data = self.state.current_level_data()
        ogre_text = f"Ogres: {level_data['ogres']} / {self.state.ogre_total()}"
        material_text = f"Materials: {level_data['materials']} / {self.state.material_total()}"
        
        rendered = self.font_small.render(ogre_text, True, WHITE)
        surface.blit(rendered, (x_start, y_pos))
        y_pos += line_height
        
        # Ogre bar
        bar_width = 200
        pygame.draw.rect(surface, (50, 50, 50), (x_start, y_pos, bar_width, 15))
        pygame.draw.rect(surface, (100, 200, 100), (x_start, y_pos, int(bar_width * level_data['ogres'] / self.state.ogre_total()), 15))
        y_pos += 25
        
        rendered = self.font_small.render(material_text, True, WHITE)
        surface.blit(rendered, (x_start, y_pos))
        y_pos += line_height
        
        # Material bar
        pygame.draw.rect(surface, (50, 50, 50), (x_start, y_pos, bar_width, 15))
        pygame.draw.rect(surface, (100, 200, 100), (x_start, y_pos, int(bar_width * level_data['materials'] / self.state.material_total()), 15))
        y_pos += 25
        
        # Buttons
        button_width = 150
        button_height = 30
        buttons = [
            ("START ADVENTURE", self.start_level),
            ("COLLECT GEMS (E)", self.collect_gem),
            ("ATTACK LIGHT (J)", lambda: self.attack('light')),
            ("ATTACK HEAVY (K)", lambda: self.attack('heavy')),
            ("ABILITY (L)", lambda: self.attack('ability')),
            ("PICK UP ITEM", self.pickup_item),
            ("NEXT LEVEL", self.next_level),
        ]
        
        y_pos += 10
        for label, _ in buttons:
            rendered = self.font_small.render(label, True, GOLD_COLOR)
            surface.blit(rendered, (x_start, y_pos))
            y_pos += line_height + 5

    def draw_toast(self, surface: pygame.Surface):
        if self.state.toast_timer > 0:
            toast_text = self.font_medium.render(self.state.toast_message, True, GOLD_COLOR)
            toast_rect = toast_text.get_rect()
            toast_rect.midbottom = (WIDTH // 2, HEIGHT - 20)
            
            bg_rect = toast_rect.inflate(20, 10)
            pygame.draw.rect(surface, (50, 50, 50), bg_rect)
            pygame.draw.rect(surface, GOLD_COLOR, bg_rect, 2)
            
            surface.blit(toast_text, toast_rect)

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            
            elif event.type == pygame.KEYDOWN:
                key = event.key
                if key == pygame.K_a:
                    self.state.keys['a'] = True
                elif key == pygame.K_d:
                    self.state.keys['d'] = True
                elif key == pygame.K_w:
                    self.state.keys['w'] = True
                elif key == pygame.K_s:
                    self.state.keys['s'] = True
                elif key == pygame.K_LEFT:
                    self.state.keys['left'] = True
                elif key == pygame.K_RIGHT:
                    self.state.keys['right'] = True
                elif key == pygame.K_UP:
                    self.state.keys['up'] = True
                elif key == pygame.K_DOWN:
                    self.state.keys['down'] = True
                elif key == pygame.K_SPACE and self.state.grounded:
                    self.state.vy = -470
                    self.state.grounded = False
                elif key in (pygame.K_e, pygame.K_E):
                    self.collect_gem()
                elif key in (pygame.K_j, pygame.K_J):
                    self.attack('light')
                elif key in (pygame.K_k, pygame.K_K):
                    self.attack('heavy')
                elif key in (pygame.K_l, pygame.K_L):
                    self.attack('ability')
            
            elif event.type == pygame.KEYUP:
                key = event.key
                if key == pygame.K_a:
                    self.state.keys['a'] = False
                elif key == pygame.K_d:
                    self.state.keys['d'] = False
                elif key == pygame.K_w:
                    self.state.keys['w'] = False
                elif key == pygame.K_s:
                    self.state.keys['s'] = False
                elif key == pygame.K_LEFT:
                    self.state.keys['left'] = False
                elif key == pygame.K_RIGHT:
                    self.state.keys['right'] = False
                elif key == pygame.K_UP:
                    self.state.keys['up'] = False
                elif key == pygame.K_DOWN:
                    self.state.keys['down'] = False

    def run(self):
        while self.running:
            self.handle_events()
            self.update()
            
            # Draw
            self.screen.fill((10, 15, 20))
            
            # Draw game canvas
            canvas = self.draw_canvas(self.screen)
            self.screen.blit(canvas, (0, 0))
            
            # Draw UI panel
            self.draw_ui(self.screen)
            
            # Draw toast
            self.draw_toast(self.screen)
            
            pygame.display.flip()
            self.clock.tick(FPS)
        
        pygame.quit()

if __name__ == "__main__":
    game = OgrefallGame()
    game.run()
