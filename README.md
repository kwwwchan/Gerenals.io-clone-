# generals.io

A real-time, multiplayer grid-based strategy game clone inspired by generals.io. The project features an authoritative Node.js server to coordinate mechanics, manage game loops, and handle battle resolution, combined with a lightweight HTML5 Canvas client interface.

---

## 🚀 Features

* **Real-Time Multiplayer:** Full bidirectional state synchronization powered by Socket.io.


* **Server-Authoritative Loop:** High-security validation engine executing all move logic, boundary limits, and collision mechanics server-side.


* **Dynamic Board Generation:** Automatically spawns a $20 \times 20$ grid featuring randomized configurations for player home bases, neutral blocking mountains, and defense towers.


* **Fog of War:** Immersive vision mechanics rendering a grey shroud across any map tiles outside of a $1$-tile radius of your captured territory.


* **Fluid Controls:** Fully responsive client framework supporting tactical mouse-click selections alongside rapid-fire keyboard paths via **Arrow Keys** or **WASD**.


* **Spectator Support:** Gracefully assigns the first two connected sockets to active player seats, while seamlessly funneling additional concurrent entries into unprivileged spectator slots.



---

## 🛠️ Tech Stack

* **Backend:** Node.js, Express, HTTP, Socket.io


* **Frontend:** HTML5 Canvas, Vanilla JavaScript (ES6+), CSS3



---

## 📂 Project Directory Structure

```text
├── client/
│   ├── cell-image/       # Image sprite assets for terrain generation
│   ├── game.js           # Client canvas rendering and event handlers
│   ├── index.html        # Main HTML game window frame
│   └── style.css         # Visual presentation stylesheet
├── server/
│   └── index.js          # Authoritative socket management and game loop (main entry point)
├── .gitignore            # Version control exclusions
├── package.json          # Node dependency manifests
└── package-lock.json     # Strict dependency lockfile

```

(Note: Based on the `express.static` implementation, front-end public files reside within the `client/` directory.)

---

## 🔧 Installation & Setup

Follow these steps to get a local instance of the game up and running:

1. **Clone the repository:**
```bash
git clone https://github.com/your-username/generals.io.git
cd generals.io

```

2. **Install node package manager dependencies:**  
   The project requires `express` and `socket.io` installed to function.
```bash
npm install

```

3. **Launch the server:**
Run the primary server execution script:


```bash
node server/server.js

```

4. **Play the game:**  
   Open your preferred web browser and navigate to your server: (i.e. http://localhost:3000)

---

## 🎮 Game Mechanics & Rules

* **The Objective:** Locate and conquer the enemy's home `BASE` while successfully defending your own.


* **Army Regeneration:**
* Any captured `BASE` or neutral `TOWER` automatically increments its troop count by $+1$ on every single server loop tick (1000ms).


* All ordinary captured flat territory increments by $+1$ army strength collectively once every $25$ server ticks.




* **Map Hazards:**
* **Mountains:** Impassable terrain cells that completely block any movement vectors.


* **Neutral Towers:** High-defense structures generating with a starting negative garrison threshold of $-40$ troops that must be overwhelmed to be claimed.




* **Combat Calculus:** Moving onto an opponent or neutral tile triggers a battle. If your attacking army count (minus $1$ left behind) exceeds the target cell's standing strength, you capture the land and transfer unit ownership.


<img width="952" height="499" alt="image" src="https://github.com/user-attachments/assets/84df7e7e-0ebd-4c58-ac10-f1becb7bfbde" />

### Controls

* **Selection:** `Left-Click` on any tile you own containing more than $1$ troop.


* **Movement:** Press `Arrow Keys` or `W`, `A`, `S`, `D` to rapidly command an army to march into an adjacent space. The selection box automatically updates to your target tile to allow for rapid multi-tile pathway chaining.



---

## 📄 License

This repository is distributed under the open-source **ISC License**.
