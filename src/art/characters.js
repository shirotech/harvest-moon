// Art module: player characters (boy & girl). See docs/ART_GUIDE.md.
//
// Frames are composed from a shared BODY layer and a per-character HEAD layer.
// Body art uses three "virtual" indices that each character resolves
// differently, so the girl's outfit is a deliberate variation of the same
// animation rather than a plain palette swap:
//   7 = forearm   (boy: long green sleeve, girl: rolled sleeve -> bare skin)
//   8 = lower leg (boy: trousers,         girl: overall shorts -> bare skin)
//   9 = bib/strap (boy: shirt,            girl: brown overall bib & straps)

const PALETTES = {
  //            outline    skin       hair       shirt      trousers   accent
  chr_boy: ['#181010', '#f8c898', '#a05828', '#289860', '#684028', '#d83828'],
  chr_girl: ['#181010', '#f8c898', '#b84020', '#88c0f0', '#784828', '#f8d030'],
};

const REMAP = {
  boy: { 7: 4, 8: 5, 9: 4 },
  girl: { 7: 2, 8: 2, 9: 5 },
};

// Where the hands grip the tool in each use frame (side frames face right),
// identical for boy and girl. use_up_1 (strike facing away) grips in front of
// the chest, hidden behind the head, so the tool should rise from behind it.
export const HAND_POS = {
  use_down_0: [7, 2],
  use_down_1: [7, 12],
  use_up_0: [7, 2],
  use_up_1: [7, 4],
  use_side_0: [4, 2],
  use_side_1: [11, 12],
};

// ---------------------------------------------------------------- bodies ---
// 16x16, rows 0-8 are the head zone: only raised arms are drawn there.
const E = '................';
const blank = (n) => Array(n).fill(E).join('\n');

// raised arms shared by carry down/up
const ARMS_UP = `
    .11..........11.
    1221........1221
    1221........1221
    .171........171.
    .171........171.
    .141........141.
    .141........141.
    .141........141.
    .1441......1441.`;
// fists together above the head, forearms hidden behind it (tool wind-up)
const ARMS_OVERHEAD = `
    ......1111......
    ......1221......
    ......1221......
    ......1111......
    ................
    .11..........11.
    1441........1441
    1441........1441
    .1441......1441.`;

