# Doodle Dash 🏎️🦆

A tiny toy-car racer on a giant desk, playable in the browser on desktop and mobile.

**Every 3D model in the game (car, pencil, rubber duck, star) was generated with [Vi3W](https://app.vi3w.in).**

## How to play

You have 60 seconds to score as many points as you can.

| Action | Keyboard | Mobile |
|---|---|---|
| Gas | W / ↑ | automatic |
| Steer | A D / ← → | ◀ ▶ buttons |
| Brake / reverse | S / ↓ | ▼ button |
| Drift | hold Space while turning | hold DRIFT while turning |
| Pause | Esc | ⏸ |

- ⭐ **Stars** are worth 100 points. Grab another within 3 seconds to build a combo, up to x10.
- 💗 **Pink stars** are worth 500 points and add 4 seconds to the clock.
- 🔥 **Drift turbo:** hold a drift to charge it (blue → orange → purple), then release for a speed boost.
- 🪂 **Ramps:** a long jump earns a "Big Air" bonus, and some stars float above the ramps.
- 🦆 **Ducks** drop from the sky and waddle around. Ram one slowly and you lose your combo. Hit it with a turbo to send it flying. Knock one off the desk for +1000.
- Drive off the desk yourself and you lose 3 seconds.

## How it was made

1. **Prompt:** wrote an image prompt for each object.
2. **Vi3W image:** generated a reference image on Vi3W.
3. **Vi3W 3D:** turned each image into a textured `.glb` model.
4. **Game:** built with Three.js and plain JavaScript, using Claude Code as an AI pair programmer.

The rest is built in code: the desk, sketchbook doodles, books, ramps and ruler are generated at runtime, and all sound and music is synthesized with WebAudio. The only asset files are the four Vi3W models.

The **"Made with Vi3W"** screen in the main menu shows each model on a turntable, with its triangle count and file size.

## Run locally

Any static file server works:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block loading the `.glb` files from `file://`.

## Project layout

```
index.html        page + UI screens
style.css         hand-drawn "sketchbook" UI
js/main.js        game: physics, ducks, stars, camera, HUD, showcase
js/textures.js    procedural canvas textures (wood, paper doodles, sticky notes)
js/audio.js       synthesized SFX + music
models/*.glb      Vi3W-generated models
```

---

Game by Rugved Chandekar · 3D models by Vi3W
