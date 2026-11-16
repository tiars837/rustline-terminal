[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/tiars837/rustline-terminal/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/tiars837/rustline-terminal/reward.svg)](https://make.fun/bounty/threejs-fps-02)

# RUSTLINE TERMINAL — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 with no build step and no network requests.
Two teams fight short rounds in a dusk container terminal: RUSTLINE attacks,
VOLTAGE defends. Win by eliminating the other team, or by planting the bomb
at Site A or Site B and holding it until it detonates. Money earned each
round buys weapons between rounds.

## The game

- **First-person view** with pointer-lock mouse look, WASD movement with
  acceleration, crouching, jumping and collision against the map.
- **Gunplay**: three weapons (VK-9 Carbine rifle, M12 Breacher shotgun, P9
  Sidearm pistol) with magazines, reloads, recoil and spread that punishes
  firing on the move; headshots deal double damage; a smoke grenade (G)
  blocks sightlines.
- **Tactics**: a bomb to plant (hold E on a site) and defuse, a buy menu
  (B) with an economy ($800 start, $300 per kill, $325 per round win), and
  bots that route down three lanes, hold positions, react to what they see
  and hear, and plant or defuse.
- **Bots**: 3 RUSTLINE allies hold the sites with you; 4 VOLTAGE attackers
  advance, one carrying the bomb.
- **Map**: an original 64×44 container yard — three lanes, two cross lanes,
  two bomb sites, painted ground decals, dusk lighting and a crane skyline.
- **HUD**: health, ammunition, round timer, score, money, kill feed, bomb
  status and a crosshair that widens with spread.
- **Sound**: everything is synthesised with WebAudio — no audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080 in desktop Chrome
```

Click to play. `WASD` move, mouse look, click fire, `R` reload,
`Ctrl` crouch, `Space` jump, `1/2/3` weapons, `G` smoke grenade,
`E` plant the bomb, `B` buy menu.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `vendor/makefun-threejs.ts`. The
program is deterministic: two runs write the same bytes.

Built for the [make.fun bounty “Make the best three.js tactical FPS”](https://make.fun/bounty/threejs-fps-02).
