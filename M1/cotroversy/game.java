import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.util.ArrayList;
import java.util.HashMap;

/**
 * Ogrefall: a complete single-player 2D side-view RPG prototype.
 * Compile: javac game.java   Run: java game
 */
public class game extends JFrame {
	public game() {
		setTitle("OGREFALL - 70 Level Adventure");
		setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
		setResizable(false);
		add(new GamePanel());
		pack();
		setLocationRelativeTo(null);
		setVisible(true);
	}

	public static void main(String[] args) {
		SwingUtilities.invokeLater(game::new);
	}
}

class GamePanel extends JPanel implements ActionListener, KeyListener {
	private static final int WIDTH = 1100, HEIGHT = 700;
	private final Timer timer = new Timer(16, this);
	private final String[] sections = {"Meadow of Beginnings", "Ashen Mines", "Whispering Woods", "Frozen Reach", "Sunken Ruins", "Storm Citadel", "Ogre King's Throne"};
	private final String[] themes = {"Green fields", "Molten caverns", "Ancient forest", "Icy cliffs", "Flooded temples", "Lightning towers", "Final fortress"};
	private final String[] bosses = {"Gorak the Rootbound", "Brakka Flame-Eater", "The Moss Widow", "Ymir Stonehide", "Drownmaw", "Voltus Prime", "Ogron, King of Ogres"};
	private final String[] bossItems = {"Rootheart Charm", "Ember Core", "Mosscloak", "Frost Titan Shard", "Tidecaller Pearl", "Storm Lens", "Crown of the Ogre King"};
	private final ArrayList<Weapon> weapons = new ArrayList<>();
	private final HashMap<String, Integer> materials = new HashMap<>();
	private final ArrayList<Score> leaderboard = new ArrayList<>();
	private final boolean[][] ogres = new boolean[7][10];
	private final boolean[][] gathered = new boolean[7][10];
	private final boolean[][] bossBeaten = new boolean[7][10];
	private final boolean[][] itemTaken = new boolean[7][10];
	private final boolean[] unlocked = new boolean[70];
	private int section, level, coins, score, health = 100, stamina = 100, combo;
	private int playerX = 220, playerY = 525;
	private boolean left, right, up, down, facingRight = true, started;
	private String equipped = "Rusty Sword", screen = "adventure", status = "Press START to begin your adventure.";
	private long lastAttack;

	GamePanel() {
		setPreferredSize(new Dimension(WIDTH, HEIGHT));
		setFocusable(true);
		addKeyListener(this);
		addMouseListener(new MouseAdapter() {
			@Override public void mousePressed(MouseEvent event) { handleClick(event.getX(), event.getY()); }
		});
		weapons.add(new Weapon("Rusty Sword", 12, 0, "Free starter weapon"));
		weapons.add(new Weapon("Twin Daggers", 20, 80, "2 Iron + 1 Leather"));
		weapons.add(new Weapon("War Hammer", 35, 180, "4 Iron + 2 Wood"));
		weapons.add(new Weapon("Storm Bow", 50, 320, "3 Crystal + 2 Wood"));
		weapons.add(new Weapon("SUNBLADE", 90, 500, "5 Sun Shards + 3 Ember"));
		for (String material : new String[]{"Wood", "Iron", "Leather", "Crystal", "Ember", "Sun Shards"}) materials.put(material, material.equals("Wood") ? 3 : 0);
		unlocked[0] = true;
		leaderboard.add(new Score("Mira", 4800, "7-10"));
		leaderboard.add(new Score("CodeKnight", 3600, "5-8"));
		leaderboard.add(new Score("OgreBane", 2250, "4-3"));
		timer.start();
	}

	private int index() { return section * 10 + level; }
	private int ogreCount() { return 3 + (level + 1) % 4; }
	private int materialCount() { return 4 + (level + 1) % 5; }
	private boolean isComplete() { return ogres[section][level] && gathered[section][level] && bossBeaten[section][level] && itemTaken[section][level]; }
	private Weapon weapon() { for (Weapon item : weapons) if (item.name.equals(equipped)) return item; return weapons.get(0); }

	@Override public void actionPerformed(ActionEvent event) {
		if (started && screen.equals("adventure")) {
			if (left) { playerX = Math.max(40, playerX - 5); facingRight = false; }
			if (right) { playerX = Math.min(WIDTH - 40, playerX + 5); facingRight = true; }
			if (up) playerY = Math.max(390, playerY - 3);
			if (down) playerY = Math.min(525, playerY + 3);
			stamina = Math.min(100, stamina + 1);
		}
		repaint();
	}

