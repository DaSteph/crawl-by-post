# Dungeon file format (proposal for ticket 02)

Status: agreed and implemented in ticket 02 (`src/lib/dungeon/`). Example: `dungeons/example.yaml` in the repo.

## Principles

- Hand-written on graph paper first, then typed in. Every coordinate is a whole grid square you can read off the paper.
- The file only describes geometry and content. It never describes style (spec, Art Direction).
- JSON and YAML have the same structure. YAML is the format you'd normally write; JSON works because it is valid YAML.
- Unknown keys are errors, so typos (`moood:`) are caught instead of silently ignored.

## Grid

- Squares are addressed as `[x, y]`. The origin `[0, 0]` is the top-left square, x grows to the right and y grows downward. Negative coordinates are not allowed.
- Sides are `n`, `e`, `s`, `w`.

## Top level

| Key         | Required | Meaning                                                                                   |
|-------------|----------|-------------------------------------------------------------------------------------------|
| `name`      | yes      | Dungeon name (localized text)                                                              |
| `languages` | yes      | Language codes used in this file, e.g. `[en, de]`. The first one is the **default language** |
| `start`     | yes      | Id of the room that is revealed when the session is created                                |
| `rooms`     | yes      | List of rooms (at least one)                                                               |
| `corridors` | no       | List of corridor segments                                                                  |
| `danger`    | no       | `unsafe`, `risky` or `deadly`. Preselected when the GM taps "Start crawl" (the GM can still change it). Shadowdark rolls one danger level per site |
| `wandering` | no       | Monsters for wandering encounters, same fields as room monsters. The GM can place them anywhere when a check hits |

## Localized text

Every prose field (`name`, `mood`, `notes`, monster `name`/`notes`) takes either:

- a plain string, which counts as the default language, or
- a map from language code to string: `{ en: "...", de: "..." }`. The default language is required, and every key must be listed in `languages`.

The GM picks the session's language on the session page ("Content language", shown when the file has more than one language; changeable any time). Text without that language falls back to the default language. Monsters already placed keep the name they were placed with. UI text stays in `src/lib/text.ts`; this only covers content from the dungeon file.

## Areas: rooms and corridor segments

Rooms and corridor segments are both **areas**. An area is what gets revealed or hidden and what is lit or dark (spec, Key rules). Ids must be unique across all areas (`[a-z0-9-]+`).

**Room**

```yaml
- id: r1
  name: Entrance hall          # localized, shown to everyone once revealed
  rect: { x: 0, y: 0, w: 5, h: 4 }
  mood: ...                    # localized, optional: read-aloud text, drafted for the GM on reveal
  notes: ...                   # localized, optional: GM only
  exits: [...]                 # optional
  monsters: [...]              # optional
```

**Corridor segment**: a straight, one-square-wide run from `from` to `to` (both inclusive, horizontal or vertical). Bends are made from several segments. A wider passage is a room.

```yaml
- id: c1
  name: Flooded passage        # localized, optional
  from: [5, 1]
  to: [9, 1]
  mood: ...                    # optional, as for rooms
  notes: ...                   # optional
  exits: [...]                 # optional
```

Segments that touch end to end (an end square orthogonally next to a square of another segment) connect openly, with no exit needed. An area touching a room is separated by a wall unless an exit is declared.

## Exits

An exit sits on the wall between a square of its own area and the neighbouring square on `side`, which must belong to the area named in `to`.

```yaml
exits:
  - { at: [4, 1], side: e, to: c1, type: open }
```

| `type`       | Map notation                        |
|--------------|-------------------------------------|
| `open`       | gap in the wall (archway)           |
| `door`       | door rectangle in the wall          |
| `locked`     | door with a lock mark               |
| `secret`     | "S" on the wall, GM view only until found (handling in a later ticket) |
| `portcullis` | dotted bars across the opening      |

Each connection is declared once, on either side. Declaring it on both sides is an error.

## Monsters

Placed per room (or listed under `wandering`). The fields follow the Shadowdark stat block (`AC 13, HP 9, ATK 1 sword +1 (1d6), MV near, S +1, D +0, ... AL C, LV 2`), so you can copy one field by field.

```yaml
monsters:
  - name: Skeleton            # localized
    label: S                  # tokens become S1, S2, ...
    count: 1d4                # number or formula, default 1
    level: 2                  # LV
    ac: 13                    # AC
    armor: chainmail          # optional, the note in brackets after AC
    hp: 11                    # optional, see below
    attacks:                  # each entry is one option ("or" in the stat block)
      - { count: 1, name: sword, bonus: 1, damage: 1d6 }
      - { count: 1, name: shortbow, range: far, bonus: 0, damage: 1d4 }
      - [ { count: 2, name: claw, bonus: 1, damage: 1d4 },    # a list = attacks made together ("and")
          { count: 1, name: bite, bonus: 1, damage: 1d6 } ]
    mv: near                  # MV, free text: close, near, double near (fly), ...
    stats: { s: 1, d: 0, c: 1, i: -3, w: 0, ch: -3 }   # optional modifiers
    al: C                     # optional: L, N or C
    abilities:                # optional, the bold-named paragraphs below a stat block
      - name: Undead          # localized
        text: Immune to morale checks.   # localized
    notes: ...                # localized, optional, GM only
```

