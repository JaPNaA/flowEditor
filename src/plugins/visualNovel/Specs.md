# Visual Novel Plugin Instruction Specifications

All instructions added by the Visual Novel plugin have a `visualNovelCtrl` property that is a `string`.

For details about specific instructions, see [controls.ts](controls.ts).

There are two objects instructions can reference by number ("pointers"). Pointers may point to a strings, graphics and arrangements. Both strings and graphics are stored in the plugin's state.

## Strings

Instructions that access strings: `strset`, `text`, `say`, `say-add`. Additionally, `shape`, `sfx` and `bgm` can use string substitution in the `src` attribute.

Pointers must have values greater than 0.

Strings are equivalent to the javascript string.

`strset` creates a string in the plugin's state and assigns a variable a pointer referencing the new string.

`text`, `say`, and `say-add` use formatted strings which can contain variables. For example:

```json
{ "visualNovelCtrl": "strset", "v": "myString", "str": "world" }
{ "ctrl": "variable", "v1": "copyString", "op": "=", "v2": "myString" }
{ "visualNovelCtrl": "say", "char": "", "text": "Hello, {myString}! Hello, {copyString}!" }
```

This flow would write "Hello, world! Hello, world!" in the speech bubble.

## Graphics

Instructions that access graphics: `show`, `hide`, `shape`, `animate`, `arrange`, `parent`, `text`, `say`, `say-add`, and `choose`.

Pointers to graphics must have values greater than 0.

By convention graphics 1-4 form this tree:
  - graphic 3 (parent of non-ui)
    - graphic 1 (parent of non-background)
      - by default, all graphics without a specified parent make graphic 1 the parent
    - graphic 2 (parent of background graphics)
  - graphic 4 (parent of ui graphics)

Pointers to "special" graphics have a value less than 0.
  - -1: **stage graphic**
    - transformations to the stage graphic move everything, excluding text
  - -2: **text graphic**, containing all text
    - transformations to the text graphic move all text

The `animate` instruction is the only way to modify positioning and transformations. If you wish to make something move instantly, you should use a 0-length animation.

An example of using `animate` to make a graphic appear and 'jump':

```json
{ "visualNovelCtrl": "shape", "src": "...", "id": 1 }
{ "visualNovelCtrl": "animate", "length": 0.5, "id": 1, "events": [
    [0, {
        "key": "posAnchor",
        "from": [50, 50], // set initial position (optional)
        "to": [50, 60],
        "easing": [0.5, 1, 0.89, 1], // ease out quad
        "length": 0.25
    }], [0.25, {
        "key": "posAnchor",
        "to": [50, 50],
        "easing": [0.11, 0, 0.5, 0], // ease in quad
        "length": 0.25
    }]
] }
{ "visualNovelCtrl": "show", "id": 1 }
```

Note: if the animation length is less than the time it takes to finish the last event, the event will be stopped at point the animation ends.

## Arrangements

Pointers to arrangements must have a value greater than 0.

Instructions that access arrangements: `arrange`, `arrangeSettings`.

An arrangement is a list of graphics that are to be positioned relative to each other. For example, putting a list of options or several characters on the screen, spaced out evenly.

The order of positioning is based on:
    - the original position of the graphic (x-position if direction is horizontal, y-position otherwise)
    - the order the graphic was added to the arrangement
