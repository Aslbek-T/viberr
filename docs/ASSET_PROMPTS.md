# ASSET_PROMPTS.md: ChatGPT image generation for Buildscape

Owner: friend (ChatGPT Pro). Run these in the background while Codex codes. Each image takes about a
minute, so the whole P0 list is about 30 minutes of clicking spread over the night.

## How to get consistent images

1. Open **one ChatGPT chat per theme** (Lab chat, Kitchen chat, Characters chat). Consistency is much
   better inside one chat.
2. Paste the **style lock** first, then each prompt. If an image drifts, say "same style as image 1,
   only change X".
3. Download as PNG. Name files exactly as listed, and drop them into `web/public/assets/<theme>/`.
4. If a background comes out with text or labels, regenerate. **The app draws all text itself**
   (needed for translation and dyslexia font), so images must have **no words, letters or numbers**.
5. Time box: if one image fails 3 times, move on. A plain colored room with a label is an acceptable
   fallback and the code must already support it.

## Building layout (the code assumes this)

The building is a **cutaway dollhouse seen from the front**: 3 floors, like a cross-section.

```
Floor 2:  [ screens ] [   api    ] [ database ]
Floor 1:  [  login  ] [  tests   ] [  setup   ]
Ground:   [            lobby (full width)      ]
```

- Upper rooms: **1536 x 1024** landscape, shown at about 480 x 320.
- Lobby: **1536 x 1024**, but the code crops it to a wide strip, so keep the important stuff in the
  **middle horizontal band** and leave the top and bottom as plain wall and floor.
- Leave the **bottom third of every room fairly empty floor**: characters stand and walk there.

## Style lock (paste first in every chat)

```
You are making game art for a cozy, friendly educational game. Style for every image in this chat:
cozy 2D illustrated game art, front-facing cutaway view of a single room like a dollhouse
cross-section, flat colors with soft shading, clean thick outlines, warm soft lighting, slightly
chunky stylized proportions, no people, no characters, no text, no letters, no numbers, no logos,
no signs with writing. Empty open floor in the lower third of the image for characters to stand on.
Calm, uncluttered composition, readable at small size. Landscape 1536x1024.
```

## P0: Lab theme (biologist demo), folder `web/public/assets/lab/`

| File | Room | Prompt (after the style lock) |
| --- | --- | --- |
| `lobby.png` | Lab bench (planning) | A long biology lab bench room with a whiteboard covered in simple drawn diagrams (no writing), sticky notes, a coffee mug, a lab notebook, pipette racks. Light blue and white palette. |
| `screens.png` | Microscope room (frontend) | A lab room with two large microscopes and big monitors showing colorful cell images, a desk with a magnifying glass. Teal palette. |
| `api.png` | Sample intake (API) | A lab sample intake room with a service window in the back wall, a conveyor belt with sample tubes in racks, labeled-looking boxes with no text, a bell on the counter. Soft green palette. |
| `database.png` | Cold storage freezer (database) | A lab cold storage room with tall steel freezers, open drawers full of neatly organized sample boxes in a grid, frosty mist, shelves of vials. Icy blue palette. |
| `login.png` | Badge-access door (auth) | A secure lab entrance with a heavy door, a glowing badge scanner panel, a turnstile, a small security window, a coat rack with lab coats. Purple palette. |
| `tests.png` | Control experiment (tests) | A lab experiment room with rows of petri dishes and beakers side by side, a comparison chart drawn with only shapes and lines, a timer, checkmark and cross shapes on clipboards. Warm yellow palette. |
| `setup.png` | Reagent shelf (dependencies) | A lab supply room with tall shelves of reagent bottles in many colors, cardboard delivery boxes, a cart, gloves and goggles on hooks. Orange palette. |

## P0: Kitchen theme (home cook demo), folder `web/public/assets/kitchen/`

Remember: **implement the kitchen theme code in Cursor Agent** (needed for the SpaceXSI track). The images
themselves come from ChatGPT.