	private void start() { started = true; status = "Level 1: gather materials, defeat the ogres, then fight the boss."; requestFocusInWindow(); }
	private void gather() {
		if (!started) { status = "Press START ADVENTURE first."; return; }
		if (gathered[section][level]) status = "All materials collected in this level.";
		else { gathered[section][level] = true; addMaterial("Crystal", materialCount()); status = "Materials gathered: " + materialCount() + "."; }
	}
	private void defeatOgres() {
		if (!started) { status = "Start the adventure first."; return; }
		if (ogres[section][level]) { status = "Every ogre here has already been defeated."; return; }
		ogres[section][level] = true; coins += ogreCount() * 5; addMaterial("Wood", ogreCount());
		status = ogreCount() + " ogres defeated! +" + ogreCount() * 5 + " coins.";
	}
	private void fightBoss() {
		if (!ogres[section][level] || !gathered[section][level]) { status = "Defeat all ogres and gather the materials first."; return; }
		if (bossBeaten[section][level]) { status = "Boss defeated. Pick up the special item."; return; }
		bossBeaten[section][level] = true; coins += 100; score += 100 + section * 50 + level * 10;
		status = bosses[section] + " defeated! +100 coins. Special item unlocked: " + bossItems[section];
		updateScore();
	}
	private void takeItem() {
		if (!bossBeaten[section][level]) { status = "Defeat the boss to reveal the special item."; return; }
		if (itemTaken[section][level]) { status = "You already collected " + bossItems[section] + "."; return; }
		itemTaken[section][level] = true; addMaterial("Sun Shards", 1); unlockNext(); status = "Collected " + bossItems[section] + "! Next level unlocked.";
	}
	private void unlockNext() { if (index() < 69) unlocked[index() + 1] = true; }
	private void nextLevel() { if (!isComplete()) { status = "Finish the boss and collect its special item first."; return; } if (index() == 69) status = "You conquered all 70 levels!"; else { level++; if (level == 10) { section++; level = 0; } status = sections[section] + " - Level " + (level + 1) + " begins."; } }
	private void attack(String move, int damage, int staminaCost) {
		long now = System.currentTimeMillis();
		if (now - lastAttack < 300 || stamina < staminaCost) return;
		lastAttack = now; stamina -= staminaCost; combo = combo % 3 + 1; status = move + "! " + damage + " damage, combo x" + combo + ".";
		if (!ogres[section][level]) defeatOgres();
	}
	private void addMaterial(String name, int amount) { materials.put(name, materials.get(name) + amount); }
	private void buyOrCraft(Weapon item) { if (item.name.equals("Rusty Sword")) { equipped = item.name; status = "Rusty Sword equipped."; return; } if (coins < item.cost) status = item.name + " costs " + item.cost + " coins. Earn more by defeating ogres and bosses."; else { coins -= item.cost; equipped = item.name; status = item.name + " purchased and equipped!"; } }
	private void updateScore() { leaderboard.removeIf(entry -> entry.name.equals("You")); leaderboard.add(new Score("You", score, (section + 1) + "-" + (level + 1))); leaderboard.sort((a, b) -> Integer.compare(b.points, a.points)); }
	private void selectLevel(int selectedSection, int selectedLevel) { if (!unlocked[selectedSection * 10 + selectedLevel]) { status = "This level is locked. Collect the previous boss item."; return; } section = selectedSection; level = selectedLevel; status = sections[section] + " - Level " + (level + 1) + " selected."; }
	private void handleClick(int x, int y) {
		requestFocusInWindow();
		if (y < 65) {
			if (x >= 790 && x < 880) screen = "adventure";
			else if (x >= 885 && x < 945) screen = "shop";
			else if (x >= 950 && x < 1015) screen = "crafting";
			else if (x >= 1020) screen = "leaderboard";
			repaint();
			return;
		}
		if (screen.equals("adventure")) {
			if (y >= 215 && y < 260) {
				if (x < 185) start(); else if (x < 350) gather(); else if (x < 480) defeatOgres(); else if (x < 605) fightBoss(); else if (x < 750) takeItem(); else if (x < 870) nextLevel();
			} else if (y >= 345 && y < 410) {
				for (int s = 0; s < 7; s++) for (int l = 0; l < 10; l++) {
					int cellX = 30 + s * 150 + (l % 5) * 28, cellY = 345 + (l / 5) * 30;
					if (x >= cellX && x <= cellX + 24 && y >= cellY && y <= cellY + 22) selectLevel(s, l);
				}
			}
		} else if (screen.equals("shop") || screen.equals("crafting")) {
			int startY = screen.equals("shop") ? 190 : 225, rowHeight = screen.equals("shop") ? 70 : 65;
			for (int i = 0; i < weapons.size(); i++) if (y >= startY + i * rowHeight && y < startY + i * rowHeight + 50) buyOrCraft(weapons.get(i));
		}
		repaint();
	}