const BODY = {
  // ---- walk
  walk_down_0: `${blank(9)}
    ...1449229441...
    ..141499994141..
    ..171499994171..
    ..121555555121..
    ...1188118811...
    ....11111111....
    ...1111..1111...`,
  walk_down_1: `${blank(9)}
    ...1449229441...
    ..141499994141..
    ..121499994171..
    ...11555555171..
    ....1881111121..
    ....1111.1111...
    ...1111.........`,
  walk_up_0: `${blank(9)}
    ...1449449441...
    ..141494494141..
    ..171494494171..
    ..121555555121..
    ...1188118811...
    ....11111111....
    ...1111..1111...`,
  walk_up_1: `${blank(9)}
    ...1449449441...
    ..141494494141..
    ..121494494171..
    ...11555555171..
    ....1881111121..
    ....1111.1111...
    ...1111.........`,
  walk_side_0: `${blank(9)}
    ...14444491.....
    ...14177191.....
    ...14122191.....
    ...15511551.....
    ....188881......
    ....111111......
    ....1111111.....`,
  walk_side_1: `${blank(9)}
    ...14444491.....
    ...14417711.....
    ...144411221....
    ...15555511.....
    ..18811881......
    .1111..1111.....
    .1111..11111....`,

  // ---- carry (both hands raised above the head)
  carry_down_0: `${ARMS_UP}
    ..144492294441..
    ....14999941....
    ....14999941....
    ....15555551....
    ....18811881....
    ....11111111....
    ...1111..1111...`,
  carry_down_1: `${ARMS_UP}
    ..144492294441..
    ....14999941....
    ....14999941....
    ....15555551....
    ....18811111....
    ....1111.111....
    ...1111.........`,
  carry_up_0: `${ARMS_UP}
    ..144494494441..
    ....14944941....
    ....14944941....
    ....15555551....
    ....18811881....
    ....11111111....
    ...1111..1111...`,
  carry_up_1: `${ARMS_UP}
    ..144494494441..
    ....14944941....
    ....14944941....
    ....15555551....
    ....18811111....
    ....1111.111....
    ...1111.........`,
  carry_side_0: `
    ............11..
    ...........1221.
    ...........1221.
    ............171.
    ............171.
    ............141.
    ............141.
    ............141.
    ...........1441.
    ...1444444441...
    ...14444491.....
    ...14444491.....
    ...15555551.....
    ....188881......
    ....111111......
    ....1111111.....`,
  carry_side_1: `
    ............11..
    ...........1221.
    ...........1221.
    ............171.
    ............171.
    ............141.
    ............141.
    ............141.
    ...........1441.
    ...1444444441...
    ...14444491.....
    ...14444491.....
    ...15555551.....
    ..18811881......
    .1111..1111.....
    .1111..11111....`,

  // ---- use (tool swing; the engine draws the tool at HAND_POS)
  use_down_0: `${ARMS_OVERHEAD}
    ..144492294441..
    ....14999941....
    ....14999941....
    ....15555551....
    ...1881..1881...
    ...1111..1111...
    ..11111..11111..`,
  use_down_1: `${blank(9)}
    ...1449229441...
    ..141499994141..
    ...1771991771...
    ...1512222151...
    ...1881111881...
    ...1111..1111...
    ..11111..11111..`,
  use_up_0: `${ARMS_OVERHEAD}
    ..144494494441..
    ....14944941....
    ....14944941....
    ....15555551....
    ...1881..1881...
    ...1111..1111...
    ..11111..11111..`,
  use_up_1: `${blank(6)}
    .11..........11.
    1441........1441
    .1441......1441.
    ..144494494441..
    ...1449449441...
    ...1449449441...
    ...1555555551...
    ...1881..1881...
    ...1111..1111...
    ..11111..11111..`,
  use_side_0: `
    ...111..........
    ..12221.........
    ..12221.........
    ...1771.........
    ...1771.........
    ...1441.........
    ...1441.........
    ...14441........
    ....14441.......
    ...14444491.....
    ...14444491.....
    ...14444491.....
    ...15555551.....
    ...18811881.....
    ..1111..1111....
    ..1111..11111...`,
  use_side_1: `${blank(9)}
    ...14444491.....
    ...144417711....
    ...14444117221..
    ...15555511221..
    ...1881188111...
    ..1111..1111....
    ..1111..11111...`,

  // ---- misc
  happy: `
    11............11
    1211........1121
    .121........121.
    .171........171.
    ..171......171..
    ..171......171..
    ..141......141..
    ..141......141..
    ..1441....1441..
    ..144492294441..
    ....14999941....
    ....14999941....
    ....15555551....
    ....18811881....
    ....11111111....
    ...1111..1111...`,
  // tucked in under a blanket (shirt colour, accent-coloured hem)
  sleep: `${blank(9)}
    ...1449229441...
    ..162266662261..
    ..144444444441..
    ..144414414441..
    ..144441144441..
    ..144444444441..
    ...1111111111...`,
  // back view with one arm flung forward; rotated to lie face-down
  faint: `
    .11.............
    1221............
    1221............
    .171............
    .171............
    .141............
    .141............
    .141............
    .1441...........
    ..144494494441..
    ....1494494141..
    ....1494494171..
    ....1555555121..
    ...1881..1881...
    ...1111..1111...
    ..1111....1111..`,
};

// ------------------------------------------------------------------ heads ---
// 16 wide, drawn at the top-left. `*_step` variants add secondary motion on
// walk frame 1 (bandana tails flutter, ponytail sways/bounces); a character
// without one falls back to the plain head.
const HEAD = {
  boy: {
    down: `
      .....1.11.1.....
      ...1131331311...
      ..133333333331..
      .16666666666661.
      .13666666666631.
      .13332322323331.
      .13321222212331.
      .13321222212331.
      ..112222222211..`,
    happy: `
      .....1.11.1.....
      ...1131331311...
      ..133333333331..
      .16666666666661.
      .13666666666631.
      .13332322323331.
      .13321222212331.
      .13312122121331.
      ..112221122211..`,
    sleep: `
      .....1.11.1.....
      ...1131331311...
      ..133333333331..
      .16666666666661.
      .13666666666631.
      .13332322323331.
      .13322222222331.
      .13311222211331.
      ..112222222211..`,
    up: `
      .....1.11.1.....
      ...1131331311...
      ..133333333331..
      .16666666666661.
      .13666666666631.
      .13333366333331.
      .13333633633331.
      .13333633633331.
      ..113363363311..`,
    side: `
      .....1.11.1.....
      ...1131331311...
      .1133333333331..
      16666666666661..
      16666666666661..
      16133333323221..
      16133332222121..
      .11333322221221.
      ...11122222221..`,
    side_step: `
      .....1.11.1.....
      ...1131331311...
      .1133333333331..
      16666666666661..
      16666666666661..
      16133333323221..
      .1133332222121..
      ..1333322221221.
      ...11122222221..`,
  },
  girl: {
    down: `
      ...11.1111.11...
      ..166133331661..
      ...1166666611...
      ..133333333331..
      .13333333333331.
      .13333322333331.
      .13321222212331.
      .13321222212331.
      .13122222222131.`,
    happy: `
      ...11.1111.11...
      ..166133331661..
      ...1166666611...
      ..133333333331..
      .13333333333331.
      .13333322333331.
      .13321222212331.
      .13312122121331.
      .13122211222131.`,
    sleep: `
      ...11.1111.11...
      ..166133331661..
      ...1166666611...
      ..133333333331..
      .13333333333331.
      .13333322333331.
      .13322222222331.
      .13311222211331.
      .13122222222131.`,
    up: `
      ...11.1111.11...
      ..166133331661..
      ...1166666611...
      ..133333333331..
      .13333333333331.
      .13333333333331.
      .13333333333331.
      .13331333313331.
      .13331333313331.
      .....133331.....
      .....133331.....
      ......1331......
      .......11.......`,
    up_step: `
      ...11.1111.11...
      ..166133331661..
      ...1166666611...
      ..133333333331..
      .13333333333331.
      .13333333333331.
      .13333333333331.
      .13331333313331.
      .13331333313331.
      .....133331.....
      ....133331......
      ....1331........
      .....11.........`,
    side: `
      ..1111..........
      .13366111111....
      13316633333331..
      13313333333331..
      13313333333331..
      13133333333221..
      13133332222121..
      .11333322221221.
      ...13122222221..`,
    side_step: `
      .11111..........
      133366111111....
      13316633333331..
      13313333333331..
      13133333333331..
      .1133333333221..
      ..133332222121..
      ..1333322221221.
      ...13122222221..`,
  },
};