| File | Room | Prompt (after the style lock) |
| --- | --- | --- |
| `lobby.png` | Prep counter (planning) | A cozy home kitchen prep area with a long wooden counter, an open recipe book with only drawings, a cutting board with vegetables, a chalkboard with doodles (no writing). Warm wood palette. |
| `screens.png` | Plating station (frontend) | A restaurant plating station with beautiful plated dishes under warm lamps, squeeze bottles of sauces, tweezers, garnish bowls. Coral palette. |
| `api.png` | Order window (API) | A diner kitchen order window with a pass-through shelf, a bell, order tickets on a rail (tickets show only squiggles, no text), plates waiting to go out. Mint green palette. |
| `database.png` | Pantry and fridge (database) | A walk-in pantry with an open fridge, jars and containers neatly organized in rows on shelves, baskets of produce sorted by type. Cool blue palette. |
| `login.png` | Staff-only door (auth) | A kitchen back door with a swinging door with a round window, a keypad lock, aprons on hooks, a mat. Purple palette. |
| `tests.png` | Taste test (tests) | A tasting table with small spoons, little bowls of soup lined up side by side, a scale, thumbs-up and thumbs-down shapes on cards. Golden yellow palette. |
| `setup.png` | Grocery delivery (dependencies) | A kitchen back room with grocery delivery crates, paper bags with vegetables, a hand truck, stacked flour sacks, a shelf of spices. Orange palette. |

## P0: Characters, folder `web/public/assets/common/`

Use a separate chat with this style lock instead:

```
Cozy 2D game character sprite, front-facing, full body, chunky cute proportions (big head, small body),
clean thick outlines, flat colors with soft shading, transparent background, no text, no letters.
Make a single horizontal sprite sheet with exactly 4 poses of THE SAME character, evenly spaced, same
size, same scale, feet on the same baseline: 1) standing idle, 2) mid-walk step, 3) working at
something with hands forward, 4) raising one hand high as if asking a question. 1536x1024,
transparent background.
```

| File | Prompt |
| --- | --- |
| `char-claude.png` | A friendly small robot helper with a rounded body, warm orange `#D97757` color, small antenna, a tool belt, a lab coat collar. |
| `char-cursor.png` | A friendly small robot helper with a sleek body, bright blue `#3B82F6` color, a visor-shaped face, a tablet under one arm. |
| `char-codex.png` | A friendly small robot helper with a boxy body, green `#10B981` color, round goggles, a backpack. |

After download, crop each sheet into 4 equal frames (Codex can write a tiny script with `sharp`, or use
Phaser's `spritesheet` loader with `frameWidth = width / 4`). Animate walking with a simple bob tween;
we don't need more frames than these 4.

**Fallback if the characters look inconsistent:** use Kenney.nl CC0 characters and tint them with the
agent color in Phaser.

## P1: Small props and icons, folder `web/public/assets/common/`

Style lock for icons:

```
Single game icon, cozy 2D style, thick outline, flat color with soft shading, centered, transparent
background, no text, 1024x1024.
```

| File | Prompt |
| --- | --- |
| `icon-raised-hand.png` | A raised hand with a small question mark shape made of a curve and dot, yellow. |
| `icon-check.png` | A big round green checkmark badge. |
| `icon-error.png` | A soft red round badge with an exclamation shape. |
| `icon-thinking.png` | A thought cloud with three dots. |
| `icon-phone-ping.png` | A smartphone with vibration lines and a notification dot. |
| `icon-star-card.png` | A collectible card with a star, gold border, used for "concept learned". |

## P2: Office theme and concept art

Only if everything else is done. Office rooms can stay as colored rectangles with labels. Concept card
illustrations (one 1024x1024 icon per concept, 15 total) are a nice touch for the Gaming track; ask
Aslbek for the concept list from `shared/concepts.json`.

## Credit

Add to README under Credits: "Room, character and icon art generated with ChatGPT image generation by
the team." Also add a line to `docs/AI_USAGE.md`.

## Registering images in the app

After adding PNGs, list them in `web/public/assets/manifest.json`, for example
`["lab/api.png", "lab/lobby.png", "kitchen/api.png"]`. Rooms without an image keep the flat color.