Required: `name` and `label`, plus either `statblock` or the fields `level`, `ac`, `mv` and at least one attack.

**HP**, rolled once when the GM places the monster (ticket 09) and editable:
- a number: fixed HP (the average the book lists)
- a formula: rolled
- left out: rolled the book's way, `level` × d8 + the CON modifier, at least 1

**Attacks**: `attacks` lists the options the monster can choose from ("or" in the book). An option is one attack, or a list of attacks made together ("and"). Each attack has `count` (default 1), `name`, `bonus` and `range` (`close`, `near`, `far` or a combination like `close/near`; default melee) as in the book. `damage` is a dice formula and optional, because some attacks only cause an effect (`1 horn`, `1 spell +2`). `effect` is optional free text for an extra effect after the damage (`1d8 + curse` → `damage: 1d8, effect: curse`).

A **dice formula** is `NdM`, `dM` (= `1dM`) or either with `+K`/`-K`, e.g. `2d6`, `d8`, `1d6+1`. Only parsed in ticket 02; rolling comes with the dice evaluator.

### One-line stat block

Instead of the separate fields, a monster can take the stat line exactly as printed in the book:

```yaml
  - name: Bandit
    label: B
    count: 1d4+1
    statblock: >
      AC 13 (leather + shield), HP 4, ATK 1 club +1 (1d4) or 1 shortbow (far)
      +0 (1d4), MV near, S +1, D +1, C +0, I -1, W +0, Ch -1, AL C, LV 1
```

- The parser turns it into the same fields as above, so the rest of the app doesn't know which form was used.
- Line breaks and stray spaces from copying out of a PDF are ignored (`close/ near` works).
- Recognised parts: `AC n (armor)`, `HP n` or a formula, `ATK` (options joined by `or`, attacks within an option joined by `and`; each `count name (range) +bonus (damage + effect)`), `MV` (free text up to the next part, commas in brackets allowed), `S`, `D`, `C`, `I`, `W`, `Ch`, `AL`, `LV`. Order doesn't matter. `AC`, `ATK`, `MV` and `LV` are required, the rest is optional.
- Separate fields given next to `statblock` override its values, so you can paste a line and adjust one thing (e.g. `hp: 2d8`).
- `name`, `label`, `count`, `abilities` and `notes` stay separate fields. Ability paragraphs aren't part of the stat line.
- Errors point to the exact spot: `line 18, col 9 · rooms[1] (r2).monsters[0].statblock, at "ATK 1 club +1 (1d4": missing ")"`.

**Not in the file:** encounter distance, activity and reaction tables. They are rulebook tables, which the spec keeps out of the code; the GM rolls or rules on them. Room types, traps, hazards and treasure go in `notes`.

## Where dungeon files live

Dungeon files are files on the server, not database rows. There is no upload.

- They sit in one directory, `DUNGEONS_DIR` (default `./dungeons`; in Docker a mounted volume). Files: `*.yaml`, `*.yml`, `*.json` directly in that directory. The file name without its extension is the **dungeon id**, e.g. `drowned-chapel.yaml` → `drowned-chapel`.
- When creating a session, the GM picks a dungeon from that directory. Invalid files show up in the list with their errors and can't be picked.
- The session only stores the dungeon id, plus its own live state (revealed areas, and later tokens, HP and so on). On every load the server reads and parses the file, cached by modification time, and passes the dungeon model to the engine alongside the state. The model is never saved.
- Editing a file during a running session takes effect on the next load. Fixing text or stats is safe. Changing geometry or ids can leave live state pointing at things that no longer exist: references to unknown ids are dropped and the GM is told. If the file becomes invalid or disappears, the GM sees the errors on the session page and players see "the dungeon is unavailable".
- The repo ships `dungeons/example.yaml` (the example dungeon, invented content, no text from the book).

## Validation errors

The parser returns every error it finds, not just the first one. Each error has a **path** and, for YAML/JSON text, a **line and column**:

```
line 23, col 9 · rooms[1] (r2).exits[0].to: leads to "c9", which doesn't exist
line 41, col 5 · rooms[2] (r3).rect: overlaps corridor c3 at [6, 7]
line 12, col 13 · rooms[0] (r1).monsters[0].hp: "2w6" is not a dice formula (expected e.g. 2d6, d8, 1d6+1)
line 3, col 1 · start: room "r9" doesn't exist
line 30, col 7 · rooms[1] (r2).mood: missing text for the default language "en"
```

Checked: YAML syntax, stat block syntax, required and unknown keys, types, unique ids, `start` exists and is a room, segments are straight, areas don't overlap, an exit's `at` lies inside its own area and its neighbour lies in `to`, duplicate connections, dice formulas, localized text against `languages`.

Not checked (allowed): areas unreachable from the start (secret parts, later reveals), corridor dead ends.

## Mood texts on reveal (ticket 05)

When the GM reveals an area that has a `mood`, the GM's compose box is prefilled with the mood text in the session language. It is a draft: the GM edits, shortens or deletes it before posting, and nothing is posted automatically. An area that was hidden by hand and revealed again prefills the text again.