	@Override protected void paintComponent(Graphics graphics) {
		super.paintComponent(graphics); Graphics2D g = (Graphics2D) graphics; g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		drawBackground(g); drawHeader(g);
		if (screen.equals("adventure")) drawAdventure(g); else if (screen.equals("shop")) drawShop(g); else if (screen.equals("crafting")) drawCrafting(g); else drawLeaderboard(g);
	}
	private void drawBackground(Graphics2D g) { g.setColor(new Color(12, 20, 42)); g.fillRect(0, 0, WIDTH, HEIGHT); g.setColor(new Color(23, 44, 72)); g.fillRect(0, 90, WIDTH, 610); g.setColor(new Color(35, 100, 80)); g.fillRect(0, 570, WIDTH, 130); g.setColor(new Color(70, 145, 115)); for (int x = 0; x < WIDTH; x += 80) g.fillRect(x, 560, 40, 10); }
	private void drawHeader(Graphics2D g) { g.setColor(new Color(7, 12, 27)); g.fillRect(0, 0, WIDTH, 90); g.setColor(new Color(65, 210, 255)); g.setFont(new Font("SansSerif", Font.BOLD, 26)); g.drawString("OGREFALL", 28, 38); g.setFont(new Font("SansSerif", Font.PLAIN, 14)); g.setColor(Color.LIGHT_GRAY); g.drawString("70 LEVEL SIDE-VIEW RPG", 30, 63); g.setColor(Color.WHITE); g.drawString("Coins: " + coins, 330, 35); g.drawString("Weapon: " + equipped, 430, 35); g.drawString("Score: " + score, 700, 35); button(g, "Adventure", 790, 15, 90, 35, () -> screen = "adventure"); button(g, "Shop", 885, 15, 60, 35, () -> screen = "shop"); button(g, "Craft", 950, 15, 65, 35, () -> screen = "crafting"); button(g, "Ranks", 1020, 15, 65, 35, () -> screen = "leaderboard"); }
	private void drawAdventure(Graphics2D g) { g.setColor(Color.WHITE); g.setFont(new Font("SansSerif", Font.BOLD, 22)); g.drawString(sections[section] + "  /  Level " + (level + 1), 28, 130); g.setFont(new Font("SansSerif", Font.PLAIN, 15)); g.setColor(Color.LIGHT_GRAY); g.drawString(themes[section] + "   |   Boss: " + bosses[section], 30, 155); g.drawString("Ogres: " + (ogres[section][level] ? ogreCount() : 0) + "/" + ogreCount() + "    Materials: " + (gathered[section][level] ? materialCount() : 0) + "/" + materialCount() + "    Boss: " + (bossBeaten[section][level] ? "DEFEATED" : "READY"), 30, 180); drawHero(g); g.setColor(Color.WHITE); g.drawString("Special item: " + bossItems[section] + (itemTaken[section][level] ? " (collected)" : ""), 30, 625); g.drawString("CONTROLS  A/D or arrows: move sideways   W/S: lanes   J: quick attack   K: heavy   L: ability", 30, 650); panel(g); button(g, started ? "Restart / Start" : "START ADVENTURE", 30, 215, 155, 38, this::start); button(g, "Gather Materials", 195, 215, 145, 38, this::gather); button(g, "Defeat Ogres", 350, 215, 130, 38, this::defeatOgres); button(g, "Fight Boss", 490, 215, 115, 38, this::fightBoss); button(g, "Pick Up Item", 615, 215, 125, 38, this::takeItem); button(g, "Next Level", 750, 215, 110, 38, this::nextLevel); g.setColor(new Color(255, 220, 130)); g.drawString(status, 30, 285); drawLevelGrid(g); }
	private void drawHero(Graphics2D g) { int x = playerX, y = playerY; g.setColor(new Color(38, 180, 240)); g.fillRect(x - 24, y - 75, 48, 65); g.setColor(new Color(255, 177, 110)); g.fillOval(x - 20, y - 112, 40, 40); g.setColor(new Color(25, 30, 45)); g.fillOval(x + (facingRight ? 5 : -14), y - 98, 7, 7); g.setColor(new Color(236, 190, 80)); g.fillRect(x - 20, y - 10, 17, 15); g.fillRect(x + 3, y - 10, 17, 15); }
	private void drawLevelGrid(Graphics2D g) { g.setFont(new Font("SansSerif", Font.BOLD, 12)); for (int s = 0; s < 7; s++) { int x = 30 + s * 150; g.setColor(new Color(160, 210, 240)); g.drawString((s + 1) + ". " + sections[s], x, 330); for (int l = 0; l < 10; l++) { int px = x + (l % 5) * 28, py = 345 + (l / 5) * 30; g.setColor(unlocked[s * 10 + l] ? (s == section && l == level ? new Color(70, 220, 140) : new Color(45, 90, 130)) : new Color(30, 42, 60)); g.fillRoundRect(px, py, 24, 22, 5, 5); g.setColor(Color.WHITE); g.drawString("" + (l + 1), px + 8, py + 15); }
		} }
	private void drawShop(Graphics2D g) { title(g, "OGRE HUNTER SHOP", "Every ogre gives 5 coins. Every boss gives 100 coins. Balance: " + coins); int y = 190; for (Weapon item : weapons) { row(g, item.name + "   Damage " + item.damage + "   Price " + item.cost + " coins", item.name.equals(equipped) ? "EQUIPPED" : "BUY", 30, y, () -> buyOrCraft(item)); y += 70; } g.setColor(Color.YELLOW); g.drawString("Most powerful weapon: SUNBLADE - 90 damage - 500 coins", 30, 560); }
	private void drawCrafting(Graphics2D g) { title(g, "CRAFTING CAMP", "Craft or equip weapons at the start of your adventure."); g.setColor(Color.LIGHT_GRAY); g.drawString("Inventory: " + materials, 30, 180); int y = 225; for (Weapon item : weapons) { row(g, "Craft " + item.name + "   Recipe: " + item.recipe, "CRAFT", 30, y, () -> buyOrCraft(item)); y += 65; } }
	private void drawLeaderboard(Graphics2D g) { title(g, "GLOBAL LEADERBOARD", "Defeat bosses and complete levels to climb the rankings."); int y = 205, rank = 1; for (Score entry : leaderboard) { g.setColor(rank == 1 ? new Color(255, 215, 90) : Color.WHITE); g.drawString(rank + ".   " + entry.name + "     " + entry.points + " points     Progress: " + entry.progress, 60, y); y += 45; rank++; } }
	private void title(Graphics2D g, String heading, String subtitle) { g.setColor(Color.WHITE); g.setFont(new Font("SansSerif", Font.BOLD, 28)); g.drawString(heading, 30, 145); g.setFont(new Font("SansSerif", Font.PLAIN, 16)); g.setColor(Color.LIGHT_GRAY); g.drawString(subtitle, 30, 175); }
	private void panel(Graphics2D g) { g.setColor(new Color(8, 15, 30, 210)); g.fillRoundRect(20, 200, 1060, 105, 12, 12); }
	private void row(Graphics2D g, String label, String action, int x, int y, Runnable callback) { g.setColor(new Color(22, 40, 65)); g.fillRoundRect(x, y, 760, 50, 8, 8); g.setColor(Color.WHITE); g.setFont(new Font("SansSerif", Font.PLAIN, 16)); g.drawString(label, x + 18, y + 31); button(g, action, x + 650, y + 8, 95, 34, callback); }
	private void button(Graphics2D g, String label, int x, int y, int w, int h, Runnable callback) { g.setColor(new Color(35, 85, 125)); g.fillRoundRect(x, y, w, h, 8, 8); g.setColor(Color.WHITE); g.setFont(new Font("SansSerif", Font.BOLD, 13)); g.drawString(label, x + 10, y + 23); }