// ----------------------------------------------------------------- frames ---
// head: which head art (hx/hy: optional offset); armsOver: redraw body rows
// 0-8 on top of the head (raised arms); rot: 'ccw' turns the finished frame
// so the figure lies with its head to the left; dx/dy: final shift.
const FRAMES = {
  walk_down_0: { body: 'walk_down_0', head: 'down' },
  walk_down_1: { body: 'walk_down_1', head: 'down' },
  walk_up_0: { body: 'walk_up_0', head: 'up' },
  walk_up_1: { body: 'walk_up_1', head: 'up_step' },
  walk_side_0: { body: 'walk_side_0', head: 'side' },
  walk_side_1: { body: 'walk_side_1', head: 'side_step' },
  carry_down_0: { body: 'carry_down_0', head: 'down', armsOver: true },
  carry_down_1: { body: 'carry_down_1', head: 'down', armsOver: true },
  carry_up_0: { body: 'carry_up_0', head: 'up', armsOver: true },
  carry_up_1: { body: 'carry_up_1', head: 'up_step', armsOver: true },
  carry_side_0: { body: 'carry_side_0', head: 'side', armsOver: true },
  carry_side_1: { body: 'carry_side_1', head: 'side_step', armsOver: true },
  use_down_0: { body: 'use_down_0', head: 'down', armsOver: true },
  use_down_1: { body: 'use_down_1', head: 'down' },
  use_up_0: { body: 'use_up_0', head: 'up', armsOver: true },
  use_up_1: { body: 'use_up_1', head: 'up', armsOver: true },
  use_side_0: { body: 'use_side_0', head: 'side', armsOver: true },
  use_side_1: { body: 'use_side_1', head: 'side' },
  sleep: { body: 'sleep', head: 'sleep' },
  faint: { body: 'faint', head: 'up', armsOver: true, rot: 'ccw' },
  happy: { body: 'happy', head: 'happy', armsOver: true },
};

const lines = (art) =>
  art
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

function drawLines(buf, ls, dx, dy, maxRow = Infinity) {
  ls.forEach((row, y) => {
    if (y >= maxRow) return;
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const px = dx + x, py = dy + y;
      if (c === '.' || px < 0 || py < 0 || px > 15 || py > 15) continue;
      buf[py * 16 + px] = c.charCodeAt(0) - 48;
    }
  });
}

function compose(who, f) {
  const buf = new Uint8Array(256);
  const body = lines(BODY[f.body]);
  drawLines(buf, body, 0, 0);
  const head = HEAD[who][f.head] ?? HEAD[who][f.head.replace(/_step$/, '')];
  drawLines(buf, lines(head), f.hx ?? 0, f.hy ?? 0);
  if (f.armsOver) drawLines(buf, body, 0, 0, 9);
  const map = REMAP[who];
  for (let i = 0; i < 256; i++) if (map[buf[i]] !== undefined) buf[i] = map[buf[i]];
  return buf;
}

export function register(A) {
  for (const [name, cols] of Object.entries(PALETTES)) A.pal(name, cols);
  for (const who of ['boy', 'girl']) {
    for (const [key, f] of Object.entries(FRAMES)) {
      const buf = compose(who, f);
      A.paint(`${who}_${key}`, `chr_${who}`, 16, 16, (g) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            // ccw: source top -> left, source left -> bottom
            const v = f.rot === 'ccw' ? buf[x * 16 + (15 - y)] : buf[y * 16 + x];
            if (v) g.px(x + (f.dx ?? 0), y + (f.dy ?? 0), v);
          }
      });
    }
  }
}
