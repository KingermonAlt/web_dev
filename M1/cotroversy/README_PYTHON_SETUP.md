# Ogrefall - Python Backend Setup

Your Ogrefall game now runs with a Python backend! Here's how to get it working:

## Installation

### 1. Install Python Dependencies

Open PowerShell and run:

```powershell
pip install flask flask-cors
```

### 2. Start the Python Server

From the `cotroversy` folder, run:

```powershell
python app.py
```

You should see:
```
 * Running on http://127.0.0.1:5000
```

**Leave this terminal window open** - the server must stay running while you play.

### 3. Play the Game

Open `ogrefall.html` in your web browser:
- Double-click the HTML file, OR
- Right-click and "Open with Browser"

The HTML will connect to the Python backend automatically.

## How It Works

**Frontend (HTML/JavaScript):**
- `ogrefall.html` - The game interface
- `ogrefall-python.js` - Communicates with Python backend via API calls
- `ogrefall.css` - Game styling

**Backend (Python):**
- `app.py` - Flask server with all game logic
- Handles: game state, leveling, combat, progression, weapon purchases, leaderboard

## Game Controls

- **A/D or ←/→** - Move left/right
- **W/S or ↑/↓** - Move up/down  
- **Space** - Jump
- **J** - Light attack
- **K** - Heavy attack
- **L** - Special ability
- **E** - Collect materials

## Architecture

```
ogrefall.html (UI)
     ↓
ogrefall-python.js (API Client)
     ↓
http://localhost:5000/api/ (Python Backend)
     ↓
app.py (Game Logic, State Management)
```

All the JavaScript code from `ogrefall-realistic.js` has been replaced with Python backend logic in `app.py`.

## Troubleshooting

**"Connection error" message:**
- Make sure the Python server is running
- Check that port 5000 is not blocked
- Try refreshing the HTML page

**Port 5000 already in use:**
- Edit `app.py` line at the bottom: change `port=5000` to another number like `port=5001`
- Also update `API_URL` in `ogrefall-python.js` to match

**CORS errors:**
- The `flask-cors` library handles this. If issues persist, make sure it's installed correctly.

Enjoy the game! 🎮