	@Override public void keyPressed(KeyEvent e) { int key = e.getKeyCode(); if (key == KeyEvent.VK_A || key == KeyEvent.VK_LEFT) left = true; if (key == KeyEvent.VK_D || key == KeyEvent.VK_RIGHT) right = true; if (key == KeyEvent.VK_W || key == KeyEvent.VK_UP) up = true; if (key == KeyEvent.VK_S || key == KeyEvent.VK_DOWN) down = true; if (key == KeyEvent.VK_J) attack("Quick strike", weapon().damage + (++combo % 3) * 2, 0); if (key == KeyEvent.VK_K) attack("Heavy attack", weapon().damage * 2, 25); if (key == KeyEvent.VK_L) attack("ABILITY", weapon().damage * 3, 40); if (key == KeyEvent.VK_SPACE) { playerY = 450; Timer jump = new Timer(350, event -> { playerY = 525; repaint(); }); jump.setRepeats(false); jump.start(); } repaint(); }
	@Override public void keyReleased(KeyEvent e) { int key = e.getKeyCode(); if (key == KeyEvent.VK_A || key == KeyEvent.VK_LEFT) left = false; if (key == KeyEvent.VK_D || key == KeyEvent.VK_RIGHT) right = false; if (key == KeyEvent.VK_W || key == KeyEvent.VK_UP) up = false; if (key == KeyEvent.VK_S || key == KeyEvent.VK_DOWN) down = false; }
	@Override public void keyTyped(KeyEvent e) { }
	private static class Weapon { String name, recipe; int damage, cost; Weapon(String n, int d, int c, String r) { name = n; damage = d; cost = c; recipe = r; } }
	private static class Score { String name, progress; int points; Score(String n, int p, String g) { name = n; points = p; progress = g; } }
}
