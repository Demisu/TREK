import type { BookStickerDef } from '../sticker-types';

/** Doodles: hand-drawn circles, arrows, sparkles and scribbles, drawn as pen strokes. */
export const DOODLES_STICKERS: readonly BookStickerDef[] = [
  {
    id: 'handCircle',
    theme: 'doodles',
    tags: ['circle', 'hand drawn', 'doodle', 'highlight', 'ring', 'marker', 'pen', 'mark'],
    descr: 'A loose hand-drawn pen circle that overshoots where it closes, for ringing something on a page.',
    box: [120, 80],
    slots: [{ name: 'ink', color: '#e63946' }],
    layers: [
      {
        p: 0,
        d: 'M16.3 25C17.4 23.9 20.3 20.4 22.9 18.6C25.6 16.7 29.1 15.3 32.3 13.8C35.6 12.4 39 10.8 42.6 9.8C46.3 8.9 50.4 8.3 54.3 8.1C58.2 7.8 62.1 8.2 66.2 8.2C70.2 8.2 75 7.3 78.6 8.1C82.3 8.9 85.1 11.4 88.3 12.9C91.5 14.5 94.7 15.7 97.8 17.4C100.8 19 104.3 20.7 106.4 22.8C108.6 24.9 109.6 27.5 110.7 30C111.7 32.4 112.8 35 112.8 37.5C112.9 40 112 42.6 111 45C110 47.4 108.4 49.7 106.8 52C105.2 54.3 103.5 56.6 101.2 58.6C98.9 60.6 96 62.4 93 64.1C89.9 65.8 86.8 67.7 83.1 68.7C79.5 69.8 75.1 70.1 71.1 70.6C67.1 71 63 71.4 58.9 71.3C54.8 71.2 50.4 71.1 46.6 70.2C42.8 69.4 39.5 67.4 36 66.1C32.4 64.8 28.2 64 25.2 62.3C22.2 60.6 20.2 58 18 55.8C15.8 53.6 13.4 51.5 11.8 49.1C10.3 46.7 9.3 44 8.8 41.5C8.3 38.9 8.4 36.2 8.8 33.7C9.2 31.1 10.1 28.6 11.1 26C12.1 23.4 12.7 20.6 14.7 18.3C16.6 16 20.1 14.2 23 12.3C25.9 10.4 30.6 7.7 32.1 6.8',
        w: 2.6,
      },
    ],
    license: 'in-house',
  },
  {
    id: 'underlineSwoosh',
    theme: 'doodles',
    tags: ['underline', 'swoosh', 'brush stroke', 'doodle', 'emphasis', 'line', 'marker', 'hand drawn'],
    descr: 'A hand-drawn double underline swoosh, the second stroke shorter and returning under the first.',
    box: [120, 30],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      {
        p: 0,
        d: 'M4 16C8.3 15 20.3 11.3 30 10C39.7 8.7 51.3 8.2 62 8C72.7 7.8 85 8.3 94 9C103 9.7 112.3 11.5 116 12',
        w: 2.8,
      },
      { p: 0, d: 'M22 22C26.7 21.2 40.7 18 50 17C59.3 16 69 15.8 78 16C87 16.2 99.7 17.7 104 18', w: 2.2 },
    ],
    license: 'in-house',
  },
  {
    id: 'markerHighlight',
    theme: 'doodles',
    tags: ['highlight', 'marker', 'highlighter', 'scribble', 'emphasis', 'brush', 'band', 'note'],
    descr: 'A translucent yellow highlighter band with frayed square ends, to lay behind a word.',
    box: [120, 30],
    slots: [{ name: 'marker', color: '#ffe066' }],
    layers: [
      { p: 0, d: 'M6 6.6L114 5.2L116 9L113.4 13L116.4 18L114 24.4L5.6 25L3.4 20L6.4 15L3.6 10Z', o: 0.8 },
      { p: 0, d: 'M10 10L110 9L110 21L10 22Z', o: 0.35 },
    ],
    license: 'in-house',
  },
  {
    id: 'handArrow',
    theme: 'doodles',
    tags: ['arrow', 'hand drawn', 'pointer', 'doodle', 'right', 'this way', 'sketch', 'direction'],
    descr: 'A plain hand-drawn arrow in a gentle arc, pointing right.',
    box: [100, 50],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      { p: 0, d: 'M6 40C10 38 20.7 30.7 30 28C39.3 25.3 51.7 23.7 62 24C72.3 24.3 87 29 92 30', w: 2.6 },
      { p: 0, d: 'M82.5 33.2L92 30L84.5 23.4', w: 2.6 },
    ],
    license: 'in-house',
  },
  {
    id: 'curlyArrow',
    theme: 'doodles',
    tags: ['arrow', 'curly arrow', 'loop', 'doodle', 'pointer', 'hand drawn', 'direction', 'look here'],
    descr: 'A hand-drawn arrow that loops once on its way and points up to the right.',
    box: [100, 80],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      {
        p: 0,
        d: 'M6 70C9 69.3 18.3 68.7 24 66C29.7 63.3 36.7 58.7 40 54C43.3 49.3 44.7 42.3 44 38C43.3 33.7 39 29 36 28C33 27 27.7 29.3 26 32C24.3 34.7 24 41 26 44C28 47 32.7 49.7 38 50C43.3 50.3 51.7 49 58 46C64.3 43 70.3 36.7 76 32C81.7 27.3 89.3 20.3 92 18',
        w: 2.4,
      },
      { p: 0, d: 'M88.8 26.4L92 18L83.2 20.1', w: 2.4 },
    ],
    license: 'in-house',
  },
  {
    id: 'loopArrow',
    theme: 'doodles',
    tags: ['arrow', 'loop arrow', 'curved arrow', 'doodle', 'pointer', 'hand drawn', 'down', 'direction'],
    descr: 'A hand-drawn arrow sweeping right, curling into a small loop and pointing down.',
    box: [100, 80],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      {
        p: 0,
        d: 'M8 18C11.7 17 22 12.3 30 12C38 11.7 48.7 13 56 16C63.3 19 70 24.7 74 30C78 35.3 80.7 43 80 48C79.3 53 74 58.3 70 60C66 61.7 58.7 60.3 56 58C53.3 55.7 52.3 48.7 54 46C55.7 43.3 61.3 41 66 42C70.7 43 78 47.3 82 52C86 56.7 88.7 67 90 70',
        w: 2.4,
      },
      { p: 0, d: 'M82.9 64.5L90 70L90.6 61', w: 2.4 },
    ],
    license: 'in-house',
  },
  {
    id: 'sparkles',
    theme: 'doodles',
    tags: ['sparkles', 'stars', 'shine', 'glitter', 'magic', 'twinkle', 'doodle', 'celebration'],
    descr: 'A cluster of three four-pointed sparkles of different sizes with two tiny dots.',
    box: [90, 90],
    slots: [{ name: 'sparkle', color: '#f6c445' }],
    layers: [
      {
        p: 0,
        d: 'M36 20C39.6 46.4 39.6 46.4 66 50C39.6 53.6 39.6 53.6 36 80C32.4 53.6 32.4 53.6 6 50C32.4 46.4 32.4 46.4 36 20ZM70 7C71.8 20.2 71.8 20.2 85 22C71.8 23.8 71.8 23.8 70 37C68.2 23.8 68.2 23.8 55 22C68.2 20.2 68.2 20.2 70 7ZM72 60C73.2 68.8 73.2 68.8 82 70C73.2 71.2 73.2 71.2 72 80C70.8 71.2 70.8 71.2 62 70C70.8 68.8 70.8 68.8 72 60Z',
      },
      {
        p: 0,
        d: 'M20.6 16C20.6 17.4 19.4 18.6 18 18.6C16.6 18.6 15.4 17.4 15.4 16C15.4 14.6 16.6 13.4 18 13.4C19.4 13.4 20.6 14.6 20.6 16ZM86 46C86 47.1 85.1 48 84 48C82.9 48 82 47.1 82 46C82 44.9 82.9 44 84 44C85.1 44 86 44.9 86 46Z',
      },
      {
        p: 'light',
        d: 'M36 41C37.1 48.9 37.1 48.9 45 50C37.1 51.1 37.1 51.1 36 59C34.9 51.1 34.9 51.1 27 50C34.9 48.9 34.9 48.9 36 41ZM70 17.4C70.6 21.4 70.6 21.4 74.6 22C70.6 22.6 70.6 22.6 70 26.6C69.4 22.6 69.4 22.6 65.4 22C69.4 21.4 69.4 21.4 70 17.4Z',
        o: 0.5,
      },
    ],
    license: 'in-house',
  },
  {
    id: 'doodleHeart',
    theme: 'doodles',
    tags: ['heart', 'love', 'doodle', 'hand drawn', 'romance', 'favourite', 'sketch', 'valentine'],
    descr: 'A hand-drawn heart outline in red pen, its line wobbling slightly and crossing over itself at the bottom.',
    box: [100, 90],
    slots: [{ name: 'ink', color: '#e63946' }],
    layers: [
      {
        p: 0,
        d: 'M50.7 28.7C51.2 27.9 52.4 25.4 53.6 23.8C54.9 22.2 56.3 20.6 58.1 19.3C59.9 18 61.8 16.5 64.2 15.8C66.6 15 70.1 14.6 72.6 14.8C75.1 15 76.8 15.9 79 17.1C81.1 18.2 83.7 19.8 85.6 21.8C87.5 23.7 89.5 26.3 90.6 28.7C91.6 31 91.9 33.3 91.9 35.8C91.8 38.3 91.4 41.1 90.4 43.7C89.4 46.3 87.6 49.1 85.8 51.4C83.9 53.7 81.4 55.5 79.2 57.7C76.9 60 74.4 62.8 72 64.9C69.6 67.1 67 68.8 64.9 70.7C62.7 72.7 60.8 74.9 59 76.8C57.2 78.7 55.4 80.5 54.1 82C52.9 83.6 52.1 85 51.6 86.2C51 87.3 50.9 88.3 50.6 89C50.3 89.8 49.8 90.7 49.7 90.7C49.6 90.8 50.3 90 50.1 89.4C49.9 88.8 49.2 88.2 48.5 87C47.9 85.7 47.2 83.6 46.1 81.9C44.9 80.2 43.3 78.5 41.5 76.7C39.6 74.9 37.3 73.3 35.1 71.3C32.8 69.3 30.1 67 27.8 64.8C25.5 62.6 23.3 60.5 21.1 58.2C18.9 55.9 16.2 53.6 14.4 51.1C12.6 48.6 11.5 45.6 10.5 43.1C9.4 40.6 8.3 38.5 8.2 36C8 33.4 8.7 30.1 9.7 27.8C10.8 25.4 12.7 23.8 14.5 22C16.4 20.2 18.4 18.4 20.7 17.2C22.9 16 25.6 14.9 28.1 14.7C30.6 14.5 33.3 15.2 35.5 15.9C37.7 16.6 39.4 17.6 41.3 18.9C43.1 20.2 45.3 22.2 46.5 23.7C47.7 25.3 47.8 26.6 48.5 28C49.1 29.4 49.9 31.1 50.2 31.9C50.5 32.7 49.3 33.6 50.2 33C51.1 32.3 54.7 28.7 55.6 27.8',
        w: 2.6,
      },
    ],
    license: 'in-house',
  },
  {
    id: 'doodleStars',
    theme: 'doodles',
    tags: ['stars', 'doodle', 'hand drawn', 'night', 'sketch', 'favourite', 'rating', 'decoration'],
    descr: 'Three hand-drawn pen stars of different sizes, each drawn in one continuous line.',
    box: [100, 80],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      {
        p: 0,
        d: 'M32 21L46.4 65.8L8 38.2L55.9 38.2L17.5 65.9L32 18.5M76 9.3L84.5 35.6L62.2 19.5L89.3 19.7L68 35L76 10M78 54.8L83.5 71.5L69.1 61.1L86.3 61.3L72.6 71.5L78 55.2',
        w: 2.2,
      },
    ],
    license: 'in-house',
  },
  {
    id: 'squiggle',
    theme: 'doodles',
    tags: ['squiggle', 'wave', 'zigzag', 'doodle', 'line', 'scribble', 'decoration', 'hand drawn'],
    descr: 'A loose hand-drawn wavy pen line, like a pen testing itself in a margin.',
    box: [120, 40],
    slots: [{ name: 'ink', color: '#2b2522' }],
    layers: [
      {
        p: 0,
        d: 'M6 20C6.6 20.9 8.3 24 9.4 25.2C10.5 26.4 11.6 27 12.8 27.1C13.9 27.1 15 26.5 16.1 25.3C17.3 24.2 18.4 21.7 19.5 20C20.6 18.3 21.8 16.5 22.9 15C24 13.5 25.1 11.1 26.3 11.1C27.4 11 28.5 13.4 29.6 14.9C30.8 16.4 31.9 18.1 33 20C34.1 21.9 35.3 24.8 36.4 26.3C37.5 27.7 38.6 28.5 39.8 28.5C40.9 28.4 42 27.5 43.1 26.1C44.3 24.6 45.4 21.9 46.5 20C47.6 18.1 48.8 16 49.9 14.7C51 13.3 52.1 12.1 53.3 12C54.4 11.9 55.5 12.8 56.6 14.2C57.8 15.5 58.9 18 60 20C61.1 22 62.3 24.5 63.4 25.9C64.5 27.3 65.6 28.5 66.8 28.6C67.9 28.6 69 27.6 70.1 26.2C71.3 24.8 72.4 22 73.5 20C74.6 18 75.8 15.3 76.9 14C78 12.8 79.1 12.3 80.3 12.4C81.4 12.4 82.5 13.1 83.6 14.4C84.8 15.7 85.9 18.2 87 20C88.1 21.8 89.3 24.1 90.4 25.4C91.5 26.7 92.6 27.6 93.8 27.7C94.9 27.9 96 27.6 97.1 26.3C98.3 25 99.4 22.1 100.5 20C101.6 17.9 102.8 14.9 103.9 13.7C105 12.4 106.1 12.3 107.3 12.4C108.4 12.5 109.5 13.3 110.6 14.5C111.8 15.8 113.4 19.1 114 20',
        w: 2.4,
      },
    ],
    license: 'in-house',
  },
  {
    id: 'xMark',
    theme: 'doodles',
    tags: ['x marks the spot', 'cross', 'treasure map', 'doodle', 'mark', 'destination', 'here', 'hand drawn'],
    descr: 'A bold hand-drawn red X, as on a treasure map, with two small tick strokes beside it.',
    box: [80, 80],
    slots: [{ name: 'ink', color: '#d62828' }],
    layers: [
      {
        p: 0,
        d: 'M14 12C18 16.3 29.3 28.7 38 38C46.7 47.3 61.3 63 66 68M64 10C60 14.3 48.3 26.7 40 36C31.7 45.3 18.3 61 14 66',
        w: 6,
      },
      { p: 0, d: 'M66 20L74 14M68 30L77 28', w: 1.8 },
    ],
    license: 'in-house',
  },
  {
    id: 'dottedPath',
    theme: 'doodles',
    tags: ['dotted path', 'route', 'trail', 'journey', 'map', 'treasure', 'doodle', 'dashed line'],
    descr: 'A winding dashed pen line, a journey from the corner, ending at a small red X.',
    box: [90, 80],
    slots: [
      { name: 'trail', color: '#2b2522' },
      { name: 'x', color: '#d62828' },
    ],
    layers: [
      {
        p: 0,
        d: 'M6 70L6.5 69.6L7.2 69.2L7.9 68.7L8.6 68.2M10.8 66.8L11.8 66.2L12.9 65.5L13.5 65.1M15.7 63.6L16.3 63.2L17.4 62.4L18.3 61.7M20.3 60.1L20.5 60L21.4 59.2L22.2 58.3L22.6 57.9M24.1 55.8L24.3 55.2L24.5 54.4L24.6 53.6L24.6 52.8L24.5 52.7M24 50.1L23.7 49.3L23.3 48.4L23 47.5L22.9 47.1M21.9 44.7L21.8 44.1L21.6 43.3L21.4 42.6L21.4 41.9L21.4 41.6M22.6 39.3L23 38.9L23.6 38.4L24.3 37.9L25 37.4L25.1 37.4M27.5 36.2L27.7 36.1L28.6 35.7L29.6 35.4L30.5 35.1M33 34.5L33.8 34.3L34.9 34.1L36 34L36.2 34M38.7 33.9L39 33.9L40 34L41 34.2L41.9 34.4M44.3 35.5L45 35.9L46.1 36.6L47 37.2M49.1 38.6L49.3 38.7L50.4 39.5L51.4 40.2L51.8 40.5M53.9 41.9L54.5 42.3L55.5 42.8L56.5 43.3L56.8 43.4M59.3 44L60 44L60.8 43.8L61.6 43.6L62.3 43.2M64.4 41.7L64.6 41.6L65.3 40.9L66 40.1L66.7 39.4M68.2 37.3L68.6 36.8L69.2 35.9L69.7 35L69.9 34.6M71.1 32.3L71.4 31.5L71.7 30.7L72 30L72.2 29.3M72.5 26.7L72.4 26.2L72.4 25.4L72.3 24.5L72.1 23.7L72.1 23.5M71.5 21L71.3 20.6L71.1 19.9L70.9 19.2L70.7 18.5L70.5 18',
        w: 2,
      },
      { p: 1, d: 'M64 6L78 18M78 6L64 18', w: 3.6 },
      {
        p: 0,
        d: 'M8.6 70C8.6 71.4 7.4 72.6 6 72.6C4.6 72.6 3.4 71.4 3.4 70C3.4 68.6 4.6 67.4 6 67.4C7.4 67.4 8.6 68.6 8.6 70Z',
      },
    ],
    license: 'in-house',
  },
];
