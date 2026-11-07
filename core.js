// Hushbones — rules, word logic and the run. No DOM here, so node can load it for the sim and tests.
//
// THE DUEL (GDD §5): each round the foe reveals the exact list of words it will cast. You roll letter dice and
// spell words, sending each one to SPARK (damage) or WARD (protection). Keep spelling from the same roll, then
// CAST (bank everything; the foe then casts its list into your Defense) or PUSH (reroll the unused dice, risking the
// whole turn's charge). A roll with no legal word FIZZLES: both charges are lost and the foe casts its list anyway.
// Use every die for a ALL SPEAK – ROLL AGAIN (design docs: "hot dice"): +100 charge and the option to push all dice. Wrong words backfire (d's rule).
(function (root) {
  "use strict";

  // ======================= TUNING KNOBS =======================
  var CONFIG = {
    minWordLen: 2,
    pointsScale: 10,
    lengthMult: { 2: 1, 3: 1, 4: 1.5, 5: 2, 6: 3, 7: 3.6, 8: 4.2, 9: 4.8 },  // 9+ capped; tapered past 6 letters (playtest: one 8-letter word ended bosses)
    hotDiceBonus: 100,           // damage charge for using every die (not word power)
    wardRate: 0.85,               // Defense gets 60% of a word's power (rounded down)
    // After a Push you must spell a word from the new roll before the clock runs out (d, 2026-11-05).
    // Running out, or casting before you've spelled one, fails the push: the charge is lost and the foe acts.
    pushSeconds: [20, 18, 15],   // per act
    // Speed bonus on the pushed word (d, 2026-11-05): the clock is cut into segments; each segment still left
    // adds `step` to the word's multiplier, scaled by length, so a fast long word gains a lot and a fast short one little.
    // Length factor = (letters - 2) / (fullAt - 2), capped at 1: 3 letters 20%, 5 letters 60%, 7+ letters 100%.
    speed: { segments: 4, step: 0.2, fullAt: 7 },   // quadrants (d)
    // Each word spelled on a running clock restarts it, longer each time (d, 2026-11-05): 20s, then 27s, then 34s...
    // Running out after you've answered the push just casts what you have (no fizzle).
    clockSlow: 0.35,
    // Submitting a non-word costs HP (d's rule). Index = wrong words in a row - 1; last entry repeats.
    wrongWordPenalties: [40, 80, 300],

    // ---- Lore: achievements, once each per fight (GDD §8). Every lorePerCache = a bonus cache after the fight. ----
    lorePerCache: 8,

    // ---- player ----
    playerHp: 700,      // d: start lower and grow it with Vitality rewards
    vitality: { small: 100, big: 150, steel: 60 }, hollowmereHeal: 0.05,
    healAfterFight: 0,   // d, 2026-11-07: winning doesn't heal; Rest, Mend, Vitality and new acts do
    actHeal: 0.3,      // playtest round 7: heals erased all pressure
    restHeal: 0.25,
    // Difficulty (d, 2026-11-05): lives/retries are an Easy-mode feature. Normal is one life.
    difficulties: {
      easy:   { name: "Easy",   strikes: 3, desc: "Three strikes: lose a duel and retry the room with fresh dice." },
      normal: { name: "Normal", strikes: 1, desc: "One life. Lose a duel and your year is over." },
      hard:   { name: "Hard",   strikes: 1, foeHp: 1.6, foeAtk: 1.3, bigWords: true, score: 2, desc: "For word experts. One life; foes have 60% more HP, hit 30% harder and know bigger words. Scores count double." },
    },
    strikes: 3,
    retryHpFloor: 0.3,
    startCoins: 4,

    coinsWin: 12, coinsElite: 8, coinsBoss: 20, feastCost: 18, feastExtra: 0.2, coinsPurse: 1, skipCoins: 3,

    // ---- enemies. hp = base HP. atk = base damage per attack row. turns = rounds before enrage.
    //      spells = the familiar words they cast (their "incantations"). trait: see TRAITS. ----
    foes: {
      // ACT I: students of Thistlemoor
      ashby:    { name: "Pell Ashby",      act: 1, role: "student", house: "emberhall",  hp: 430, atk: 62, turns: 4, art: "portrait", trait: "hasty",   spells: ["SCORCH", "FLARE", "SINGE"],  quip: "First to cast wins. Everyone knows that." },
      talbot:   { name: "Wren Talbot",     act: 1, role: "student", house: "inkwright",  hp: 470, atk: 54, turns: 4, art: "portrait", trait: "warded",  spells: ["CORRECT", "STRIKE", "MARK"], quip: "Two-letter words? How quaint." },
      fisk:     { name: "Dorran Fisk",     act: 1, role: "student", house: "thornwick",  hp: 450, atk: 58, turns: 4, art: "portrait", trait: "thorns",  spells: ["SNARE", "PRICK", "TRIP"],   quip: "Go on. Misspell one." },
      quint:    { name: "Mabel Quint",     act: 1, role: "student", house: "hollowmere", hp: 510, atk: 48, turns: 5, art: "portrait", trait: "patient", spells: ["STEADY", "PUSH", "SHOVE"],  quip: "Slow and steady, new kid." },
      vale:     { name: "Juniper Vale",    act: 1, role: "student", house: "inkwright",  hp: 410, atk: 64, turns: 4, art: "portrait",                   spells: ["RECITE", "QUOTE", "CITE"],  quip: "I read ahead. All of it." },
      brimble:  { name: "Otto Brimble",    act: 1, role: "student", house: "hollowmere", hp: 560, atk: 50, turns: 5, art: "portrait", trait: "glutton", spells: ["MUNCH", "GULP", "BELLY"],   quip: "Second helpings! Of your mistakes." },
      morrow:   { name: "Cass Morrow",     act: 1, role: "student", house: "thornwick",  hp: 440, atk: 60, turns: 4, art: "portrait", trait: "leech",   spells: ["DRAIN", "SIP", "TAKE"],     quip: "I keep things. Flakes. Chips. Secrets." },
      hadley:   { name: "Bram Hadley",     act: 1, role: "student", house: "emberhall",  hp: 480, atk: 66, turns: 4, art: "portrait",                   spells: ["BOOM", "ROAR", "BLAST"],    quip: "Loud words win duels." },
      pip:      { name: "Pip Larkin",      act: 1, role: "student", house: "thornwick",  hp: 390, atk: 66, turns: 3, art: "portrait", trait: "hasty",   spells: ["PINCH", "POKE", "ZIP"],     quip: "Quick, quick, before the bell!" },
      crane:    { name: "Prefect Lysander Crane", act: 1, role: "prefect", house: "inkwright", hp: 620, atk: 56, turns: 5, art: "portrait", trait: "warded", spells: ["DETAIN", "FINE", "LINES"], quip: "Ten points from your house. Shall we make it twenty?" },
      sallow:   { name: "Prefect Imogen Sallow",  act: 1, role: "prefect", house: "emberhall", hp: 600, atk: 56, turns: 4, art: "portrait", trait: "thorns", spells: ["ORDER", "SILENCE", "RULE"], quip: "Rules are spells too, novice." },
      // ACT II: the Lowmarket crews in the city of Fairgate
      runt:     { name: "Runt",            act: 2, role: "villain", hp: 720, atk: 76, turns: 4, art: "portrait",                   spells: ["BITE", "CLAW", "KICK"],     quip: "Keep rollin'. Bones like those fetch a fortune down here." },
      tumbler:  { name: "The Tumbler",     act: 2, role: "villain", hp: 680, atk: 70, turns: 5, art: "portrait", trait: "patient", spells: ["TRIP", "TUMBLE", "SPRAWL"], quip: "I owe everyone. Why not you too?" },
      miser:    { name: "The Miser",       act: 2, role: "villain", hp: 800, atk: 74, turns: 4, art: "portrait", trait: "glutton", spells: ["HOARD", "TAX", "CLUTCH"],  quip: "Bone dust by the ounce. Your voice by the word." },
      robber:   { name: "Grave Robber",    act: 2, role: "villain", hp: 840, atk: 80, turns: 5, art: "portrait", trait: "thief",   spells: ["DIG", "ROB", "SHOVEL"],    quip: "Old bones, new bones. I dig them all up eventually." },
      lucky:    { name: "The Loaded Lady", act: 2, role: "villain", hp: 780, atk: 78, turns: 5, art: "portrait", trait: "glutton", spells: ["CHANCE", "JINX", "DICE"],  quip: "Feeling lucky? I always am." },
      carver:   { name: "The Carver",      act: 2, role: "elite",   hp: 880, atk: 84, turns: 5, art: "portrait", trait: "thorns",  spells: ["CARVE", "NICK", "SLICE"],  quip: "Every word cuts both ways." },
      cardsharp:{ name: "The Forger",      act: 2, role: "elite",   hp: 860, atk: 86, turns: 5, art: "portrait", trait: "thief", spells: ["CHEAT", "DEAL", "BLUFF"],  quip: "Every face is real if you squint." },
      hexer:    { name: "The Hexer",       act: 2, role: "elite",   hp: 920, atk: 86, turns: 5, art: "portrait", trait: "thorns",   spells: ["HEX", "CURSE", "WITHER"], quip: "A pinch of bone dust and a bad word. That's all a curse is." },
      warden:   { name: "The Warden",      act: 2, role: "boss",    hp: 1800, atk: 78, turns: 7, art: "portrait", boss: true,        spells: ["LOCK", "CHAIN", "SLAM", "JAIL"], quip: "Nobody leaves the Lowmarket with my door's business." },
      // ACT III: the traitor's followers in the Sealed Library
      scrivener:{ name: "The Scrivener",   act: 3, role: "villain", hp: 1080, atk: 92, turns: 5, art: "portrait", trait: "warded",  spells: ["INK", "BLOT", "ERASE"],    quip: "Spell it properly or not at all." },
      rook:     { name: "Sister Rook",     act: 3, role: "villain", hp: 1020, atk: 98, turns: 4, art: "portrait", trait: "hasty",   spells: ["PECK", "CAW", "TALON"],    quip: "The crows are counting, child." },
      tallow:   { name: "Tallow",          act: 3, role: "villain", hp: 1220, atk: 86, turns: 6, art: "portrait", trait: "patient", spells: ["MELT", "BURN", "WAX"],     quip: "Burn slow. Burn long." },
      jester:   { name: "Gallows Jester",  act: 3, role: "villain", hp: 990, atk: 98, turns: 5, art: "portrait", trait: "thorns",  spells: ["JEST", "MOCK", "TAUNT"],   quip: "Get it wrong! Go on, I dare you!" },
      lexicant: { name: "The Lexicant",    act: 3, role: "villain", hp: 1180, atk: 92, turns: 5, art: "portrait", trait: "pedant",  spells: ["DEFINE", "RECALL", "PAGE"], quip: "I have read every word. You have not." },
      bishop:   { name: "The Bone Bishop", act: 3, role: "villain", hp: 1270, atk: 88, turns: 6, art: "portrait", trait: "patient", spells: ["SMITE", "KNEEL", "PRAY"],  quip: "Kneel, and spell your confession." },
      ferryman: { name: "The Ferryman",    act: 3, role: "villain", hp: 1130, atk: 98, turns: 5, art: "portrait", trait: "leech",   spells: ["DROWN", "OAR", "TOLL"],    quip: "One word for each oar." },
      hangman:  { name: "The Hangman",     act: 3, role: "villain", hp: 1180, atk: 96, turns: 4, art: "portrait", trait: "banish",  spells: ["NOOSE", "DROP", "HANG"],   quip: "Guess wrong and you hang." },
      abbess:   { name: "The Abbess of Silence", act: 3, role: "elite", hp: 1000, atk: 90, turns: 6, art: "portrait", trait: "mute", spells: ["HUSH", "QUIET", "STILL"], quip: "Hush. Every word costs." },
    },
    // ---- professors: the seed picks the traitor (Act III boss) and a different examiner (Act I boss) ----
    professors: {
      venn:     { name: "Professor Aldous Venn",    subject: "Etymology",           house: "inkwright",  trait: "warded",  traitorHp: 1.0,  art: "portrait", spells: ["DEFINE", "ROOT", "PARSE", "LEXICON"] },
      ashgrove: { name: "Professor Maren Ashgrove", subject: "Incantation",         house: "emberhall",  trait: "hasty",   traitorHp: 0.9,  art: "portrait", spells: ["IGNITE", "BLAZE", "ROAR", "INFERNO"] },
      thale:    { name: "Professor Corvin Thale",   subject: "Wards and Hexes",     house: "thornwick",  trait: "thorns",  traitorHp: 1.05, art: "portrait", spells: ["WARD", "HEX", "BIND", "BREAK"] },
      brack:    { name: "Professor Isolde Brack",   subject: "Restoration",         house: "hollowmere", trait: "leech",   traitorHp: 0.95, art: "portrait", spells: ["MEND", "STITCH", "DRAIN", "REVIVE"] },
      quell:    { name: "Professor Silas Quell",    subject: "Duelling and Speedcasting", house: null,   trait: "glutton", traitorHp: 0.9,  art: "portrait", spells: ["LUNGE", "PARRY", "RIPOSTE", "TIME"] },
    },
    exam:    { hp: 1250, atk: 56, turns: 7 },
    traitor: { hp: 2000, atk: 84, turns: 8 },
    // Intent patterns: each round's rows as multiples of atk; cycles. Specials are added by traits.
    patterns: {
      // d: foes cast several words a turn, like you do; your 2- and 3-letter words answer them one by one
      student: [[0.6, 0.5], [0.5, 0.4, 0.4], [0.8, 0.6]],
      prefect: [[0.6, 0.5, 0.4], [0.7, 0.6], [0.5, 0.5, 0.4, 0.3]],
      villain: [[0.7, 0.5, 0.4], [0.6, 0.6, 0.5], [0.9, 0.6]],
      elite:   [[0.7, 0.6, 0.5], [0.6, 0.5, 0.5, 0.4], [0.9, 0.7]],
      boss:    [[0.7, 0.6, 0.5], [0.6, 0.5, 0.5, 0.4], [0.9, 0.7, 0.4], [0.6, 0.6, 0.6, 0.5]],
    },
    enrageGrowth: 1.1, enrageCap: 1.6,   // d, 2026-11-07: "ease the enrage ramp" (was ×1.25 a round, uncapped: ×6 by round 10)
    thornsReflect: 0.25,         // Thorns rows reflect this × atk when you cast damage and it survives
    guardMult: 1.5,              // Warded: WARD rows grant this × atk Guard
    gluttonHeal: 0.15,
    titheDamage: 100,
    frayAmount: 60,
    boneWardPerRow: 25,
    pushMinLenCap: 5,
    momentum: 0.25,
    foeBlockChance: 0.5,
    // Slot duels (prototype mode, round-6 veteran's idea): each foe word carries a rule; a word that meets it breaks the slot
    // (its hit is cancelled) and deals breakShare of its Attack; Freestyle (the Attack button) deals full Attack and blocks nothing.
    slots: { breakShare: 0.5, foeHp: 0.85 },
    // Forms scoring (slot duels): the TURN scores Chips × Mult. Chips = letter values ×10 for every word banked; Mult = 1 +
    // each Form the turn's words fill (counted once) + Chain (successful rolls again) + 2 per All Speak. Words aimed at the foe's
    // face count fully; words that break a slot count breakShare. A bust loses the bank and the foe's words land at 150%.
    chipLen: { 4: 1, 5: 1.25, 6: 1.5, 7: 1.75, 8: 2, 9: 2.25 },   // d: Forms removed; long words multiply their letter Chips
    forms: { multCap: 5, chipScale: 3, chainCap: 3, allSpeakMult: 1, bustMult: 1.5 },   // chance a foe turns one attack word into a block word this round   // once a turn; round 10: rolling again was never worth it
    wildWordMult: 0.7,
    maxRolls: 3,       // rolls again per turn, All Speak rolls included (playtest round 8: endless chains banked 3,000+)
    // Omens (d, 2026-11-06): marks on a die for one roll. Good ones by luck; bad ones only from foes (Hexer trait, bosses).
    omens: { enabled: false, goodChance: 0.35, gildMult: 3, coin: 2, mend: 30, cursed: 40, leechPct: 0.05, hollow: 0.5 },
    heavyMult: 2,
    foeWordNorm: 19,   // foe power = attack ÷ this (their words average ~10 letter points)
    bigWord: { chance: 0.4, chanceStudent: 0.25, mult: 1 },   // a big word is long, so the word math already makes it ~2.5× a normal word
    actScale: { hp: [1.76, 1.0, 0.9], atk: [0.95, 0.65, 0.65] },   // d: Act I about 10% harder than "good"; Acts II–III eased   // flatten the curve: Act I duels last longer (a 5-word bot won them in 1.6 rounds)
    // Inlays (d, 2026-11-06): coloured letters. Red feeds Attack, blue feeds Defense. Same-colour inlaid letters side by side
    // in a word chain together (an electric link on the dice) for a bigger bonus. More colours can join INLAYS later.
    inlay: { enabled: true, per: 0, chain: 0, startRed: 1, offers: true, multRed: 1 },
    // Red dice add +1 Mult when their word hits the foe. (Blue dice were removed, d, 2026-11-06.)
    shopPriceScale: 7.0,   // d, 2026-11-06: raised with Overkill Ledger in the pool (was 5);     // playtest: 2–4 coin prices against 14–18 coins bought out the shop

    // ---- houses (GDD §4): modest build directions ----
    houses: {
      // d, 2026-11-06: the old house bonuses didn't fit the new rules; these small ones do.
      emberhall:  { name: "Emberhall",  crest: "ember",      motto: "Speak boldly.",       color: "#d8553a", desc: "Words of 6+ letters score +25% Chips." },
      inkwright:  { name: "Inkwright",  crest: "sigil_fate", motto: "Know the word.",      color: "#5a7ad8", desc: "Start each act with an Ink sigil (turn a die into any vowel)." },
      thornwick:  { name: "Thornwick",  crest: "spite",      motto: "Leave them nothing.", color: "#5aa060", desc: "Once per duel, a 2-letter word cancels a foe word instead of halving it." },
      hollowmere: { name: "Hollowmere", crest: "wave",       motto: "Endure.",             color: "#3aa8a8", desc: "Heal 5% of your max HP after each win." },
    },
    // ---- the three acts, each its own seeded map ----
    acts: [
      // 8 rows before the boss (d: "another two levels on the map ... slightly harder before boss"):
      // rows 6-7 lean on elites, and row 7 always offers one, before the rest stop on row 8.
      { name: "Act I",   title: "First Term",    place: "Thistlemoor Academy", rows: 11, boss: "exam",
        rowTypes: [ { fight: 1.12 }, { fight: 0.62, trial: 0.3, unknown: 0.2 }, { fight: 0.52, unknown: 0.2, quiz: 0.15, shop: 0.10 }, { fight: 0.52, elite: 0.25, quiz: 0.2, trial: 0.15 }, { fight: 0.57, elite: 0.25, unknown: 0.3 },
                    { fight: 0.57, elite: 0.35, unknown: 0.2 }, { fight: 0.52, elite: 0.45, shop: 0.15 }, { rest: 0.45, shop: 0.3, fight: 0.25 } ],
        mustHave: { 1: "trial", 4: "quiz", 9: "elite", 10: "rest" } },
      { name: "Act II",  title: "The Lowmarket",  place: "the city of Fairgate", rows: 11, boss: "warden",
        rowTypes: [ { fight: 0.82, unknown: 0.3 }, { fight: 0.57, unknown: 0.35, shop: 0.08 }, { fight: 0.52, elite: 0.25, unknown: 0.35 }, { fight: 0.52, elite: 0.2, rest: 0.2, unknown: 0.2 }, { fight: 0.57, elite: 0.25, shop: 0.12 },
                    { fight: 0.57, elite: 0.35, unknown: 0.2 }, { fight: 0.52, elite: 0.45, unknown: 0.15 }, { rest: 0.45, shop: 0.3, fight: 0.25 } ],
        mustHave: { 9: "elite", 10: "rest" }, clues: true, clueRows: [5] },
      { name: "Act III", title: "The Awakening",  place: "the Sealed Library", rows: 11, boss: "traitor",
        rowTypes: [ { fight: 0.82, unknown: 0.3 }, { fight: 0.52, elite: 0.2, unknown: 0.25, quiz: 0.15 }, { fight: 0.52, elite: 0.2, shop: 0.2, trial: 0.2 }, { fight: 0.47, elite: 0.3, unknown: 0.35 }, { fight: 0.52, elite: 0.3, shop: 0.12 },
                    { fight: 0.52, elite: 0.4, unknown: 0.2 }, { fight: 0.47, elite: 0.5, unknown: 0.15 }, { rest: 0.5, shop: 0.3, fight: 0.2 } ],
        mustHave: { 9: "elite", 10: "rest" }, clues: true, clueRows: [1, 6] },
    ],
    // d: "ramp the duel strength". Foes grow steadily row by row (playtest: 220 → 940 and 180 → 610 jumps between duels).
    // Replaces the early-third ease, the first-duel step and HP per row. Bosses sit outside the ramp.
    ramp: { hp: [0.3, 1.6], atk: [0.6, 1.1] },
    foeHpScale: 0.55, foeAtkScale: 1.1,   // 2026-11-07, smooth ramp + tougher elites/bosses + 12 coins a win: expert bot 55% runs won
    elite: { hp: 2.0, atk: 1.1 },   // elites and bosses skip roleHp; these keep them above the duels beside them (2026-11-07 ramp)
    boss: { hp: 1.8, atk: 1.15 },
    roleHp: { student: 1.7, villain: 1.5, prefect: 1.0, elite: 1.0, boss: 1.0 },   // ordinary foes were pushovers next to elites (expert-bot calibration)   // playtest round 5: bosses died in two rounds
    rarityWeights: { common: 72, uncommon: 22, rare: 6, legendary: 0 },   // d: too many big boxes
    trial: { seconds: 45, wrongPenaltySec: 4, rewards: [ { at: 500, coins: 6 }, { at: 1100, reward: "common" }, { at: 1900, reward: "uncommon" } ] },
    // d, 2026-11-07: "the quiz should scale between difficulty levels". Word tier, number of choices and the cost of a wrong answer.
    quiz: { questions: 6, choices: 4,
      byDifficulty: { easy: { tiers: [1], choices: 3, wrongHp: 20 }, normal: { tiers: [1, 2], choices: 4, wrongHp: 40 }, hard: { tiers: [2, 3], choices: 5, wrongHp: 60 } } },
    seedChars: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    maxCharms: 4, maxSigils: 3,
    shopOffers: 4, rerollCost: 6,
    relicChance: { elite: 0.25, pick: 0.03, shop: 0.15 },   // bosses always offer one (d: relics are rare)
    DICE: [
      "AEIOUA", "AEIOUE", "EEAOIY",
      "RSTLNE", "STRNDL", "TSRLDO",
      "NSTRLA", "CMPBHG",
      "KFWVYZ",
    ],
    EXTRA_DICE: ["EARTSN", "OILNST", "AEEIOU", "RSTHLE", "BCDAEM", "HJXSRE", "AEINRS", "DGMPAO"],   // every die has a vowel (playtest: consonant-only dice were dead picks)
    minDice: 7, maxDice: 10,
  };

  // d, 2026-11-07: "another 3 levels per map with shops evenly spaced". The 8 tuned row weightings stretch to 11 by repeating the middle.
  CONFIG.acts.forEach(function (A) { var o = A.rowTypes; if (o.length === 8) A.rowTypes = [o[0], o[1], o[2], o[3], o[4], o[3], o[4], o[5], o[5], o[6], o[7]]; });
  function shopRows(N) { return [Math.round((N + 1) / 3) - 1, Math.round(2 * (N + 1) / 3) - 1]; }   // 11 rows: shops on rows 4 and 8, three rooms apart
  var LETTER_VALUE = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
    n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10, "*": 0,
  };
  var ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");

  // ======================= CHARMS / SIGILS / UPGRADES / CURSES =======================
  // Rarity ids are internal; the game shows Bone / Brass / Gold / Crystal.
  var RARITIES = ["common", "uncommon", "rare", "legendary"];
  var RARITY = {
    common:    { name: "Common",    box: "bone" },   // d: show Common / Uncommon / Rare / Legendary (box art unchanged)
    uncommon:  { name: "Uncommon",  box: "brass" },
    rare:      { name: "Rare",      box: "gold" },
    legendary: { name: "Legendary", box: "crystal" },
  };
  // d, 2026-11-06: every old reward removed ("overpowered, some not applicable to the new system"). This set was proposed
  // to three veteran testers and revised from their reviews (playtests/reward-proposal-2026-11-06.md). Each charm belongs to a
  // professor patron; a reward pick leans on one or two patrons so a run can build toward a theme.
  var PATRONS = {
    venn:     { name: "Venn",     theme: "wordplay" },
    ashgrove: { name: "Ashgrove", theme: "rare letters and fire" },
    thale:    { name: "Thale",    theme: "wards" },
    brack:    { name: "Brack",    theme: "mending" },
    quell:    { name: "Quell",    theme: "All Speak" },
    bursar:   { name: "The Bursar", theme: "coin" },
  };
  var CHARMS = {
    twin:      { name: "Twin Tongues",   patron: "venn",     rarity: "common",   icon: "mirror",      price: 4, desc: "Words with a double letter score +50% Chips." },
    palin:     { name: "Palindrome",     patron: "venn",     rarity: "uncommon", icon: "mirror",      price: 5, desc: "Words that start and end with the same letter score double Chips." },
    longfuse:  { name: "Long Fuse",      patron: "venn",     rarity: "uncommon", icon: "hourglass",   price: 5, desc: "Each word of 7+ letters adds +1 Mult." },
    kindling:  { name: "Kindling",       patron: "ashgrove", rarity: "common",   icon: "ember",       price: 4, desc: "Q, Z, X and J are worth double Chips." },
    wildfire:  { name: "Wildfire",       patron: "ashgrove", rarity: "uncommon", icon: "sigil_flare", price: 5, desc: "Once per duel, a roll again that would bust rerolls once instead." },
    firebrand: { name: "Firebrand",      patron: "ashgrove", rarity: "rare",     icon: "strike",      price: 7, desc: "Your first scoring word each turn adds +1 Mult." },
    wardecho:  { name: "Ward Echo",      patron: "thale",    rarity: "common",   icon: "ward",        price: 4, desc: "Your first defense word each turn adds +12 Chips to the turn." },
    counter:   { name: "Counterspell",   patron: "thale",    rarity: "uncommon", icon: "ward",        price: 5, desc: "A 3-letter cancel adds a quarter of the cancelled word's damage to your Chips." },
    thickhide: { name: "Thick Hide",     patron: "thale",    rarity: "uncommon", icon: "anchor",      price: 5, desc: "The first foe attack word each round hits for half." },
    mendword:  { name: "Mending Word",   patron: "brack",    rarity: "common",   icon: "heal",        price: 4, desc: "Each 3-letter cancel heals you 12." },
    secondwind:{ name: "Second Wind",    patron: "brack",    rarity: "uncommon", icon: "heal",        price: 5, desc: "Once per duel, a hit that would drop you to 0 leaves you on 1." },
    encore:    { name: "Encore",         patron: "quell",    rarity: "common",   icon: "notch",       price: 4, desc: "Each All Speak also adds +18 Chips to the turn." },
    lastdie:   { name: "Last Die Standing", patron: "quell", rarity: "rare",     icon: "notch",       price: 7, desc: "One unused die left still counts as All Speak (Encore doesn't add to it)." },
    ledger:    { name: "Overkill Ledger",patron: "bursar",   rarity: "uncommon", icon: "coin",        price: 5, desc: "Damage past the killing blow becomes coins: 1 per 30, up to 10." },
    rebuttal:  { name: "Rebuttal",       patron: "venn",     rarity: "rare",     icon: "mirror",      price: 7, duo: ["venn", "thale"], desc: "Duo (Venn + Thale): a 3-letter cancel with a double letter also scores, like a word that hits." },
  };
  // d, 2026-11-07: "the mults might be only granted if you get a charm that unlocks… so a relic". Base Mult is 1; every Mult
  // source is a relic. Relics are permanent and don't take a charm slot.
  var RELIC_ICONS = { long: "hourglass", pair: "mirror", open: "wave", rare: "sigil_flare", plural: "wave", bookends: "mirror", ladder: "notch", echo: "ash" };
  var RELICS = {};
  var SIGILS = {
    tumble:   { name: "Tumble",    icon: "sigil_tumble", price: 2, desc: "Reroll one unused die. Never busts.", target: true },
    ink:      { name: "Ink",       icon: "sigil_flare",  price: 2, desc: "Turn one unused die into a vowel of your choice for this roll.", target: true },
    holdfast: { name: "Hold Fast", icon: "sigil_raise",  price: 3, desc: "Carried: your next bust still casts half of your bank (the foe's words land at 150% as usual)." },
  };
  var UPGRADES = {};
  var CURSES = {
    long4:   { name: "Curse of Length",  desc: "Only words of 4+ letters. Push needs 4+ dice." },
    once:    { name: "Curse of Greed",   desc: "Each spelling can be used only once this duel." },
    tax:     { name: "Curse of Tithe",   desc: "A fizzle adds a 100-damage TITHE to the enemy's list." },
    silence: { name: "Curse of Silence", desc: "Each round the foe silences one die for the next round." },
  };
  var TRAITS = {
    thorns:  { name: "Thorns",  desc: "Words marked ✴ hit you back for part of your Attack when you cast at it. Defense blocks that too." },
    warded:  { name: "Warded",  desc: "Sometimes casts WARD: Guard that soaks your next attack." },
    glutton: { name: "Glutton", desc: "Heals 15% of its HP when you fizzle." },
    leech:   { name: "Leech",   desc: "Marked rows heal it for half the HP damage they deal." },
    mute:    { name: "Mute",    desc: "No 2-letter words." },
    hasty:   { name: "Hasty",   desc: "Enrages a round sooner, and its words hit 20% harder." },
    patient: { name: "Patient", desc: "Enrages a round later; +25% HP. Outlast it with Defense." },
    // playtest (veteran): foes whose mechanics force a different play, not just a longer word
    thief:   { name: "Thief",   desc: "Each round it steals your most valuable die for the next round." },
    pedant:  { name: "Pedant",  desc: "No words under 4 letters." },
    hexer:   { name: "Hexer",   desc: "Curses one of your dice each round: cursed, hollow or leeching. Spell around it, or roll it away." },
    banish:  { name: "Banisher", desc: "Bans one vowel each round: words using it don't count." },
  };
  var ROOMS = {
    fight:   { name: "Duel",    icon: "pirate/tournament_swords", sub: "A foe from this act" },
    elite:   { name: "Elite",   icon: "skull-curse", sub: "Tougher foe; extra coins and an Uncommon-or-better reward" },
    unknown: { name: "Unknown", icon: "sigil_fate", sub: "Hidden until you enter" },
    rest:    { name: "Rest",    icon: "heal",       sub: "Heal 30%, or carve a face for free" },
    shop:    { name: "Shop",    icon: "coin",       sub: "Spend your coins" },
    trial:   { name: "Speed Trial", icon: "hourglass", sub: "Optional timed sprint; prizes for a high score" },
    quiz:    { name: "Vocabulary Quiz", icon: "pirate/journal", sub: "Optional: match words to definitions" },
    clue:    { name: "Clue",    icon: "mirror",     sub: "Optional: evidence about the traitor; each clue weakens their final duel" },
    boss:    { name: "Boss",    icon: "skull-curse", sub: "The end of the act" },
  };
  var EVENTS = {
    cache:   { name: "A Loose Brick",     text: "Behind a loose brick: a pouch of coins." },
    inkwell: { name: "A Spilled Inkwell", text: "Old ink still glows on the floor. You read what it wrote." },
    trap:    { name: "A Falling Stone",   text: "The ceiling gives way above you." },
    shrine:  { name: "A Bone Shrine",     text: "Someone left an offering. It's yours now." },
    ambush:  { name: "An Ambush",         text: "Something was waiting in the dark." },
    font:    { name: "A Quiet Font",      text: "Cold water. You feel steadier." },
    clue:    { name: "Something Left Behind", text: "" },
  };
  var CARVE_LETTERS = ["e", "s", "a", "r", "t", "i", "o", "n"];
  var SPICY_LETTERS = ["z", "x", "j", "k"];

  // ======================= DICTIONARY =======================
  var dict = null, byKey = null, commonRank = null;
  function sortKey(s) { return s.split("").sort().join(""); }
  // d, 2026-11-07: "words with friends dictionary should be the rule". ENABLE (the list Words With Friends grew from) for 3+ letters,
  // its full 2-letter list plus the Words With Friends additions. Slurs never count. (Replaces the "everyday short words" filter.)
  var TWO_LETTER = ("aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by de do ed ef eh el em en er es et ew ex fa go ha he hi hm ho " +
    "id if in is it jo ka la li lo ma me mi mm mo mu my na ne no nu od oe of oh ok om on op or os ow ox oy pa pe pi qi re sh si so ta ti to " +
    "uh um un up us ut we wo xi xu ya ye yo za").split(" ");
  var NEVER = ("fag fags gyp gyps yid yids wog wogs wop wops lez goy goys").split(" ");
  function loadDictionary(wordString, commonString) {
    dict = new Set(); byKey = new Map();
    wordString.split(" ").filter(function (w) { return w.length > 2; }).concat(TWO_LETTER).forEach(function (w) {
      if (!w || dict.has(w) || NEVER.indexOf(w) >= 0) return;
      dict.add(w);
      var k = sortKey(w), arr = byKey.get(k);
      if (arr) arr.push(w); else byKey.set(k, [w]);
    });
    commonRank = new Map();
    (commonString || "").split(" ").forEach(function (w, i) { if (w) commonRank.set(w, i); });
  }
  function isWord(w, minLen) { return w.length >= (minLen || CONFIG.minWordLen) && dict.has(w); }

  // Visit every sorted key spellable from `letters` (which may contain "*" wilds).
  // Uses up to one wild per subset (plus all two-wild pairs on their own) to keep it fast.
  function eachKey(letters, minLen, fn) {
    var base = letters.filter(function (l) { return l !== "*"; });
    var wilds = letters.length - base.length;
    var n = base.length, seen = new Set();
    function visit(arr) {
      if (arr.length < minLen) return false;
      var k = arr.slice().sort().join("");
      if (seen.has(k)) return false;
      seen.add(k);
      return fn(k);
    }
    for (var mask = 0; mask < (1 << n); mask++) {
      var sub = [];
      for (var i = 0; i < n; i++) if (mask & (1 << i)) sub.push(base[i]);
      if (sub.length && visit(sub)) return true;
      if (wilds > 0) for (var a = 0; a < 26; a++) if (visit(sub.concat(ALPHA[a]))) return true;
    }
    if (wilds > 1) for (var x = 0; x < 26; x++) for (var y = x; y < 26; y++) if (visit([ALPHA[x], ALPHA[y]])) return true;
    return false;
  }
  function hasAnyWord(letters, minLen) {
    minLen = minLen || CONFIG.minWordLen;
    return eachKey(letters, minLen, function (k) {
      var ws = byKey.get(k);
      return !!(ws && ws.some(function (w) { return w.length >= minLen; }));
    });
  }
  function wordsFrom(letters, minLen) {
    minLen = minLen || CONFIG.minWordLen;
    var out = [];
    eachKey(letters, minLen, function (k) {
      var ws = byKey.get(k);
      if (ws) ws.forEach(function (w) { if (w.length >= minLen) out.push(w); });
      return false;
    });
    return out;
  }
  function byCommon(a, b) {
    var ra = commonRank.has(a) ? commonRank.get(a) : 1e9, rb = commonRank.has(b) ? commonRank.get(b) : 1e9;
    return ra !== rb ? ra - rb : b.length - a.length;
  }

  // ======================= RUN =======================
  function face(ch) { return { l: ch.toLowerCase(), gild: false }; }
  var OMENS = {
    gilded:   { good: true,  name: "Gilded",   desc: "Its letter is worth triple." },
    coin:     { good: true,  name: "Coin",     desc: "Use it: +2 coins." },
    mending:  { good: true,  name: "Mending",  desc: "Use it: heal 30 HP." },
    cursed:   { good: false, name: "Cursed",   desc: "Use it: you take 40 damage." },
    hollow:   { good: false, name: "Hollow",   desc: "A word using it is worth half." },
    leeching: { good: false, name: "Leeching", desc: "Use it: 5% of your HP drains to the foe." },
  };
  // d, 2026-11-07: "im not sure about forms. can we take those out" — Forms are gone. Length pays through chips instead.
  var WORD_TESTS = {   // still used by charms (Twin Tongues, Palindrome, Rebuttal)
    pair:     function (w) { return /(.)\1/.test(w); },
    bookends: function (w) { return w.length >= 3 && w[0] === w[w.length - 1]; },
  };
  // d, 2026-11-07: "the mults might be only granted if you get a charm that unlocks… so a relic… i meant the hidden ones like
  // ladder words". The old Forms return, but each one counts only once you own its relic.
  var FORMS = {
    long:     { name: "Long",     mult: 1, desc: "a word of 6+ letters",                    test: function (w) { return w.length >= 6; } },
    pair:     { name: "Pair",     mult: 2, desc: "a word with a double letter",             test: function (w) { return /(.)\1/.test(w); } },
    open:     { name: "Open",     mult: 1, desc: "a word with 3+ vowels",                   test: function (w) { return (w.match(/[aeiou]/g) || []).length >= 3; } },
    rare:     { name: "Rare",     mult: 2, desc: "a word with Q, Z, X, J or K",             test: function (w) { return /[qzxjk]/.test(w); } },
    plural:   { name: "Plural",   mult: 1, desc: "a word ending in S",                      test: function (w) { return /s$/.test(w); } },
    bookends: { name: "Bookends", mult: 2, desc: "a word starting and ending with the same letter", test: function (w) { return w.length >= 3 && w[0] === w[w.length - 1]; } },
    ladder:   { name: "Ladder",   mult: 3, desc: "2+ words in a turn, each longer than the last", turn: true },
    echo:     { name: "Echo",     mult: 2, desc: "two words in a turn that start with the same letter", turn: true },
  };
  // Playtest: relics named just "Rare" and "Long" read as labels. Each gets a name; the desc says which bonus it unlocks.
  var RELIC_NAMES = { long: "The Long Quill", pair: "Twin Bone", open: "Open Throat", rare: "Rare Ink", plural: "The Many", bookends: "Bookend Clasp", ladder: "Ladder Bone", echo: "Echo Shell" };
  Object.keys(FORMS).forEach(function (k) { var F = FORMS[k]; RELICS[k] = { name: RELIC_NAMES[k] || F.name, form: F.name, icon: RELIC_ICONS[k] || "star", price: 10, desc: F.name + " bonus: " + F.desc + " adds +" + F.mult + " Mult (once a turn)." }; });
  function formsOn(g) { return !g.trial; }
  function wordChips(g, w, faces) {   // letter values (gild, Kindling) ×10; length only matters through Forms
    var sum = 0, run = g.run;
    for (var i = 0; i < w.length; i++) { var f = faces ? faces[i] : null, v = (f && f.l === "*") ? 0 : (LETTER_VALUE[w[i]] || 0);
      if (has(run, "kindling") && /[qzxj]/.test(w[i])) v *= 2; if (f && f.gild) v *= 2; if (f && f.og) v *= CONFIG.omens.gildMult; sum += v; }
    var m = 1;
    if (has(run, "twin") && WORD_TESTS.pair(w)) m += 0.5;
    if (has(run, "palin") && WORD_TESTS.bookends(w)) m += 1;
    if (run.house === "emberhall" && w.length >= 6) m += 0.25;   // Emberhall
    m *= CONFIG.chipLen[Math.min(w.length, 9)] || 1;   // longer words multiply their letters
    return Math.round(sum * m) * CONFIG.forms.chipScale;
  }
  // words: [{word, chips, dest}] -> {chips, hitChips, breakChips, forms: [ids], mult, total}
  function turnScore(g, words) {
    var F = CONFIG.forms, got = {}, hit = 0, brk = 0, all = 0;
    var extra = g.bonusChips || 0; all += extra; hit += extra;   // Ward Echo, Counterspell, Encore
    var own = function (k) { return (g.run.relics || []).indexOf(k) >= 0; };   // a Form counts only with its relic
    words.forEach(function (x) { all += x.chips; if (x.dest === "slot") brk += x.chips; else hit += x.chips;
      for (var k in FORMS) if (!FORMS[k].turn && own(k) && FORMS[k].test(x.word)) got[k] = true; });
    if (own("ladder") && words.length >= 2 && words.every(function (x, i) { return i === 0 || x.word.length > words[i - 1].word.length; })) got.ladder = true;
    var firsts = {}; words.forEach(function (x) { firsts[x.word[0]] = (firsts[x.word[0]] || 0) + 1; }); for (var c in firsts) if (firsts[c] >= 2 && own("echo")) got.echo = true;
    var forms = Object.keys(got), mult = 1 + forms.reduce(function (a, k) { return a + FORMS[k].mult; }, 0) + (g.chain || 0) + (g.hotMult || 0);
    if (has(g.run, "longfuse")) words.forEach(function (x) { if (x.word.length >= 7) mult += 1; });
    if (has(g.run, "firebrand") && words.length) mult += 1;
    words.forEach(function (x) { if (x.red && x.dest !== "slot") mult += CONFIG.inlay.multRed; });   // a red letter in a word that hits
    mult = Math.min(mult, CONFIG.forms.multCap);   // a ceiling keeps one big turn from deciding every duel (expert-bot calibration)
    return { chips: all, hitChips: hit, breakChips: brk, forms: forms, mult: mult, total: Math.round((hit + brk * CONFIG.slots.breakShare) * mult) };
  }
  function syncTurnDamage(g) { var t = turnScore(g, g.turnWords || []); g.dmg = t.total; g.turnScoreNow = t; return t; }
  // Foe-word rules were removed (d: "no more rules to fit"). Short words defend; long words hit.
  // d: one Submit button. The word's job follows from its length: 2 letters halve and 3 letters cancel the biggest foe word
  // still coming (or the foe word the player tapped first, `pick`); 4+ letters hit.
  function autoDest(g, diceIds, pick) {
    var ds = diceIds.map(function (id) { return g.dice[id]; }); if (!ds.length || ds.some(function (d) { return !d; })) return "spark";
    var n = ds.length, word = ds.map(function (d) { return d.letter === "*" ? "e" : d.letter; }).join(""), faces = ds.map(function (d) { return d.face; });
    var live = g.intent.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return (x.r.kind === "attack" || x.r.kind === "block") && !x.r.broken && x.r.amount > 0; });
    if (n <= 3) {
      var ok = live.filter(function (x) { return n === 3 || thornReady(g) || !x.r.halved; });
      if (pick != null && ok.some(function (x) { return x.i === pick; })) return "slot:" + pick;
      ok.sort(function (a, b) { return b.r.amount - a.r.amount; }); return ok.length ? "slot:" + ok[0].i : "spark";
    }
    return "spark";   // 4+ letters always hit
  }
  function thornReady(g) { return g.run.house === "thornwick" && !g.thornUsed && !g.tutorial; }
  function slotLabel() { return ""; }
  function slotFits() { return false; }
  var INLAYS = {
    red:  { name: "Red Inlay",  feeds: "spark", desc: "Each red letter in a word: +2% Attack. Red letters side by side link for +5% more per link." },
  };
  // faces in word order -> { count: {red, blue}, links: [[i, i+1, colour]...], chains: [{colour, from, to}] }
  function inlayInfo(faces, runOpt) {
    var info = { count: {}, links: [], chains: [] }, run = null, prism = false;
    info.wire = 1;
    (faces || []).forEach(function (f, i) {
      var c = f && f.inlay; if (c) info.count[c] = (info.count[c] || 0) + 1;
      var prev = i > 0 && faces[i - 1] && faces[i - 1].inlay;
      if (c && prev && prev !== c && prism) { info.links.push([i - 1, i, "red"]); info.links.push([i - 1, i, "blue"]); return; }
      if (c && prev === c) { info.links.push([i - 1, i, c]); if (run && run.colour === c && run.to === i - 1) run.to = i; else { run = { colour: c, from: i - 1, to: i }; info.chains.push(run); } }
    });
    return info;
  }
  function setInlay(die, colour) { die.inlay = colour; die.faces.forEach(function (f) { f.inlay = colour; }); }
  function inlayMult(info, colour) {
    if (!CONFIG.inlay.enabled) return 1;
    var I = CONFIG.inlay, links = info.links.filter(function (l) { return l[2] === colour; }).length;
    return 1 + I.per * (info.count[colour] || 0) + I.chain * links * (info.wire || 1);
  }
  function makeDie(str) { return { faces: str.split("").map(face) }; }
  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  // Seeded RNG (mulberry32) so a seed always builds the same Cellars, foes and events.
  function seeded(seed) { var f = function () { f.a = (f.a + 0x6D2B79F5) >>> 0; var t = f.a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.a = seed >>> 0; return f; }   // f.a is the state, so a run can be saved
  function hashSeed(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function randomSeed() { var s = ""; for (var i = 0; i < 6; i++) s += CONFIG.seedChars[Math.floor(Math.random() * CONFIG.seedChars.length)]; return s; }
  function wpick(w, R) { var tot = 0, k; for (k in w) tot += w[k]; var x = R() * tot; for (k in w) { x -= w[k]; if (x < 0) return k; } return Object.keys(w)[0]; }

  var UNKNOWN_EVENTS = ["cache", "inkwell", "trap", "shrine", "font", "ambush"];
  function genMap(seedStr, act, run) {
    var A = CONFIG.acts[act - 1], R = seeded(hashSeed(seedStr + "#act" + act)), rows = [], N = A.rows;
    var lastFoe = {}, uses = {}, prevRow = [];   // spread foes across the act so one path rarely meets the same foe twice (playtest)
    for (var r = 0; r < N; r++) {
      var lanes = [0, 1, 2], isShop = shopRows(N).indexOf(r) >= 0;   // d: shops evenly spaced; every route passes each one
      if (isShop) lanes = [1];
      else if (r >= 2 && r <= N - 2 && R() < 0.15) lanes = R() < 0.5 ? [0, 1] : [1, 2];   // fewer narrow rows (playtest: map felt linear)
      var row = lanes.map(function (c) { return { r: r, c: c, type: isShop ? "shop" : wpick(A.rowTypes[r], R), next: [], jx: Math.round(R() * 8 - 4), jy: Math.round(R() * 8 - 4) }; });
      var must = isShop ? "shop" : A.mustHave[r];
      if (must && !row.some(function (n) { return n.type === must; })) row[Math.floor(R() * row.length)].type = must;
      if (r > 0 && row.length > 1 && row.every(function (n) { return n.type === row[0].type; })) row[Math.floor(R() * row.length)].type = row[0].type === "unknown" ? "fight" : "unknown";
      var used = [];
      row.forEach(function (n) {
        var base = n.type === "elite" ? foePool(act, eliteRole(act)) : foePool(act);
        var pool = base.filter(function (id) { return used.indexOf(id) < 0 && prevRow.indexOf(id) < 0 && lastFoe[n.c] !== id; });
        if (!pool.length) pool = base.filter(function (id) { return used.indexOf(id) < 0; });
        if (!pool.length) pool = base;
        var least = Math.min.apply(null, pool.map(function (id) { return uses[id] || 0; }));
        pool = pool.filter(function (id) { return (uses[id] || 0) === least; });
        n.foe = pool[Math.floor(R() * pool.length)]; used.push(n.foe); lastFoe[n.c] = n.foe; uses[n.foe] = (uses[n.foe] || 0) + 1;
        if (n.type === "unknown") {
          var ev = ["cache", "inkwell", "trap", "shrine", "font", "ambush"];
          n.ev = ev[Math.floor(R() * ev.length)];
        }
        n.evSeed = Math.floor(R() * 1e9);
      });
      // One optional clue room in each clue row (Suspicion in Act II, Contradiction and Proof in Act III), never on a must-have room.
      if ((A.clueRows || []).indexOf(r) >= 0) {
        var spots = row.filter(function (n) { return n.type !== must; });
        if (spots.length) spots[Math.floor(R() * spots.length)].type = "clue";
      }
      rows.push(row); prevRow = used;
    }
    var boss = A.boss === "exam" ? "exam:" + run.examiner : A.boss === "traitor" ? "traitor:" + run.traitor : A.boss;
    rows.push([{ r: N, c: 1, type: "boss", foe: boss, curse: act === 1 ? null : Object.keys(CURSES)[Math.floor(R() * Object.keys(CURSES).length)], next: [], jx: 0, jy: 0 }]);
    for (var rr = 0; rr < N; rr++) {
      var cur = rows[rr], nxt = rows[rr + 1];
      var hasC = function (c) { return nxt.some(function (n) { return n.c === c; }); };
      if (nxt.length === 1) { cur.forEach(function (n) { n.next = [nxt[0].c]; }); continue; }
      cur.forEach(function (n) { n.next = [hasC(n.c) ? n.c : hasC(n.c + 1) ? n.c + 1 : n.c - 1]; });
      cur.forEach(function (n) { [-1, 1].forEach(function (d) {
        var t = n.c + d; if (!hasC(t) || n.next.indexOf(t) >= 0 || (n.next.length >= 2 && R() > 0.8)) return;   // a second path wherever one fits (playtest: funnelled)
        n.next.push(t);   // lanes may cross (playtest: committing to a lane removed all routing choices)
      }); });
      nxt.forEach(function (m) { if (!cur.some(function (n) { return n.next.indexOf(m.c) >= 0; }))
        cur.reduce(function (a, b) { return Math.abs(b.c - m.c) < Math.abs(a.c - m.c) ? b : a; }).next.push(m.c); });
      cur.forEach(function (n) { n.next.sort(); });
    }
    // Forks offer different rooms: two exits of the same non-fight type get one changed (playtest: forks felt fake).
    var R4 = seeded(hashSeed(seedStr + "#forks" + act)), ALT = ["fight", "fight", "unknown", "elite", "rest"];
    for (var fr2 = 0; fr2 < N - 1; fr2++) rows[fr2].forEach(function (n) {
      if (n.next.length < 2) return;
      var ex = n.next.map(function (c) { return rows[fr2 + 1].filter(function (m) { return m.c === c; })[0]; });
      if (ex[0].type === ex[1].type && A.mustHave[fr2 + 1] !== ex[1].type && ex[1].type !== "shop" && ex[1].type !== "clue") {
        var rowHasShop = rows[fr2 + 1].some(function (m) { return m.type === "shop"; });
        var opts = ALT.filter(function (t) { return t !== ex[0].type && (t !== "elite" || fr2 + 1 >= 3) && (t !== "rest" || fr2 + 1 >= 4) && (t !== "shop" || !rowHasShop); });
        ex[1].type = opts[Math.floor(R4() * opts.length)];
      }
    });
    // No row is all shops, and the middle of the act offers a rest (playtest: "a whole row was shops", HP drifted with no rest).
    rows.forEach(function (row, ri) { if (ri < N - 1 && row.length > 1 && row.every(function (m) { return m.type === "shop"; })) row[0].type = "fight"; });
    var MR = Math.round(N / 2);   // a rest in the middle of the act
    if (rows[MR] && !rows[MR].some(function (m) { return m.type === "rest"; }) && rows[MR].length > 1) { var rc = rows[MR].filter(function (m) { return m.type !== "shop" && m.type !== "clue" && A.mustHave[MR] !== m.type; }); if (rc.length) rc[rc.length - 1].type = "rest"; }
    // (The "every route passes a shop" pass was removed after round 7: it turned row-2 duels into shops. The row before the boss offers a shop and a rest instead.)
    var pre = rows[N - 1]; pre.forEach(function (x) { if (x.type === "shop") x.type = "fight"; });
    if (!pre.some(function (x) { return x.type === "rest"; })) pre[pre.length - 1].type = "rest";
    rows.forEach(function (row, ri) { if (shopRows(N).indexOf(ri) < 0) row.forEach(function (x) { if (x.type === "shop") x.type = ri >= 3 ? "unknown" : "fight"; }); });   // shops only on the shop rows
    // Any room retyped to "?" after creation needs an event (round 9 found a crash: 711 of 2,324 "?" rooms had none).
    rows.forEach(function (row) { row.forEach(function (n) { if (n.type === "unknown" && !n.ev) n.ev = UNKNOWN_EVENTS[n.evSeed % UNKNOWN_EVENTS.length]; }); });
    // Re-deal foes along the paths: a foe never appears twice on any one route through the act when the pool allows (playtest).
    var R2 = seeded(hashSeed(seedStr + "#foes" + act)), anc = {}, deal = {};
    for (var fr = 0; fr < N; fr++) {
      var rowUsed = [];
      rows[fr].forEach(function (n) {
        var key = n.r + ":" + n.c, seen = anc[key] || [];
        var base = n.type === "elite" ? foePool(act, eliteRole(act)) : foePool(act);
        var pool = base.filter(function (id) { return seen.indexOf(id) < 0 && rowUsed.indexOf(id) < 0; });
        if (!pool.length) pool = base.filter(function (id) { return seen.indexOf(id) < 0; });
        if (!pool.length) pool = base;
        var least = Math.min.apply(null, pool.map(function (id) { return deal[id] || 0; }));
        pool = pool.filter(function (id) { return (deal[id] || 0) === least; });
        n.foe = pool[Math.floor(R2() * pool.length)]; rowUsed.push(n.foe); deal[n.foe] = (deal[n.foe] || 0) + 1;
        var mine = (n.type === "fight" || n.type === "elite" || (n.type === "unknown" && n.ev === "ambush")) ? seen.concat([n.foe]) : seen;
        n.next.forEach(function (c) { var k2 = (fr + 1) + ":" + c; anc[k2] = (anc[k2] || []).concat(mine.filter(function (id) { return (anc[k2] || []).indexOf(id) < 0; })); });
      });
    }
    return { seed: seedStr, act: act, rows: rows };
  }

  // ======================= RUN =======================
  function actCfg(run) { return CONFIG.acts[run.act - 1]; }
  function foePool(act, role) { return Object.keys(CONFIG.foes).filter(function (id) { var f = CONFIG.foes[id]; return f.act === act && (role ? f.role === role : (f.role === "student" || f.role === "villain")); }); }
  function eliteRole(act) { return act === 1 ? "prefect" : "elite"; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---- leaderboard (d: "needs to be a leaderboard") ----
  // Score = damage dealt + 250 per duel won + 1000 per act cleared + an ending bonus (Sealed 3000, Woken 2000),
  // + 25 per letter of your longest word. Normal pays x1.5.
  function runScore(run) {
    var st = run.stats || { dealt: 0, longest: "" }, won = run.state === "won";
    var acts = won ? CONFIG.acts.length : Math.max(0, (run.act || 1) - 1);
    var s = st.dealt + 250 * (run.fights || 0) + 1000 * acts + (won ? (run.woken ? 2000 : 3000) : 0) + 25 * (st.longest || "").length;
    var D = CONFIG.difficulties[run.difficulty] || {};
    return Math.round(s * (D.score || (run.difficulty === "normal" ? 1.5 : 1)) * (1 + 0.1 * ((run.year || 1) - 1)));
  }
  function leaderboardEntry(run) {
    var won = run.state === "won", A = CONFIG.acts[(run.act || 1) - 1];
    return { score: runScore(run), seed: run.seed, house: run.house, difficulty: run.difficulty,
      result: won ? (run.woken ? "Woken" : "Sealed") : A.name + ", row " + (run.at ? run.at.r + 1 : 1),
      longest: ((run.stats || {}).longest || "").toUpperCase(), fights: run.fights || 0, traitor: run.traitor, year: run.year || 1 };
  }
  // Insert into a sorted top-N list; returns { board, rank } (rank 0-based, -1 if it didn't make it).
  function addToBoard(board, entry, n) {
    var b = (board || []).slice(); b.push(entry); b.sort(function (x, y) { return y.score - x.score; });
    b = b.slice(0, n || 10); return { board: b, rank: b.indexOf(entry) };
  }

  // A new run. The seed decides the traitor and the examiner (always two different professors).
  function newRun(seedStr, house, difficulty, opts) {
    opts = opts || {};
    difficulty = CONFIG.difficulties[difficulty] ? difficulty : "normal";
    seedStr = (seedStr || randomSeed()).toUpperCase();
    var S = seeded(hashSeed(seedStr + "#story"));
    var profs = Object.keys(CONFIG.professors);
    var traitor = profs[Math.floor(S() * profs.length)];
    var others = profs.filter(function (p) { return p !== traitor; });
    var run = {
      seed: seedStr, rng: seeded(hashSeed(seedStr + "#play")), act: 1, difficulty: difficulty, strikes: CONFIG.difficulties[difficulty].strikes, attempt: 0,
      traitor: traitor, examiner: others[Math.floor(S() * others.length)], cluesFound: 0,
      house: null, map: null, at: null, path: [],
      coins: CONFIG.startCoins, hp: CONFIG.playerHp, maxHp: CONFIG.playerHp,
      charms: [], relics: [], sigils: [], upgrades: {}, dice: CONFIG.DICE.map(function (f) { var d = makeDie(f); d.eighth = true; return d; }), lore: 0, woken: false, stats: { dealt: 0, longest: "", words: 0 },
      rewards: [], reward: null,                 // queued reward picks after a fight: {kind, floor}
      curse: null, state: "house",               // house | map | fight | trial | quiz | shop | rest | event | reward | retry | actEnd | won | lost
      game: null, shop: null, event: null, history: [], fights: 0, snapshot: null,
      year: Math.max(1, opts.year || 1), world: WORLDS[opts.world] ? opts.world : null, perks: opts.perks || {}, mode: "slots",   // d: slot duels with Forms scoring replace the old Attack/Defense game
    };
    (function () {   // starting inlays: one red die
      var RI = seeded(hashSeed(seedStr + "#inlay")), ids = run.dice.map(function (d, i) { return i; });
      for (var k = ids.length - 1; k > 0; k--) { var j = Math.floor(RI() * (k + 1)), t = ids[k]; ids[k] = ids[j]; ids[j] = t; }
      if (!CONFIG.inlay.enabled) return;
      var n = 0; for (var a = 0; a < CONFIG.inlay.startRed; a++) setInlay(run.dice[ids[n++]], "red");
    })();
    if (run.perks.headStart) run.coins += 10;
    if (run.perks.sigilPouch) freeSigil(run);
    if (run.world === "voice") freeSigil(run);
    run.map = genMap(seedStr, 1, run);
    if (house) setHouse(run, house);
    return run;
  }
  function setHouse(run, house) {
    run.house = house;
    if (house === "inkwright" && run.sigils.length < CONFIG.maxSigils) run.sigils.push("ink");
    run.state = "map";
  }
  function inHouse(run, h) { return run.house === h; }
  function startNextAct(run) {
    run.act++; run.map = genMap(run.seed, run.act, run); run.at = null; run.path = [];
    var h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * CONFIG.actHeal)); run.hp += h;
    if (inHouse(run, "inkwright") && run.sigils.length < CONFIG.maxSigils && run.sigils.indexOf("ink") < 0) run.sigils.push("ink");
    if (run.world === "voice") freeSigil(run);
    run.state = "map";
    return h;
  }
  function has(run, charm) { return run.charms.indexOf(charm) >= 0 || (run.relics || []).indexOf(charm) >= 0; }
  function maxCharms(run) { return CONFIG.maxCharms + ((run.perks || {}).fourthSlot ? 1 : 0); }

  // ---- meta progression (d: "build it all") ----
  // Year N: each finished year adds a modifier (ascension). Your last ending sets a world twist. Echoes buy perks.
  var WORLDS = {
    quiet:    { name: "Quiet Year",          desc: "Sealed, bones given up. Foes are a notch tougher." },
    thin:     { name: "Thin Lacquer",        desc: "Sealed, bones kept. Once per duel your dice whisper a long word you can spell." },
    stirring: { name: "Stirring Bones",      desc: "Woken, bones given up. Stirring Bones turn up as rewards: heavy letters and a wild face." },
    voice:    { name: "It Knows Your Voice", desc: "Woken, bones kept. A free sigil each act, but every foe enrages a round sooner." },
  };
  function worldFor(ending, bones) {
    if (!ending) return null;
    return ending === "woken" ? (bones === "keep" ? "voice" : "stirring") : (bones === "keep" ? "thin" : "quiet");
  }
  var YEAR_MODS = [   // cumulative from Year 2 on
    { year: 2, desc: "Foes have 8% more HP per Year past the first." },
    { year: 3, desc: "Push clocks run 2 seconds shorter." },
    { year: 4, desc: "Shop prices +25%." },
    { year: 5, desc: "Elites hit 10% harder." },
  ];
  function yearMods(run) {
    var y = run.year || 1;
    return { hp: 1 + 0.08 * (y - 1), clock: y >= 3 ? 2 : 0, shop: y >= 4 ? 1.25 : 1, eliteAtk: y >= 5 ? 1.1 : 1 };
  }
  function freeSigil(run) { if (run.sigils.length < CONFIG.maxSigils) run.sigils.push(pick(Object.keys(SIGILS), run.rng)); }
  function upg(run, id) { return run.upgrades[id] || 0; }
  function mapNode(run, r, c) { var row = run.map.rows[r]; return row && row.find(function (n) { return n.c === c; }); }
  function reachable(run) {
    if (!run.at) return run.map.rows[0].slice();
    var n = mapNode(run, run.at.r, run.at.c);
    return n.next.map(function (c) { return mapNode(run, n.r + 1, c); });
  }
  // Foe ids: a key of CONFIG.foes, or "exam:<prof>" / "traitor:<prof>".
  function foeInfo(id) {
    var m = /^(exam|traitor):(.+)$/.exec(id);
    if (!m) return CONFIG.foes[id];
    var P = CONFIG.professors[m[2]], st = CONFIG[m[1]];
    return { name: P.name, act: m[1] === "exam" ? 1 : 3, role: "boss", boss: true, art: P.art, house: P.house, prof: m[2], mode: m[1],
      hp: Math.round(st.hp * (m[1] === "traitor" ? (P.traitorHp || 1) : 1) / 10) * 10, atk: st.atk, turns: st.turns,
      trait: m[1] === "traitor" ? P.trait : null, spells: P.spells,
      quip: m[1] === "exam" ? "End-of-term examination. Show me what you've learned." : "Did you really think it was the Warden?" };
  }
  function roomFoe(run, n) {
    var base = foeInfo(n.foe), def = clone(base);
    def.id = n.foe;
    if (def.mode === "traitor") {   // each clue strips one advantage, never HP (Lore Bible: Clue trails)
      var cf = run.cluesFound || 0;
      if (cf >= 1) def.trait = null;
      if (cf >= 2) def.noEnrage = true;
      if (cf >= 3) def.named = true;
      def.chair = true;             // the Silent Chair: All Speak here completes the Eighth's 49
    }
    var first = !def.boss && (run.act || 1) === 1 && n.r === 0;
    if (first) def.firstDuel = true;
    var rt = def.boss ? 1 : Math.min(1, n.r / Math.max(1, CONFIG.acts[(run.act || 1) - 1].rows - 1)), rmp = function (a) { return def.boss ? 1 : a[0] + (a[1] - a[0]) * rt; };
    var scale = rmp(CONFIG.ramp.hp) * CONFIG.foeHpScale * (n.type === "elite" || def.boss ? 1 : (CONFIG.roleHp[def.role] || 1));
    var am = (run.mode === "slots" ? CONFIG.slots.foeHp : 1) * (CONFIG.actScale.hp[(run.act || 1) - 1] || 1);
    if (def.boss) { def.hp = Math.round(def.hp * CONFIG.boss.hp); def.atk = Math.round(def.atk * CONFIG.boss.atk); }   // bosses rise a little more gently; cap 3.0 (playtest: elites and bosses died in one cast)
    def.atk = Math.round(def.atk * rmp(CONFIG.ramp.atk) * CONFIG.foeAtkScale * (CONFIG.actScale.atk[(run.act || 1) - 1] || 1) * ((CONFIG.difficulties[run.difficulty] || {}).foeAtk || 1) * (am > 1 ? 1 + (am - 1) / 2 : 1));
    if (n.type === "elite") { scale *= CONFIG.elite.hp; def.atk = Math.round(def.atk * CONFIG.elite.atk); def.elite = true; }
    var YM = yearMods(run);
    if (def.elite) def.atk = Math.round(def.atk * YM.eliteAtk);
    def.hp = Math.round(def.hp * scale * am * ((CONFIG.difficulties[run.difficulty] || {}).foeHp || 1) * YM.hp * (run.world === "quiet" ? 1.05 : 1) / 10) * 10;
    if (run.world === "voice") def.turns = Math.max(2, def.turns - 1);
    if (def.trait === "hasty") { def.turns = Math.max(2, def.turns - 1); def.atk = Math.round(def.atk * 1.2); }
    if (def.trait === "patient") { def.turns += 1; def.hp = Math.round(def.hp * 1.25 / 10) * 10; }
    return def;
  }
  // Snapshot for three strikes: a retry restores the room-entry loadout, consumables and HP.
  function takeSnapshot(run) {
    run.snapshot = clone({ hp: run.hp, coins: run.coins, charms: run.charms, sigils: run.sigils, upgrades: run.upgrades, dice: run.dice, lore: run.lore, rewards: run.rewards, cluesFound: run.cluesFound, woken: !!run.woken });
  }
  // ---- save / resume (d: "we need a save system") ----
  // Saved at every safe point. A duel, trial or quiz in progress isn't saved mid-turn: resuming restarts that room
  // from its entry snapshot with the same dice (same attempt), so quitting never dodges a loss or rerolls a fight.
  var SAVE_VERSION = 1;
  function saveRun(run) {
    var o = {}; for (var k in run) if (k !== "game" && k !== "rng" && k !== "lastNode") o[k] = run[k];
    o.rngState = run.rng.a; o.v = SAVE_VERSION;
    var g = run.game;   // d: "can we save and quit mid duel?" A duel saves exactly where it is (not trials, quizzes or the practice duel)
    if (g && run.state === "fight" && !g.trial && !g.tutorial && g.phase === "spell") {
      var gs = {}; for (var gk in g) if (gk !== "run" && gk !== "rng") gs[gk] = g[gk];
      gs.rngState = g.rng.a; gs.sharedRng = g.rng === run.rng; o.gameSave = gs;
    }
    return JSON.stringify(o);
  }
  var ROOM_STATES = { fight: 1, trial: 1, quiz: 1, retry: 1 };
  function loadRun(str) {
    var o; try { o = JSON.parse(str); } catch (e) { return null; }
    if (!o || o.v !== SAVE_VERSION || !o.map || !o.house || o.state === "won" || o.state === "lost") return null;
    var run = o; run.rng = seeded(0); run.rng.a = o.rngState >>> 0; delete run.rngState; delete run.v;
    run.game = null; run.lastNode = run.at ? mapNode(run, run.at.r, run.at.c) : null;
    (run.dice || []).forEach(function (d) { if (d.inlay === "blue") { d.inlay = null; d.faces.forEach(function (f) { f.inlay = null; }); } });   // blue dice were removed
    var strip = function (r) { if (!r) return; r.charms = (r.charms || []).filter(function (c) { return CHARMS[c]; }); r.relics = (r.relics || []).filter(function (c) { return RELICS[c]; }); r.sigils = (r.sigils || []).filter(function (c) { return SIGILS[c]; }); r.upgrades = {}; };
    strip(run); strip(run.snapshot); if (run.reward) run.reward = null;   // the old rewards were removed (2026-11-06)
    var res = { ok: true, type: run.state };
    if (run.state === "fight" && o.gameSave) {   // resume the duel mid-round
      var gs = o.gameSave; delete run.gameSave;
      var gr = seeded(0); gr.a = gs.rngState >>> 0; var shared = gs.sharedRng; delete gs.rngState; delete gs.sharedRng;
      gs.run = run; gs.rng = shared ? run.rng : gr; gs.armed = null;
      (gs.dice || []).forEach(function (d) {   // JSON copied the faces: point each die back at its own face object
        var fs = run.dice[d.id] && run.dice[d.id].faces; if (!fs || !d.face) return;
        var m = fs.filter(function (f) { return f.l === d.face.l && !!f.gild === !!d.face.gild; })[0] || fs.filter(function (f) { return f.l === d.face.l; })[0];
        if (m) d.face = m;
      });
      if (gs.pushPending) { gs.pushPending = false; gs.clockLevel = null; }   // the clock doesn't survive a quit; the new dice stay
      run.game = gs;
      if (gs.bustPending) resolveBust(gs);
      res.type = run.lastNode && run.lastNode.type === "unknown" ? "fight" : (run.lastNode ? run.lastNode.type : "fight"); res.node = run.lastNode; res.resumed = true;
      return { run: run, res: res };
    }
    delete run.gameSave;
    if (ROOM_STATES[run.state] && run.lastNode && run.snapshot) {
      var n = run.lastNode;
      if (run.state === "retry") { retryRoom(run); res.type = n.type === "unknown" ? "fight" : n.type; res.node = n; res.restarted = true; return { run: run, res: res }; }
      var snap = clone(run.snapshot); for (var k in snap) run[k] = snap[k];   // back to the room's entry state, no retry heal
      if (run.state === "trial") { startTrial(run, n); res.type = "trial"; }
      else if (run.state === "quiz") { startQuiz(run, n); res.type = "quiz"; }
      else { startFight(run, n); res.type = n.type === "unknown" ? "fight" : n.type; }
      res.node = n; res.restarted = true;
    } else if (ROOM_STATES[run.state]) { run.state = "map"; res.type = "map"; }
    return { run: run, res: res };
  }
  function saveSummary(str) {
    var o; try { o = JSON.parse(str); } catch (e) { return null; }
    if (!o || o.v !== SAVE_VERSION || !o.house) return null;
    return { act: o.act, row: o.at ? o.at.r + 1 : 0, house: o.house, hp: o.hp, maxHp: o.maxHp, coins: o.coins, seed: o.seed, year: o.year, difficulty: o.difficulty };
  }
  function restoreSnapshot(run) {
    var s = clone(run.snapshot); for (var k in s) run[k] = s[k];
    run.hp = Math.max(run.hp, Math.round(run.maxHp * CONFIG.retryHpFloor));
  }
  function enterNode(run, n) {
    if (reachable(run).indexOf(n) < 0) return { ok: false };
    run.at = { r: n.r, c: n.c }; run.path.push([n.r, n.c]); run.lastNode = n; run.attempt = 0;
    takeSnapshot(run);
    if (n.type === "fight" || n.type === "elite" || n.type === "boss") { startFight(run, n); return { ok: true, type: n.type, node: n }; }
    if (n.type === "trial") { startTrial(run, n); return { ok: true, type: "trial", node: n }; }
    if (n.type === "quiz") { startQuiz(run, n); return { ok: true, type: "quiz", node: n }; }
    if (n.type === "shop") { openShop(run); return { ok: true, type: "shop", node: n }; }
    if (n.type === "rest") { run.state = "rest"; run.rest = { letters: pickN(CARVE_LETTERS, 3, seeded(n.evSeed)) }; return { ok: true, type: "rest", node: n }; }
    if (n.type === "unknown" && !n.ev) n.ev = UNKNOWN_EVENTS[(n.evSeed || 0) % UNKNOWN_EVENTS.length];   // saves made before the fix
    var R = seeded(n.evSeed), ev = n.type === "clue" ? "clue" : n.ev, res = { ok: true, type: "unknown", event: ev, node: n };
    if (ev === "cache") { var c = 4 + Math.floor(R() * 5); run.coins += c; res.text = "+" + c + " coins."; }
    else if (ev === "inkwell") { var ic = 3 + Math.floor(R() * 3); run.coins += ic; res.text = "+" + ic + " coins tucked in an old inkwell."; }
    else if (ev === "trap") { var d = 60 + Math.floor(R() * 60); run.hp = Math.max(1, run.hp - d); res.text = "−" + d + " HP."; }
    else if (ev === "shrine") { if (run.sigils.length < CONFIG.maxSigils) { var sg = pick(Object.keys(SIGILS), R); run.sigils.push(sg); res.text = "A " + SIGILS[sg].name + " sigil: " + SIGILS[sg].desc; } else { run.coins += 4; res.text = "Your sigil tray is full: +4 coins instead."; } }
    else if (ev === "font") { var h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.15)); run.hp += h; res.text = "+" + h + " HP."; }
    else if (ev === "clue") {
      res.clue = Math.min(run.cluesFound, 2); res.traitor = run.traitor;
      if (run.cluesFound < 3) { run.cluesFound++; res.text = ["The traitor will fight without their edge (no trait).", "The traitor will fight without time on their side (no enrage).", "You can name the traitor first (they lose their opening word)."][res.clue]; }
      else { run.coins += 3; res.text = "+3 coins."; }
    }
    else if (ev === "ambush") { res.text = CONFIG.foes[n.foe].name + " steps out of the dark."; res.fight = true; startFight(run, n); return res; }
    run.state = "event"; run.event = res;
    return res;
  }
  function pickN(arr, k, R) { var a = arr.slice(), out = []; while (out.length < k && a.length) out.push(a.splice(Math.floor(R() * a.length), 1)[0]); return out; }
  function skipRoom(run) { run.game = null; run.quiz = null; run.history.push({ act: run.act, skipped: run.state }); leaveRoom(run); }   // d: the quiz and Speed Trial can be skipped
  function leaveRoom(run) { run.state = run.rewards.length ? "reward" : "map"; run.event = null; run.rest = null; run.shop = null; }
  // Feast at a rest: spend coins for a bigger heal (playtest: coins piled up with nothing to buy at a rest).
  function restFeast(run) { if (run.coins < CONFIG.feastCost) return 0; run.coins -= CONFIG.feastCost; var h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * (CONFIG.restHeal + CONFIG.feastExtra))); run.hp += h; leaveRoom(run); return h; }
  function restSteel(run) { var a = CONFIG.vitality.steel; run.maxHp += a; run.hp += a; leaveRoom(run); return a; }
  function restHeal(run) { var h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * CONFIG.restHeal)); run.hp += h; leaveRoom(run); return h; }
  function restCarve(run, letter, dieIndex, faceIndex) {
    var f = run.dice[dieIndex] && run.dice[dieIndex].faces[faceIndex]; if (!f) return false;
    f.l = letter; f.gild = false; leaveRoom(run); return true;
  }
  // Lore: every lorePerCache earns a bonus cache (a reward pick). Returns true if a cache was earned.
  function addLore(run, n) {   // d: no Lore system (2026-11-06). Kept as a no-op so old saves and callers don't break.
    return false;
    run.lore += n; var got = false;
    while (run.lore >= CONFIG.lorePerCache) { run.lore -= CONFIG.lorePerCache; run.rewards.push({ kind: "cache", floor: null }); got = true; }
    return got;
  }
  function startFight(run, n) {
    var def = roomFoe(run, n);
    run.curse = n.type === "boss" ? n.curse : null;
    var base = n.evSeed || hashSeed(run.seed + n.r + ":" + n.c);
    run.game = newFight(run, def, seeded(base + (run.attempt || 0) * 7919));   // each retry rolls fresh dice (d: should feel like a fresh roll)
    run.game.room = n.type === "unknown" ? "fight" : n.type;
    run.state = "fight";
    return run.game;
  }
  function retryRoom(run) {
    restoreSnapshot(run);
    run.attempt = (run.attempt || 0) + 1;      // fresh dice; the foe's words stay the same
    startFight(run, run.lastNode);
    return run.game;
  }
  // Call after a duel ends (phase "won" or "dead").
  // d, 2026-11-07: adaptive difficulty removed. Foes are the same for everyone on a difficulty.
  function adaptMult() { return 1; }
  function finishFight(run) {
    var g = run.game;
    run.history.push({ act: run.act, row: run.at ? run.at.r + 1 : 0, enemy: g.enemy.id, won: g.phase === "won", taken: g.dmgTaken, rounds: g.round });
    if (g.phase !== "won") {
      run.strikes--;
      if (run.strikes > 0) { run.state = "retry"; return { won: false, retry: true, strikes: run.strikes }; }
      run.state = "lost"; return { won: false };
    }
    run.fights++;
    var reward = { base: CONFIG.coinsWin, elite: g.enemy.boss ? CONFIG.coinsBoss : g.enemy.elite ? CONFIG.coinsElite : 0,
      ledger: has(run, "ledger") ? Math.min(10, Math.floor((g.overkill || 0) / (10 * CONFIG.forms.chipScale))) : 0,   // Overkill Ledger
      rep: 0 };
    reward.total = reward.base + reward.elite + reward.ledger + reward.rep;
    run.coins += reward.total;
    var heal = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * (run.house === "hollowmere" ? CONFIG.hollowmereHeal : CONFIG.healAfterFight))); run.hp += heal; reward.heal = heal;
    // d, 2026-11-07: "give rewards after every duel" (each pick always has a Carve option, which crowds out other rewards)
    run.duelWins = (run.duelWins || 0) + (g.enemy.boss || g.enemy.elite ? 0 : 1);
    run.rewards.unshift({ kind: "spoils", floor: g.enemy.boss ? "rare" : g.enemy.elite ? "uncommon" : null });
    reward.lore = g.loreEarned;
    if (g.enemy.boss) {
      if (run.act >= CONFIG.acts.length) { run.state = "won"; return { won: true, reward: reward, runWon: true, ending: run.woken ? "woken" : "sealed" }; }
      run.state = "actEnd"; return { won: true, reward: reward, actEnd: run.act };
    }
    run.state = "reward";
    return { won: true, reward: reward };
  }

  // ---- Speed Trial: no foe. Spell as much as you can before the clock runs out (the UI keeps time). ----
  function startTrial(run, n) {
    var g = newFight(run, { id: "trial", name: "Speed Trial", hp: 1e9, atk: 0, turns: 99, spells: [] }, seeded((n && n.evSeed) || 7));
    g.trial = true; g.trialScore = 0; g.trialWords = 0; g.intent = [];
    run.game = g; run.state = "trial";
    return g;
  }
  function trialRoll(g) {
    g.dice.forEach(function (d) { if (d.state !== "off") d.state = "pool"; });
    for (var k = 0; k < 8; k++) { poolDice(g).forEach(function (d) { rollOne(g, d); }); if (legalWords(g).length) break; }
    g.wordsSinceRoll = 0; g.scoredSinceRoll = 0; g.hot = false; g.phase = "spell";
  }
  function finishTrial(run) {
    var g = run.game, got = [];
    var bestPick = null;   // d: no back-to-back rewards, so one pick at most
    CONFIG.trial.rewards.forEach(function (rw) {
      if (g.trialScore < rw.at) return;
      if (rw.coins) { run.coins += rw.coins; got.push(rw.coins + " coins"); }
      if (rw.reward) bestPick = rw.reward;
    });
    if (bestPick) { run.rewards.push({ kind: "spoils", floor: bestPick }); got.push("an " + RARITY[bestPick].name + "-or-better reward"); }
    run.history.push({ act: run.act, trial: g.trialScore });
    leaveRoom(run);
    return { score: g.trialScore, words: g.trialWords, rewards: got };
  }
  // ---- Vocabulary Quiz (untimed) ----
  var VOCAB = [];
  function loadVocab(list) { VOCAB = list || []; }
  // Quiz word tiers (1 everyday-ish, 2 bookish, 3 rare), sorted by hand.
  var QUIZ_TIER1 = "luminous candid melancholy ominous placid resilient tenacious vex keen lament nimble oblivious quaint solace uncanny vigilant wane abyss cryptic elusive feral haughty kindle nocturnal serene whimsical zenith forlorn jovial labyrinth oracle sinister tome yearn aloof bewilder conjure omen spectral nemesis lucid ire hapless deft eloquent fickle mirth".split(" ");
  var QUIZ_TIER3 = "laconic garrulous quixotic sardonic brusque taciturn blithe dour juxtapose languid alacrity nascent knell rancour veracity dirge effigy tryst umbrage misnomer petulant pernicious inscrutable mercurial usurp gossamer epitaph insidious".split(" ");
  function quizTier(w) { return QUIZ_TIER1.indexOf(w) >= 0 ? 1 : QUIZ_TIER3.indexOf(w) >= 0 ? 3 : 2; }
  function quizRules(run) { return CONFIG.quiz.byDifficulty[run.difficulty] || CONFIG.quiz.byDifficulty.normal; }
  function startQuiz(run, n) {
    var R = seeded(n.evSeed + 77), Q = CONFIG.quiz, D = quizRules(run), qs = [];
    var pool = VOCAB.filter(function (v) { return D.tiers.indexOf(quizTier(v[0])) >= 0; });
    for (var i = 0; i < Q.questions && pool.length >= 1; i++) {
      var ans = pool.splice(Math.floor(R() * pool.length), 1)[0], opts = [ans[0]], others = VOCAB.filter(function (v) { return v[0] !== ans[0]; });
      while (opts.length < D.choices) { var w = others[Math.floor(R() * others.length)][0]; if (opts.indexOf(w) < 0) opts.push(w); }
      for (var k = opts.length - 1; k > 0; k--) { var j = Math.floor(R() * (k + 1)), t = opts[k]; opts[k] = opts[j]; opts[j] = t; }
      qs.push({ def: ans[1], answer: ans[0], options: opts, picked: null });
    }
    run.quiz = { qs: qs, i: 0, right: 0 }; run.state = "quiz";
    return run.quiz;
  }
  function answerQuiz(run, choice) {
    var z = run.quiz, q = z.qs[z.i]; if (!q) return null;
    q.picked = choice; var ok = choice === q.answer; if (ok) z.right++; else run.hp = Math.max(1, run.hp - quizRules(run).wrongHp);   // wrong answers sting (playtest: the quiz was free)
    z.i++;
    return { correct: ok, answer: q.answer, done: z.i >= z.qs.length };
  }
  function finishQuiz(run) {
    var z = run.quiz, got = [];
    var qc = Math.floor(z.right / 2); if (qc) { run.coins += qc; got.push("+" + qc + " coins"); }   // half a coin a right answer (playtest: the quiz was free money)
    if (z.right === z.qs.length) { run.rewards.push({ kind: "spoils", floor: "common" }); got.push("a reward for a perfect score"); }
    run.history.push({ act: run.act, quiz: z.right + "/" + z.qs.length });
    run.quiz = null; leaveRoom(run);
    return { right: z.right, of: z.qs.length, rewards: got };
  }

  // ======================= REWARDS, SHOP =======================
  var DICE_WORK = {   // the reviewed set (2026-11-06): carve, gild, add a die, red inlay, and two recovery picks
    common: [
      function (R) { var L = pick(CARVE_LETTERS, R); return { kind: "carve", letter: L, name: "Carve " + L.toUpperCase(), desc: "Change any face on any die to " + L.toUpperCase() + ".", price: 3, icon: "notch" }; },
      function () { return { kind: "vitality", amount: CONFIG.vitality.small, name: "Vitality", desc: "+" + CONFIG.vitality.small + " max HP (and heal it).", price: 8, icon: "heal" }; },
      function () { return { kind: "heal", pct: 0.3, name: "Mend", desc: "Restore 30% of your max HP.", price: 6, icon: "heal" }; },
    ],
    uncommon: [
      function () { return { kind: "gild", name: "Gild a face", desc: "One face's letter value doubles.", price: 5, icon: "star" }; },
    ],
    rare: [
      function (R) { var d = pick(CONFIG.EXTRA_DICE, R); return { kind: "adddie", faces: d, name: "Add a die", desc: "Add a new die: " + d.split("").join(" ") + ".", price: 9, icon: "blood" }; },
      function () { return { kind: "inlay", color: "red", name: INLAYS.red.name, desc: "Inlay a whole die in red: a red letter in a word that hits adds +1 Mult.", price: 7, icon: "ember" }; },
    ],
    legendary: [],
  };
  var shopping = false;   // small charms like Coin Purse are sold, not offered as rewards (playtest: junk picks)
  function patronCount(run, p) { return run.charms.filter(function (c) { return CHARMS[c] && CHARMS[c].patron === p; }).length; }
  function charmAvail(run, c) { var C = CHARMS[c]; return !has(run, c) && (!C.duo || C.duo.every(function (p) { return patronCount(run, p) > 0; })); }
  function charmOffer(run, rr, R, patrons) {
    var avail = Object.keys(CHARMS).filter(function (c) { return charmAvail(run, c) && CHARMS[c].rarity === rr && (!patrons || patrons.indexOf(CHARMS[c].patron) >= 0 || CHARMS[c].duo); });
    if (!avail.length) return null; var c = pick(avail, R);
    return { kind: "charm", id: c, name: CHARMS[c].name, desc: CHARMS[c].desc, price: CHARMS[c].price, icon: CHARMS[c].icon, patron: CHARMS[c].patron, duo: !!CHARMS[c].duo };
  }
  // kind: "charm" | "sigil" | "dice" | "any"; falls back down the rarity ladder if nothing fits. patrons narrows charms.
  function makeOffer(kind, run, rarity, patrons) {
    var R = run.rng; rarity = rarity || wpick(CONFIG.rarityWeights, R);
    if (rarity === "legendary") rarity = "rare";
    if (kind === "any") { var x = R(); if (x < CONFIG.relicChance.pick) { var rl = relicOffer(run); if (rl) return rl; } kind = x < 0.5 ? "charm" : x < 0.65 ? "sigil" : "dice"; }
    if (kind === "sigil") { var sg = pick(Object.keys(SIGILS), R); return { kind: "sigil", id: sg, name: SIGILS[sg].name, desc: SIGILS[sg].desc, price: SIGILS[sg].price, icon: SIGILS[sg].icon, rarity: "common" }; }
    for (var ri = RARITIES.indexOf(rarity); ri >= 0; ri--) {
      var rr = RARITIES[ri], o = null;
      if (kind === "charm") o = charmOffer(run, rr, R, patrons) || charmOffer(run, rr, R);
      else if (run.world === "stirring" && (rr === "rare" || rr === "uncommon") && R() < 0.5)   // the Stirring world's own die
        o = { kind: "adddie", faces: "ZQXJK*", name: "Stirring Bone", desc: "A die from the Eighth's stirring: Z Q X J K and a wild face. Heavy, strange, loud.", price: 6, icon: "skull-curse" };
      else if (DICE_WORK[rr].length) o = pick(DICE_WORK[rr], R)(R);
      if (o) { o.rarity = rr; return o; }
    }
    return makeOffer("dice", run, "common");
  }
  // An offer of exactly this rarity or better (elite floors used to fall through to common: playtest).
  function offerAtLeast(run, rarity, R, patrons) {
    for (var ri = RARITIES.indexOf(rarity); ri <= RARITIES.indexOf("rare"); ri++) {
      var kinds = R() < 0.6 ? ["charm", "dice"] : ["dice", "charm"];
      for (var k = 0; k < kinds.length; k++) {
        var rr = RARITIES[ri], o = kinds[k] === "charm" ? (charmOffer(run, rr, R, patrons) || charmOffer(run, rr, R)) : (DICE_WORK[rr].length ? pick(DICE_WORK[rr], R)(R) : null);
        if (o) { o.rarity = rr; return o; }
      }
    }
    return makeOffer("any", run, null, patrons);
  }
  function relicOffer(run) {   // d: "rare rare if they are game breakers": the bigger the Mult, the rarer the relic
    var avail = Object.keys(RELICS).filter(function (k) { return (run.relics || []).indexOf(k) < 0; });
    if (!avail.length) return null; var w = {}; avail.forEach(function (a) { w[a] = Math.max(1, 4 - FORMS[a].mult); }); var k = wpick(w, run.rng), Rl = RELICS[k];
    return { kind: "relic", id: k, name: Rl.name, desc: Rl.desc, price: Rl.price, icon: Rl.icon, rarity: "rare" };
  }
  function offerKey(o) { return o.kind + ":" + (o.id || o.name); }
  function usable(run, o) {
    if (o.kind === "charm") return run.charms.length < maxCharms(run);
    if (o.kind === "sigil") return run.sigils.length < CONFIG.maxSigils;
    if (o.kind === "removedie") return run.dice.length > CONFIG.minDice;
    if (o.kind === "adddie") return run.dice.length < CONFIG.maxDice;
    return true;
  }
  // The next queued reward pick: three choices (or 3 coins). floor = minimum rarity for at least one choice.
  function rollReward(run) {
    if (!run.rewards.length) return null;
    var rw = run.rewards[0], R = run.rng, offers = [];
    var pk = Object.keys(PATRONS), p1 = pick(pk, R), p2 = pick(pk.filter(function (p) { return p !== p1; }), R), patrons = [p1, p2];   // a pick leans on two patrons
    // d: "too many big loot boxes". The box tier is rolled once; one offer is at that tier, the others are common.
    var tier = RARITIES[Math.max(rw.floor ? RARITIES.indexOf(rw.floor) : 0, RARITIES.indexOf(wpick(CONFIG.rarityWeights, R)))];
    var rel = rw.floor === "rare" || (rw.floor === "uncommon" && R() < CONFIG.relicChance.elite) ? relicOffer(run) : null; if (rel) offers.push(rel);   // bosses always offer a relic; elites sometimes
    else if (tier !== "common") offers.push(offerAtLeast(run, tier, R, patrons));
    var last = run.lastOffers || [], guard = 0;
    while (offers.length < 3 && guard++ < 40) {
      var o = makeOffer("any", run, "common", patrons), key = offerKey(o);
      if (offers.some(function (p) { return offerKey(p) === key; })) continue;                // no duplicates in one pick
      if (guard < 25 && last.indexOf(key) >= 0) continue;                                       // and try not to repeat the last pick's options
      if (guard < 25 && o.kind === "sigil" && run.sigils.indexOf(o.id) >= 0) continue;          // or offer a sigil you already carry
      offers.push(o);
    }
    if (!offers.some(function (o) { return o.kind === "carve"; })) {   // d: every pick includes a Carve (switch a face to a new letter)
      var cv = DICE_WORK.common[0](R); cv.rarity = "common"; var ri2 = offers.length - 1; while (ri2 > 0 && offers[ri2].kind === "relic") ri2--; offers[ri2] = cv;
    }
    run.lastOffers = offers.map(offerKey);
    if (!offers.some(function (o) { return usable(run, o); })) offers[offers.length - 1] = makeOffer("dice", run, "common");
    offers.forEach(function (o) { o.price = 0; });
    run.reward = { kind: rw.kind, offers: offers, box: RARITY[tier].box, patrons: patrons };
    return run.reward;
  }
  function takeReward(run, i, dieIndex, faceIndex, replaceCharm) {
    var o = run.reward && run.reward.offers[i]; if (!o) return { ok: false };
    if (o.kind === "charm" && run.charms.length >= maxCharms(run)) {
      if (!replaceCharm) return { ok: false, needsReplace: true, error: "Charm slots full: pick one to replace." };
      run.charms.splice(run.charms.indexOf(replaceCharm), 1);
    }
    if (o.kind === "sigil" && run.sigils.length >= CONFIG.maxSigils) return { ok: false, error: "Sigil tray full." };
    var r = applyOffer(run, o, dieIndex, faceIndex);
    if (r.ok) { run.rewards.shift(); run.reward = null; if (!run.rewards.length && run.state === "reward") run.state = "map"; }
    return r;
  }
  function skipReward(run) { run.rewards.shift(); run.reward = null; run.coins += CONFIG.skipCoins; if (!run.rewards.length && run.state === "reward") run.state = "map"; }
  function rollOffers(run) { shopping = true; try { return rollOffers0(run); } finally { shopping = false; } }
  function rollOffers0(run) {
    var sg = makeOffer("sigil", run); for (var t = 0; t < 6 && run.sigils.indexOf(sg.id) >= 0; t++) sg = makeOffer("sigil", run);
    var offers = [makeOffer("charm", run), sg]; var srl = run.rng() < CONFIG.relicChance.shop ? relicOffer(run) : null; if (srl) offers.push(srl);
    while (offers.length < CONFIG.shopOffers) offers.push(makeOffer(run.rng() < 0.35 ? "charm" : "dice", run));
    return offers;
  }
  function priceUp(run, offers) { var m = yearMods(run).shop * CONFIG.shopPriceScale; if (m !== 1) offers.forEach(function (o) { if (o && o.price) o.price = Math.ceil(o.price * m); }); return offers; }
  function openShop(run) { run.state = "shop"; run.shop = { offers: priceUp(run, rollOffers(run)), rerollCost: CONFIG.rerollCost }; }
  function rerollShop(run) {
    if (run.coins < run.shop.rerollCost) return false;
    run.coins -= run.shop.rerollCost; run.shop.rerollCost++; run.shop.offers = priceUp(run, rollOffers(run)); return true;
  }
  function canBuy(run, i) {
    var o = run.shop.offers[i];
    if (!o || o.sold) return "Sold.";
    if (run.coins < o.price) return "Not enough coins.";
    if (o.kind === "charm" && run.charms.length >= maxCharms(run)) return "Charm slots full (" + maxCharms(run) + "). Sell one first.";
    if (o.kind === "sigil" && run.sigils.length >= CONFIG.maxSigils) return "Sigil tray full (" + CONFIG.maxSigils + ").";
    if (!usable(run, o)) return o.kind === "removedie" ? "You need at least " + CONFIG.minDice + " dice." : "You can't carry more dice.";
    if (o.kind === "heal" && run.hp >= run.maxHp) return "You're at full HP.";
    return null;
  }
  function needsTarget(o) { return o.kind === "carve" || o.kind === "gild" || o.kind === "inlay" || o.kind === "wild" || o.kind === "removedie" || o.kind === "echo"; }
  function needsDieOnly(o) { return o.kind === "removedie" || o.kind === "echo" || o.kind === "inlay"; }
  function buy(run, i, dieIndex, faceIndex) {
    var err = canBuy(run, i); if (err) return { ok: false, error: err };
    var o = run.shop.offers[i], r = applyOffer(run, o, dieIndex, faceIndex);
    if (r.ok) { run.coins -= o.price; o.sold = true; }
    return r;
  }
  function applyOffer(run, o, dieIndex, faceIndex) {
    if (needsTarget(o) && (dieIndex == null || !run.dice[dieIndex])) return { ok: false, needsTarget: true };
    var f = needsTarget(o) && !needsDieOnly(o) ? run.dice[dieIndex].faces[faceIndex] : null;
    if (o.kind === "charm") run.charms.push(o.id);
    else if (o.kind === "relic") (run.relics = run.relics || []).push(o.id);
    else if (o.kind === "sigil") run.sigils.push(o.id);
    else if (o.kind === "heal") run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * o.pct));
    else if (o.kind === "vitality") { run.maxHp += o.amount; run.hp += o.amount; }
    else if (o.kind === "carve") { f.l = o.letter; }
    else if (o.kind === "gild") { if (f.l === "*") return { ok: false, error: "Wild faces can't be gilded." }; if (f.gild) return { ok: false, error: "Already gilded." }; f.gild = true; }
    else if (o.kind === "inlay") { var dd = run.dice[dieIndex]; if (dd.inlay === o.color) return { ok: false, error: "That die is already " + o.color + "." }; setInlay(dd, o.color); }
    else if (o.kind === "adddie") { if (run.dice.length >= CONFIG.maxDice) return { ok: false, error: "You can't carry more dice." }; var nd = makeDie(o.faces); nd.material = { uncommon: "brass", rare: "gold", legendary: "crystal" }[o.rarity] || "bone"; run.dice.push(nd); }   // a Brass box gives a brass die (d)
    else if (o.kind === "removedie") { if (run.dice.length <= CONFIG.minDice) return { ok: false, error: "You need at least " + CONFIG.minDice + " dice." }; run.dice.splice(dieIndex, 1); }
    else if (o.kind === "echo") { if (run.dice[dieIndex].echo) return { ok: false, error: "That die already echoes." }; run.dice[dieIndex].echo = true; }
    return { ok: true };
  }
  function sellPrice(run, id) { return Math.floor(CHARMS[id].price * yearMods(run).shop * CONFIG.shopPriceScale / 4); }   // a quarter of its shop price (playtest: selling ignored the shop scale)
  function sellCharm(run, id) { var i = run.charms.indexOf(id); if (i < 0) return; run.charms.splice(i, 1); run.coins += sellPrice(run, id); }
  function leaveShop(run) { leaveRoom(run); }

  // ======================= THE DUEL =======================
  //   dice: [{id, face, letter, state, echoLeft}]  state: "pool" (unused, rolled) | "spent" | "off" (silenced this round)
  //   phase: "spell" (player turn) | "won" | "dead"
  //   intent: rows [{word, kind: attack|guard|mend|hush|tithe, amount, base, leech, thorns}]
  function newFight(run, def, rng, opts) {
    var g = { tutorial: !!(opts && opts.tutorial),
      run: run, rng: rng || run.rng, enemy: def, enemyHp: def.hp, enemyMax: def.hp, guard: 0, nextGuard: 0,
      round: 1, intent: [], dmg: 0, ward: 0, words: [], wordsSinceRoll: 0, hot: false, turnHot: false,
      wrongStreak: 0, dmgTaken: 0, frayLeft: 0, inkRerollLeft: 0,
      netUsed: false, shieldArmed: false, usedWords: [], foeWords: [], silence: [], lore: {}, loreEarned: 0, log: [], phase: "spell",
      dice: run.dice.map(function (_, i) { return { id: i, face: null, letter: "?", state: "pool", echoLeft: 0 }; }),
    };
    if (def.atk) { g.intent = makeIntent(g); addBlock(g); openingRoll(g); }
    return g;
  }
  // Rolling again more than once in a turn raises the minimum word length by 1 each time, up to 5 (playtest: with 9 dice, rolling again was free).
  function baseMinLen(g) { return g.run.curse === "long4" || g.enemy.trait === "pedant" ? 4 : g.enemy.trait === "mute" ? 3 : CONFIG.minWordLen; }
  // The first roll again in a turn is free; each one after that adds a letter.
  function lenFor(g, pushes) { var b = baseMinLen(g); if (formsOn(g)) return b; return Math.max(b, Math.min(CONFIG.pushMinLenCap, b + Math.max(0, pushes - 1))); }
  function minLen(g) { return lenFor(g, g.turnPushes || 0); }
  function nextMinLen(g) { return lenFor(g, (g.turnPushes || 0) + 1); }
  function poolDice(g) { return g.dice.filter(function (d) { return d.state === "pool"; }); }
  function poolLetters(g) { return poolDice(g).map(function (d) { return d.letter; }); }
  function activeDice(g) { return g.dice.filter(function (d) { return d.state !== "off"; }); }
  function rollOne(g, d) {
    var faces = g.run.dice[d.id].faces;
    if (g.tutorial) { var k = (d.rolls = (d.rolls || 0) + 1) - 1; d.face = faces[Math.min(k, faces.length - 1)]; }   // scripted: the n-th roll shows face n
    else d.face = faces[Math.floor(g.rng() * faces.length)];
    d.letter = d.face.l;
    d.echoLeft = g.run.dice[d.id].echo ? 1 : 0;
  }
  function legalWords(g) {
    var ws = wordsFrom(poolLetters(g), minLen(g));
    if (g.run.curse === "once") ws = ws.filter(function (w) { return g.usedWords.indexOf(w) < 0; });
    if (g.banned) ws = ws.filter(function (w) { return w.indexOf(g.banned) < 0; });
    return ws;
  }

  // ---- foes never cast the same word twice in a duel (d, 2026-11-05; the Murmurs' second rule) ----
  // Each foe casts its own signature words first, then plain, common battle words (d wanted familiar words).
  // Special rows rotate through synonyms so they never repeat either.
  var FOE_WORDS = ("STRIKE SLASH SMASH CRUSH BURN SCALD SEAR STING STAB JAB PUNCH KICK BASH BITE CLAW RAKE REND RIP TEAR " +
    "SHOVE SLAM WHIP LASH SNAP CRACK BREAK SPLIT SHRED SCRAPE GRIND GRIP CHOKE SQUEEZE TWIST WRENCH YANK HURL " +
    "THROW FLING POUND HAMMER CLUB STOMP TRAMPLE CHARGE RUSH LUNGE THRUST SWIPE CHOP HACK CLEAVE SPEAR PIERCE " +
    "DRILL BLAST BURST SHOCK JOLT ZAP FLARE FLASH SCORCH BLAZE FLAME SMOKE CHILL FREEZE FROST SLEET HAIL STORM " +
    "GUST SQUALL DROWN FLOOD SOAK SPLASH SHATTER CRUMBLE TOPPLE TRIP SNARE BIND GRAB CLUTCH SNATCH TAUNT MOCK " +
    "SCORN SNEER GROWL SNARL HOWL ROAR SHRIEK SCREAM WAIL DOOM DREAD GLOOM BLIGHT WITHER ROT RUST DECAY FESTER " +
    "POISON VENOM SHADOW SHADE GHOST HAUNT CURSE JINX HEX BANE RUIN WRECK HAVOC CHAOS FURY RAGE WRATH SPITE " +
    "GRUDGE VENGE STRIFE").split(" ");
  // Hard mode (d): foes reach for bigger words. Still familiar, nothing obscure.
  var BIG_FOE_WORDS = ("TEMPEST ONSLAUGHT PULVERIZE AVALANCHE MAELSTROM INFERNO DEVOUR ENGULF SMOLDER SHACKLE STRANGLE BLUDGEON " +
    "TORMENT SCOURGE RAVAGE PLUNDER BESIEGE CONSUME OBLITERATE ANNIHILATE DEMOLISH SHATTERING THUNDER LIGHTNING EARTHQUAKE " +
    "WHIRLWIND HURRICANE BLIZZARD EMBERS WILDFIRE NIGHTMARE BANISH EXILE ECLIPSE CRUCIBLE GAUNTLET STAMPEDE").split(" ");
  var SPECIAL_WORDS = {
    guard: ["WARD", "SHIELD", "BRACE", "GUARD", "COVER", "BARRIER", "BULWARK", "ARMOR", "FORTIFY", "SHELTER", "BLOCK", "PARRY"],
    hush:  ["HUSH", "QUIET", "MUTE", "STILL", "SILENCE", "SHUSH", "MUFFLE", "GAG", "SEAL", "CALM"],
    mend:  ["MEND", "HEAL", "KNIT", "SALVE", "CURE", "SOOTHE", "RESTORE", "STITCH", "PATCH", "RENEW"],
    tithe: ["TITHE", "TAX", "TOLL", "LEVY", "DUES", "FEE", "TRIBUTE", "FINE"],
  };
  // Next unused word: the list's words in a seeded order, then (attack only) the common pool. commit=false peeks.
  function foeWord(g, list, R, commit, fallback) {
    var fit = function (w) { return w.replace(/[^A-Za-z]/g, "").length <= 9; };   // d: foes cast 9 letters at most, like your nine dice
    list = list.filter(fit); if (fallback) fallback = fallback.filter(fit); if (!list.length && !fallback) list = ["STRIKE"];
    var used = g.foeWords || (g.foeWords = []), take = function (w) { if (commit !== false) used.push(w); return w; };
    var start = Math.floor(R() * list.length);
    for (var k = 0; k < list.length; k++) { var w = list[(start + k) % list.length]; if (used.indexOf(w) < 0) return take(w); }
    if (fallback) {
      var f0 = Math.floor(R() * fallback.length);
      for (var j = 0; j < fallback.length; j++) { var v = fallback[(f0 + j) % fallback.length]; if (used.indexOf(v) < 0) return take(v); }
    }
    return take(list[start] + "!"); // every word spent: unreachable in practice
  }
  function specialWord(g, kind, commit) { return foeWord(g, SPECIAL_WORDS[kind], seeded(hashSeed(g.run.seed + ":" + kind + ":" + (g.foeWords || []).length)), commit); }

  // ---- the foe's intent for this round: an ordered list of word-spells ----
  function foeWordPoints(w) { w = String(w).toLowerCase().replace(/[^a-z]/g, ""); var sum = 0; for (var i = 0; i < w.length; i++) sum += LETTER_VALUE[w[i]] || 0; return Math.round(sum * (CONFIG.chipLen[Math.min(w.length, 9)] || 1)); }
  function foePower(g) { return Math.max(1, Math.round(g.enemy.atk * enrageMult(g) / CONFIG.foeWordNorm)); }   // damage per letter point
  function enrageMult(g) { if (g.enemy.noEnrage) return 1; var over = g.round - g.enemy.turns; return over > 0 ? Math.min(CONFIG.enrageCap, Math.pow(CONFIG.enrageGrowth, over)) : 1; }
  function makeIntent(g) {
    if (g.tutorial) return clone(TUTORIAL.intent[g.round - 1] || TUTORIAL.intent[TUTORIAL.intent.length - 1]);
    var e = g.enemy, P = CONFIG.patterns[e.role] || CONFIG.patterns.villain, pat = P[(g.round - 1) % P.length];
    var R = seeded(hashSeed(g.run.seed + ":" + e.id + ":" + g.round + ":" + (g.run.at ? g.run.at.r + "," + g.run.at.c : "")));
    var spells = e.spells && e.spells.length ? e.spells : ["STRIKE"], em = enrageMult(g), rows = [];
    // d, 2026-11-07 (GPT playtest: "incoming damage didn't seem to follow any math"): a foe word hits like yours scores.
    // Damage = the word's letter points × the length multiplier × the foe's power. The pattern only sets how many words.
    pat.forEach(function () {
      rows.push({ word: foeWord(g, spells, R, true, (CONFIG.difficulties[g.run.difficulty] || {}).bigWords ? BIG_FOE_WORDS.concat(FOE_WORDS) : FOE_WORDS), kind: "attack", base: 0, amount: 0 });
    });
    var atkRows = rows.filter(function (r) { return r.kind === "attack"; });
    if (atkRows.length && R() < CONFIG.foeBlockChance * (atkRows.length > 1 ? 1 : 0.6)) { var br = atkRows[atkRows.length - 1]; br.kind = "block"; }   // a block word, same strength
    // d: some foes cast big words too. Elites, bosses and Act II+ villains sometimes cast one long word that hits ×bigMult:
    // a 2-letter word only halves it, so it's a job for a 3-letter cancel.
    if (!e.firstDuel && R() < (e.elite || e.boss || e.role === "villain" ? CONFIG.bigWord.chance : CONFIG.bigWord.chanceStudent)) {   // never in the first duel (playtest: EARTHQUAKE 354 there)   // d: "make the damage they can hit you with bigger sometimes"
      var bg = rows.filter(function (r) { return r.kind === "attack"; })[0];
      if (bg) { bg.big = true; var bw = foeWord(g, [], R, true, BIG_FOE_WORDS); if (bw) { if (g.foeWords) { var pi = g.foeWords.lastIndexOf(bg.word); if (pi >= 0) g.foeWords.splice(pi, 1); } bg.word = bw; } }
    }
    if (g.round % 3 === 0) { var hv = rows.find(function (r) { return r.kind === "attack"; }); if (hv) hv.heavy = true; }
    var P = foePower(g);
    rows.forEach(function (r) { if (r.kind !== "attack" && r.kind !== "block") return; r.pts = foeWordPoints(r.word); r.power = P; r.x = (r.big ? CONFIG.bigWord.mult : 1) * (r.heavy ? CONFIG.heavyMult : 1); r.base = r.amount = Math.round(r.pts * P * r.x); });   // a heavy blow every third round: block it or bleed (playtest: Defense was a trap)
    if (e.trait === "warded" && g.round % 3 === 2) rows[rows.length - 1] = { word: specialWord(g, "guard"), kind: "guard", amount: Math.floor(e.atk * CONFIG.guardMult) };
    if (e.trait === "leech") { var a = rows.find(function (r) { return r.kind === "attack"; }); if (a) a.leech = true; }
    if (e.trait === "thorns") { var b = rows.find(function (r) { return r.kind === "attack"; }); if (b) b.thorns = Math.floor(e.atk * CONFIG.thornsReflect); }
    if (g.run.curse === "silence" && g.round % 2 === 1) rows.push({ word: specialWord(g, "hush"), kind: "hush", amount: 1 });
    if (e.boss && e.trait === "leech" && g.round % 4 === 3) rows.push({ word: specialWord(g, "mend"), kind: "mend", amount: Math.floor(e.atk * 0.8) });
    if (e.named && g.round === 1 && rows.length) rows.shift();   // you named them first: they lose their opening word
    applyRowMods(g, rows);
    return rows;
  }
  function applyRowMods(g, rows) {
    var first = true;
    rows.forEach(function (r) {
      if (r.kind !== "attack") return;
      var a = r.base - (r.frayed ? CONFIG.frayAmount : 0);
      if (first && has(g.run, "thickhide")) { a = Math.floor(a / 2); r.hide = true; }   // Thick Hide: the first attack word hits for half
      first = false;
      r.amount = Math.max(0, a);
    });
  }
  function incoming(g) { return g.intent.reduce(function (s, r) { return s + (r.kind === "attack" || r.kind === "tithe" ? r.amount : 0); }, 0); }
  function thornsTotal(g) { return g.intent.reduce(function (s, r) { return s + (r.thorns || 0); }, 0); }
  // How a list of rows lands on you with `ward` protection. Returns {hpLoss, absorbed, rows:[{absorbed, hp}]}.
  function simulateRows(g, rows, ward, reflect) {
    var hp = 0, abs = 0, out = [];
    if (reflect) { var ra = Math.min(ward, reflect); ward -= ra; abs += ra; hp += reflect - ra; }
    rows.forEach(function (r) {
      if (r.kind !== "attack" && r.kind !== "tithe") { out.push({ absorbed: 0, hp: 0 }); return; }
      var a = Math.min(ward, r.amount); ward -= a; abs += a; hp += r.amount - a; out.push({ absorbed: a, hp: r.amount - a });
    });
    return { hpLoss: hp, absorbed: abs, rows: out };
  }
  // Everything the player needs before committing (GDD §5.3, §9).
  function preview(g) {
    var lethal = g.dmg > 0 && g.dmg >= g.enemyHp + g.guard;
    var reflect = g.dmg > 0 && !lethal ? thornsTotal(g) : 0;
    var cast = simulateRows(g, lethal ? [] : g.intent, g.ward, reflect);   // a killing cast takes nothing back (d)
    var fizzRows = g.intent.slice(); if (g.run.curse === "tax") fizzRows = fizzRows.concat([{ word: specialWord(g, "tithe", false), kind: "tithe", amount: CONFIG.titheDamage }]);
    var fizz = simulateRows(g, fizzRows, 0, 0);
    return { incoming: incoming(g), ward: g.ward, dmg: g.dmg, lethal: lethal, reflect: reflect, castLoss: cast.hpLoss, rows: cast.rows,
      castLossLethal: 0, fizzleLoss: fizz.hpLoss, gluttonHeal: g.enemy.trait === "glutton" ? Math.round(g.enemyMax * CONFIG.gluttonHeal) : 0,
      holdFast: g.run.sigils.indexOf("holdfast") >= 0 };
  }

  // ---- rolling ----
  function curseCount(g) { var e = g.enemy; if (g.trial) return 0; if (e.trait === "hexer") return 1; if (e.boss) return Math.min(2, Math.max(1, g.run.act || 1)) + (g.round > e.turns ? 1 : 0); return 0; }
  function dealOmens(g, onlyIds) {
    if (!CONFIG.omens.enabled) { g.omens = {}; return; }
    var O = CONFIG.omens, pool = poolDice(g).filter(function (d) { return !onlyIds || onlyIds.indexOf(d.id) >= 0; }), R = g.rng;
    g.omens = g.omens || {}; if (!onlyIds) g.omens = {};
    if (g.trial || !pool.length) return;
    var bad = ["cursed", "hollow", "leeching"], good = ["gilded", "coin", "mending"], taken = [];
    var pickDie = function () { var c = pool.filter(function (d) { return taken.indexOf(d.id) < 0; }); if (!c.length) return null; var d = c[Math.floor(R() * c.length)]; taken.push(d.id); return d; };
    if (!onlyIds) for (var b = 0; b < curseCount(g); b++) { var bd = pickDie(); if (bd) g.omens[bd.id] = bad[Math.floor(R() * bad.length)]; }
    if (R() < O.goodChance) { var gd = pickDie(); if (gd) g.omens[gd.id] = good[Math.floor(R() * good.length)]; }
  }
  // d: foes can choose to block with some of their words. A BLOCK word is as strong as the attack it replaces and soaks your
  // Attack this round (you see it before you roll).
  function addBlock(g) { var t = 0; g.intent.forEach(function (r) { if (r.kind === "block") t += r.amount; }); g.block = t; g.guard = (g.guard || 0) + t; }
  function openingRoll(g) {
    if (g.enemy.trait === "banish") g.banned = "aeiou"[Math.floor(g.rng() * 5)];
    g.dice.forEach(function (d) { d.state = (g.silence.indexOf(d.id) >= 0 || (g.hushed || []).indexOf(d.id) >= 0) ? "off" : "pool"; });
    for (var k = 0; k < 60; k++) { poolDice(g).forEach(function (d) { rollOne(g, d); }); if (legalWords(g).length) break; }
    g.wordsSinceRoll = 0; g.scoredSinceRoll = 0; g.hot = false;
    dealOmens(g);
  }

  // ---- word power (GDD §5.5) ----
  function wordPower(g, w, faces) {
    var run = g.run, sum = 0;
    for (var i = 0; i < w.length; i++) {
      var f = faces ? faces[i] : null, v = (f && f.l === "*") ? LETTER_VALUE["*"] : (LETTER_VALUE[w[i]] || 0);
      if (f && f.gild) v *= 2;
      if (f && f.og) v *= CONFIG.omens.gildMult;
      sum += v;
    }
    var p = sum * (CONFIG.lengthMult[Math.min(w.length, 9)] || 6) * CONFIG.pointsScale;
    var mult0 = 1;
    p *= mult0;
    var mult = (faces || []).some(function (f) { return f && f.l === "*"; }) ? CONFIG.wildWordMult : 1;   // a wild rescues a word but doesn't make your best one
    return p * mult;
  }
  // Speed multiplier for a word of `len` letters spelled with `frac` of the push clock left (1 = full, null = no clock).
  function speedMult(len, frac) {
    if (frac == null || !(frac > 0)) return 1;
    var S = CONFIG.speed, segsLeft = Math.ceil(Math.min(1, frac) * S.segments) - 1; // the segment you're in doesn't count
    var lf = Math.max(0, Math.min(1, (len - 2) / (S.fullAt - 2)));
    return Math.round((1 + Math.max(0, segsLeft) * S.step * lf) * 100) / 100;
  }
  // What the word adds to each charge. Returns {spark, ward, speed}. `frac` = push clock left, if this word answers a push.
  function contribution(g, w, faces, frac) {
    var sm = g.clockLevel != null ? speedMult(w.length, frac) : 1;
    var p = wordPower(g, w, faces) * sm, run = g.run;
    var inl = inlayInfo(faces, run), hollow = (faces || []).some(function (f) { return f && f.om === "hollow"; });
    var spark = p * inlayMult(inl, "red");
    var rate = upg(run, "wardup") ? 1.0 : CONFIG.wardRate;
    var ward = p * rate * inlayMult(inl, "blue");
    if (hollow) { spark *= CONFIG.omens.hollow; ward *= CONFIG.omens.hollow; }
    return { spark: Math.floor(spark), ward: Math.floor(ward), speed: sm, inlay: inl };
  }
  // Resolve a tapped sequence (wilds become the best legal letter).
  function resolveWord(g, letters, faces) {
    var ml = minLen(g);
    var ok = function (w) { return isWord(w, ml) && !(g.run.curse === "once" && g.usedWords.indexOf(w) >= 0); };
    var wildPos = []; letters.forEach(function (l, i) { if (l === "*") wildPos.push(i); });
    if (!wildPos.length) { var w = letters.join(""); return ok(w) ? w : null; }
    if (wildPos.length > 1) return null;   // one wild per word (d: "maybe wild letters are op")
    var best = null, bestP = -1;
    (function rec(k, arr) {
      if (k === wildPos.length) { var w = arr.join(""); if (ok(w)) { var p = wordPower(g, w, faces); if (p > bestP) { bestP = p; best = w; } } return; }
      for (var a = 0; a < 26; a++) { arr[wildPos[k]] = ALPHA[a]; rec(k + 1, arr); }
    })(0, letters.slice());
    return best;
  }
  // Raw value preview for the tray, shown whether or not the letters make a word (so it doesn't leak validity).
  function longestLegal(g) { var ws = legalWords(g); return ws.reduce(function (a, w) { return w.length > a.length ? w : a; }, ""); }
  function omenFaces(g, ds) { return ds.map(function (d) { var om = g.omens && g.omens[d.id], f = d.face || {}; if (!om) return f; var c = {}; for (var k in f) c[k] = f[k]; c.om = om; if (om === "gilded") c.og = true; return c; }); }
  function omenEffects(g, ids) {
    var O = CONFIG.omens, e = { coins: 0, heal: 0, hurt: 0, leech: 0, list: [] };
    ids.forEach(function (id) { var om = g.omens && g.omens[id]; if (!om) return; e.list.push(om);
      if (om === "coin") e.coins += O.coin; if (om === "mending") e.heal += O.mend; if (om === "cursed") e.hurt += O.cursed; if (om === "leeching") e.leech += Math.max(1, Math.round(g.run.hp * O.leechPct)); });
    return e;
  }
  function previewValue(g, diceIds, frac) {
    var ds = diceIds.map(function (id) { return g.dice[id]; }), letters = ds.map(function (d) { return d.letter === "*" ? "e" : d.letter; });
    var c = contribution(g, letters.join(""), omenFaces(g, ds), frac); c.omens = omenEffects(g, diceIds); return c;
  }
  // Play the dice `diceIds` (tap order) into "spark" or "ward".
  // Returns {ok, error, penalty, word, spark, ward, hot}. A non-word backfires (d's rule): −50, −100, then −500 HP.
  function playWord(g, diceIds, dest, frac) {
    if (g.phase !== "spell" || g.bustPending) return { ok: false, error: "Not your turn." };
    var slotIdx = typeof dest === "string" && dest.indexOf("slot:") === 0 ? +dest.slice(5) : -1;
    dest = slotIdx >= 0 ? "slot" : dest === "ward" ? "ward" : "spark";
    var slotRow = slotIdx >= 0 ? g.intent[slotIdx] : null;
    if (slotIdx >= 0 && (!slotRow || slotRow.broken)) return { ok: false, error: "That word is already cancelled." };
    var ds = diceIds.map(function (id) { return g.dice[id]; });
    if (!ds.length || ds.some(function (d) { return !d || d.state !== "pool"; })) return { ok: false, error: "Those dice aren't available." };
    // d: short words defend. A 2-letter word halves one foe word's attack; a 3-letter word cancels one. They don't score.
    // 4+ letter words score: hit the foe, or break a foe word whose rule they fit (counts half).
    var shortRole = null;
    if (formsOn(g)) {
      var nL = ds.length;
      if (nL <= 3) {
        var liveT = g.intent.some(function (x) { return (x.kind === "attack" || x.kind === "block") && !x.broken && x.amount > 0 && (nL === 3 || !x.halved); });
        if (slotIdx < 0 && liveT) return { ok: false, error: nL === 2 ? "Two-letter words halve a foe word: tap one of their words." : "Three-letter words cancel a foe word: tap one of their words." };
        if (slotIdx >= 0 && slotRow.kind !== "attack" && slotRow.kind !== "block") return { ok: false, error: "Pick one of their attack words." };
        if (slotIdx >= 0 && nL === 2 && slotRow.halved && !thornReady(g)) return { ok: false, error: "That word is already halved." };
        shortRole = slotIdx < 0 ? "none" : nL === 2 ? "halve" : "cancel"; dest = "ward";
        if (shortRole === "halve" && thornReady(g)) { shortRole = "cancel"; g.thornUsed = true; }   // Thornwick: once per duel   // d: with nothing to stop, a short word still spends its dice (it can complete an All Speak)
      } else if (dest === "ward" || slotIdx >= 0) return { ok: false, error: "Words of 4+ letters hit; 2–3 letter words defend." };
    }
    if (new Set(diceIds).size !== diceIds.length) return { ok: false, error: "Each die once per word." };
    var ml = minLen(g);
    if (ds.length < ml) return { ok: false, error: "Too short (min " + ml + ")." };
    var letters = ds.map(function (d) { return d.letter; }), faces = ds.map(function (d) { return d.face; });
    if (g.banned && letters.indexOf(g.banned) >= 0) return { ok: false, banned: true, error: g.banned.toUpperCase() + " is banned this round." };
    var word = resolveWord(g, letters, faces), shown = letters.join("").toUpperCase().replace(/\*/g, "?");
    if (!word) {
      if (g.run.curse === "once" && isWord(letters.join(""), ml)) return { ok: false, error: "Curse of Greed: " + shown + " was already used." };
      if (g.trial) return { ok: false, timePenalty: CONFIG.trial.wrongPenaltySec, error: "“" + shown + "” isn't a word. −" + CONFIG.trial.wrongPenaltySec + " seconds." };
      g.wrongStreak++;
      var P = CONFIG.wrongWordPenalties, pen = P[Math.min(g.wrongStreak, P.length) - 1];
      hurt(g, pen);
      return { ok: false, penalty: pen, streak: g.wrongStreak, dead: g.phase === "dead",
        error: "“" + shown + "” isn't a word. It backfires: −" + pen + " HP" + (g.wrongStreak > 1 ? " (" + g.wrongStreak + " in a row)" : "") + "." };
    }
    g.wrongStreak = 0;
    // HUSH, the Killing Word. A Murmur never says the same word twice, and the Eighth already said HUSH: its bones refuse.
    // Spelled only with bones from elsewhere (added dice), it silences the foe's strongest word, and those dice go quiet for the duel.
    if (word === "hush" && !g.trial) {
      var eighth = ds.some(function (d) { return g.run.dice[d.id] && g.run.dice[d.id].eighth; });
      if (eighth) {
        var first = !g.run.notTwice; g.run.notTwice = true; if (first) earnLore(g, "nottwice");
        return { ok: false, refused: true, firstRefusal: first, error: "Not twice." };
      }
      if (g.hushUsed) return { ok: false, error: "The Killing Word works once per duel." };
      var target = null; g.intent.forEach(function (r) { if (r.kind === "attack" && (!target || r.amount > target.amount)) target = r; });
      if (target) g.intent.splice(g.intent.indexOf(target), 1);
      g.hushed = (g.hushed || []).concat(ds.map(function (d) { return d.id; }));
      ds.forEach(function (d) { d.state = "off"; });
      g.hushUsed = true; g.usedWords.push(word); g.wordsSinceRoll++; g.pushPending = false;
      return { ok: true, word: word, dest: dest, amount: 0, spark: 0, ward: 0, hush: true, cancelled: target ? target.word : null, echoed: [] };
    }
    var c = contribution(g, word, omenFaces(g, ds), frac), amt = dest === "ward" ? c.ward : dest === "slot" ? Math.floor(c.spark * CONFIG.slots.breakShare) : c.spark;
    var cancelledAmt = slotRow ? slotRow.amount : 0;
    if (slotRow && shortRole === "halve") {
      var half = Math.floor(slotRow.amount / 2); if (slotRow.kind === "block") g.guard = Math.max(0, g.guard - (slotRow.amount - half)); slotRow.amount = half; slotRow.halved = true;
    } else if (slotRow) { slotRow.broken = true; if (slotRow.kind === "block") g.guard = Math.max(0, g.guard - slotRow.amount); slotRow.amount = 0; slotRow.thorns = 0; slotRow.leech = false; }
    var oe = omenEffects(g, diceIds);
    if (oe.coins) g.run.coins += oe.coins;
    if (oe.heal) g.run.hp = Math.min(g.run.maxHp, g.run.hp + oe.heal);
    if (oe.hurt) { var hl = Math.min(oe.hurt, Math.max(0, g.run.hp - 1)); g.run.hp -= hl; g.dmgTaken = (g.dmgTaken || 0) + hl; }
    if (oe.leech) { var lv = Math.min(oe.leech, Math.max(0, g.run.hp - 1)); g.run.hp -= lv; g.enemyHp = Math.min(g.enemyMax, g.enemyHp + lv); }
    diceIds.forEach(function (id) { if (g.omens) delete g.omens[id]; });
    var echoed = [];
    ds.forEach(function (d) { if (d.echoLeft > 0) { d.echoLeft--; d.echoUsed = true; echoed.push(d.id); } else d.state = "spent"; });
    var rebut = formsOn(g) && dest === "ward" && shortRole === "cancel" && has(g.run, "rebuttal") && WORD_TESTS.pair(word);
    if (formsOn(g) && dest === "ward" && shortRole !== "none") {   // reward hooks on a real defense word
      if (shortRole === "cancel" && has(g.run, "counter")) g.bonusChips = (g.bonusChips || 0) + Math.floor(cancelledAmt * CONFIG.forms.chipScale / 40);
      if (shortRole === "cancel" && has(g.run, "mendword")) g.run.hp = Math.min(g.run.maxHp, g.run.hp + 12);
      if (has(g.run, "wardecho") && !g.wardEchoUsed) { g.wardEchoUsed = true; g.bonusChips = (g.bonusChips || 0) + 4 * CONFIG.forms.chipScale; }
      syncTurnDamage(g);
    }
    if (formsOn(g) && dest === "ward" && !rebut) {   // a Defense word (halve/cancel already applied): it doesn't score or fill Forms
      amt = 0;
    } else if (formsOn(g)) {   // Forms: the word joins the turn; the whole turn is re-scored (Chips × Mult)
      var ofc = omenFaces(g, ds), d0 = g.dmg; g.scoredSinceRoll = (g.scoredSinceRoll || 0) + 1;
      g.turnWords = (g.turnWords || []).concat([{ word: word, chips: wordChips(g, word, ofc), dest: dest === "slot" ? "slot" : "face",
        red: faces.some(function (f) { return f && f.inlay === "red"; }) }]);
      syncTurnDamage(g); amt = g.dmg - d0;
    } else if (dest === "ward") { g.ward += amt; } else g.dmg += amt;
    g.words.push({ word: word, dest: dest, amount: amt, len: word.length, speed: c.speed, omens: oe.list });
    if (!g.trial) { var st = g.run.stats || (g.run.stats = { dealt: 0, longest: "", words: 0 }); st.words++; if (word.length > st.longest.length) st.longest = word; }
    g.usedWords.push(word); g.wordsSinceRoll++; g.pushPending = false;
    var clock = null; if (g.clockLevel != null && !g.trial) { g.clockLevel++; clock = clockSeconds(g); }
    if (g.trial) { g.trialScore += c.spark; g.trialWords++; }
    // hot dice: every active die spent (an echo die that has been used at least once counts as spent)
    var unused = poolDice(g).filter(function (d) { return !d.echoUsed; });
    var hot = unused.length === 0 || (unused.length === 1 && has(g.run, "lastdie"));
    if (hot && !g.trial) {
      var bonus = formsOn(g) ? 0 : CONFIG.hotDiceBonus;
      if (formsOn(g)) { g.hotMult = (g.hotMult || 0) + CONFIG.forms.allSpeakMult;
        if (has(g.run, "encore") && unused.length === 0) g.bonusChips = (g.bonusChips || 0) + 6 * CONFIG.forms.chipScale; }
      bonus = Math.round(bonus * Math.pow(0.5, g.turnHotCount || 0)); g.turnHotCount = (g.turnHotCount || 0) + 1;   // each All Speak in the same turn pays half the last (playtest: chains one-shot elites)
      g.dmg += bonus; g.hot = true; g.turnHot = true;
      g.words.push({ word: "ALL SPEAK", dest: "spark", amount: bonus, hot: true });
      var woke = g.enemy.chair && !g.run.woken;
      if (g.enemy.chair) { g.woken = true; g.run.woken = true; }   // the Silent Chair: all 49 spoke, the Eighth wakes for a breath
    } else if (hot && g.trial) g.hot = true;
    if (formsOn(g)) syncTurnDamage(g);
    return { ok: true, word: word, dest: dest, amount: amt, spark: c.spark, ward: c.ward, speed: c.speed, hot: hot, echoed: echoed, clockSeconds: clock, woke: !!woke, omens: oe };
  }

  // ---- Push / fizzle ----
  function pushDiceCount(g) { return g.hot ? activeDice(g).length : poolDice(g).length; }
  function rollsLeft(g) { return Math.max(0, CONFIG.maxRolls - (g.turnPushes || 0)); }
  function canPush(g) {
    if (g.phase !== "spell" || g.wordsSinceRoll < 1 || rollsLeft(g) <= 0) return false;
    if (formsOn(g) && !(g.scoredSinceRoll > 0) && !g.hot) return false;   // d: roll again only after a word that scores (4+ letters); All Speak always earns its fresh roll
    var n = pushDiceCount(g);
    return n >= minLen(g);
  }
  function pushBlockReason(g) {
    if (g.wordsSinceRoll < 1) return "Play a word from this roll first.";
    if (formsOn(g) && !(g.scoredSinceRoll > 0) && !g.hot) return "Score a word (4+ letters) from this roll first.";
    if (rollsLeft(g) <= 0) return "No rolls left this turn: cast.";
    if (pushDiceCount(g) < minLen(g)) return "Need at least " + minLen(g) + " dice; cast or use a sigil.";
    return "";
  }
  // Returns {ok, fizzle, shielded, netCast, out}
  // Chance a roll again shows no legal word (playtest: "risks X" never said what the risk was). Monte Carlo, display only:
  // uses Math.random so it never moves the seeded game.
  var bustCache = { key: "", p: 0 };
  function bustChance(g, samples) {
    if (!canPush(g)) return null;
    var reroll = g.hot ? activeDice(g) : poolDice(g), ml = nextMinLen(g);
    var key = reroll.map(function (d) { return d.id; }).join(",") + "|" + ml + "|" + (g.banned || "") + "|" + g.run.dice.length;
    if (key === bustCache.key) return bustCache.p;
    var n = samples || 200, busts = 0;
    for (var k = 0; k < n; k++) {
      var letters = reroll.map(function (d) { var fs = g.run.dice[d.id].faces, f = fs[Math.floor(Math.random() * fs.length)]; return f.l === "*" ? "e" : f.l; });
      if (g.banned) letters = letters.filter(function (l) { return l !== g.banned; });
      if (!hasAnyWord(letters, ml)) busts++;
    }
    bustCache = { key: key, p: busts / n }; return bustCache.p;
  }
  // Momentum: a roll again that lands a word grows everything banked this turn (playtest: pushing only ever risked, never paid).
  function momentum(g) { if (g.momentumUsed) return { dmg: 0, ward: 0 }; g.momentumUsed = true; var m = CONFIG.momentum, d = Math.round(g.dmg * m), w = Math.round(g.ward * m); g.dmg += d; g.ward += w; return { dmg: d, ward: w }; }
  function push(g) {
    if (!canPush(g)) return { ok: false, error: pushBlockReason(g) };
    var reroll = g.hot ? activeDice(g) : poolDice(g);
    g.turnPushes = (g.turnPushes || 0) + 1;
    reroll.forEach(function (d) { d.state = "pool"; d.echoUsed = false; rollOne(g, d); if (g.omens) delete g.omens[d.id]; });   // rolling a cursed die shakes the curse off
    dealOmens(g, reroll.map(function (d) { return d.id; }));
    g.hot = false; g.wordsSinceRoll = 0; g.scoredSinceRoll = 0;
    if (legalWords(g).length) { var mo = formsOn(g) ? { dmg: 0, ward: 0 } : momentum(g); if (formsOn(g)) { g.chain = Math.min(CONFIG.forms.chainCap, (g.chain || 0) + 1); syncTurnDamage(g); } g.pushPending = true; g.clockLevel = 0; return { ok: true, fizzle: false, seconds: pushSeconds(g), momentum: mo }; }
    if (has(g.run, "wildfire") && !g.wildfireUsed) {   // Wildfire: once per duel, a bust rerolls once instead
      g.wildfireUsed = true;
      reroll.forEach(function (d) { rollOne(g, d); });
      if (legalWords(g).length) { g.chain = Math.min(CONFIG.forms.chainCap, (g.chain || 0) + 1); syncTurnDamage(g); g.pushPending = true; g.clockLevel = 0; return { ok: true, fizzle: false, shielded: true, wildfire: true, seconds: pushSeconds(g) }; }
    }
    g.bustPending = true;   // d: show the roll that failed first; the UI calls resolveBust after the dice land
    return { ok: true, fizzle: true, pending: true };
  }
  function resolveBust(g) { if (!g.bustPending) return null; g.bustPending = false; return fizzle(g); }
  function pushSeconds(g) { return (CONFIG.pushSeconds[(g.run.act || 1) - 1] || 15) - yearMods(g.run).clock; }
  // Length of the running clock: the push clock, stretched by clockSlow for every word spelled since the push.
  function clockSeconds(g) { return Math.round(pushSeconds(g) * (1 + CONFIG.clockSlow * (g.clockLevel || 0))); }
  // The push clock ran out (or the player gave up) before a word was spelled from the new roll.
  function failPush(g) {
    if (!g.pushPending || g.phase !== "spell") return null;
    g.pushPending = false; g.clockLevel = null;
    var out = fizzle(g); out.timeout = true; return out;
  }
  // d: "fix the give up". Giving up on a roll loses the bank but isn't a bust: their words land at normal strength.
  function giveUp(g) {
    if (!g.pushPending || g.phase !== "spell") return null;
    g.pushPending = false; g.clockLevel = null;
    var lost = { dmg: g.dmg, ward: g.ward }; g.dmg = 0; g.ward = 0; g.turnWords = []; g.chain = 0; g.hotMult = 0; g.bonusChips = 0;
    var out = enemyTurn(g, 0, true); out.gaveUp = true; out.fizzle = true; out.lost = lost; return out;
  }
  function fizzle(g) {
    var lost = { dmg: g.dmg, ward: g.ward }, held = 0;
    var hf = g.run.sigils.indexOf("holdfast");
    if (hf >= 0 && g.dmg > 0 && formsOn(g)) {   // Hold Fast: half the bank still lands
      g.run.sigils.splice(hf, 1); held = Math.floor(g.dmg / 2);
      var soak0 = Math.min(g.guard, held); g.guard -= soak0; g.enemyHp -= held - soak0;
      if (g.enemyHp <= 0) { g.enemyHp = 0; g.dmg = 0; g.phase = "won"; return { fizzle: true, lost: lost, held: held, killed: true, rows: [], hpLoss: 0 }; }
    }
    g.dmg = 0; g.ward = 0;
    if (formsOn(g)) { g.turnWords = []; g.chain = 0; g.hotMult = 0; g.intent.forEach(function (r) { if (r.kind === "attack") r.amount = Math.round(r.amount * CONFIG.forms.bustMult); }); }   // a bust: the foe's words land at 150%
    var heal = 0;
    if (g.enemy.trait === "glutton") { heal = Math.min(g.enemyMax - g.enemyHp, Math.round(g.enemyMax * CONFIG.gluttonHeal)); g.enemyHp += heal; }
    if (g.run.curse === "tax") g.intent.push({ word: specialWord(g, "tithe"), kind: "tithe", amount: CONFIG.titheDamage });
    var out = enemyTurn(g, 0, true);
    out.fizzle = true; out.lost = lost; out.gluttonHeal = heal; out.held = held;
    return out;
  }
  // ---- Cast ----
  function cast(g) {
    if (g.phase !== "spell") return null;
    if (g.bustPending) return resolveBust(g);
    if (g.pushPending) return failPush(g);
    g.clockLevel = null;
    var out = { dealt: 0, guardSoak: 0, killed: false };
    // Lore achievements (successful cast only)
    if (g.words.some(function (w) { return !w.hot && w.len >= 6; })) earnLore(g, "long");
    if (g.words.filter(function (w) { return !w.hot; }).length >= 3) earnLore(g, "three");
    if (g.turnHot) earnLore(g, "hot");
    var soak = Math.min(g.guard, g.dmg); g.guard -= soak; out.guardSoak = soak;
    var dealt = g.dmg - soak; var st0 = g.run.stats || (g.run.stats = { dealt: 0, longest: "", words: 0 }); st0.dealt += Math.max(0, Math.min(dealt, g.enemyHp)); g.enemyHp -= dealt; out.dealt = dealt;
    if (g.enemyHp <= 0) {
      // d, 2026-11-06: no strike back after a killing blow. The foe falls before its words land.
      g.overkill = -g.enemyHp; out.overkill = g.overkill; g.enemyHp = 0; out.killed = true;
      out.rows = []; out.hpLoss = 0; out.absorbed = 0;
      g.phase = "won"; return out;
    }
    var ward = g.ward, reflect = 0;
    if (g.dmg > 0) reflect = thornsTotal(g);
    var res = enemyTurn(g, ward, false, reflect);
    res.dealt = dealt; res.guardSoak = soak;
    return res;
  }
  function earnLore(g, key) { }   // d: no Lore system
  // The foe casts its list into your ward. Then cleanup and the next round.
  function enemyTurn(g, ward, fizzled, reflect) {
    var out = { rows: [], hpLoss: 0, absorbed: 0, reflect: reflect || 0, leechHeal: 0, killed: false, dead: false };
    if (reflect) { var ra = Math.min(ward, reflect); ward -= ra; out.absorbed += ra; hurt(g, reflect - ra); out.hpLoss += reflect - ra; out.reflectHp = reflect - ra; }
    var attackTotal = 0;
    g.nextGuard = 0;
    var silenceNext = [];
    g.intent.forEach(function (r) {
      var row = { word: r.word, kind: r.kind, amount: r.amount, absorbed: 0, hp: 0 };
      if (g.phase === "dead") { out.rows.push(row); return; }
      if (r.kind === "attack" || r.kind === "tithe") {
        attackTotal += r.amount;
        var a = Math.min(ward, r.amount); ward -= a; row.absorbed = a; row.hp = r.amount - a;
        hurt(g, row.hp); out.hpLoss += row.hp; out.absorbed += a;
        if (r.leech && row.hp > 0) { var h = Math.min(g.enemyMax - g.enemyHp, Math.floor(row.hp / 2)); g.enemyHp += h; row.leech = h; out.leechHeal += h; }
      } else if (r.kind === "guard") { g.nextGuard = r.amount; }
      else if (r.kind === "mend") { var m = Math.min(g.enemyMax - g.enemyHp, r.amount); g.enemyHp += m; row.healed = m; }
      else if (r.kind === "hush") {
        var cand = g.dice.filter(function (d) { return silenceNext.indexOf(d.id) < 0; });
        if (cand.length > 4) { var pickD = cand[Math.floor(g.rng() * cand.length)]; silenceNext.push(pickD.id); row.die = pickD.id; }
      }
      out.rows.push(row);
    });
    if (g.enemy.trait === "thief" && g.phase !== "won") {   // steals your most valuable die for the next round
      var loot = g.dice.filter(function (d) { return silenceNext.indexOf(d.id) < 0 && (g.hushed || []).indexOf(d.id) < 0; })
        .sort(function (a, b) { return (LETTER_VALUE[b.letter] || 0) - (LETTER_VALUE[a.letter] || 0); });
      if (loot.length > 5) { silenceNext.push(loot[0].id); out.stolen = loot[0].id; out.stolenLetter = loot[0].letter; }
    }
    if (!fizzled && attackTotal > 0 && out.hpLoss === 0 && g.ward > 0) earnLore(g, "absorb");
    out.dead = g.phase === "dead";
    g.log.push({ round: g.round, rows: out.rows, hpLoss: out.hpLoss });
    if (out.dead) return out;
    // cleanup: ward expires; the Guard that protected this turn expires; newly granted Guard lasts a turn
    g.ward = 0; g.bonusChips = 0; g.wardEchoUsed = false; g.dmg = 0; g.words = []; g.turnHot = false; g.pushPending = false; g.clockLevel = null; g.guard = g.nextGuard; g.nextGuard = 0;
    g.silence = silenceNext;
    g.turnPushes = 0; g.turnHotCount = 0; g.momentumUsed = false; g.turnWords = []; g.chain = 0; g.hotMult = 0; g.turnScoreNow = null;
    g.round++; g.intent = makeIntent(g); addBlock(g); openingRoll(g);
    return out;
  }
  function hurt(g, dmg) {
    if (dmg <= 0) return;
    g.run.hp -= dmg; g.dmgTaken += dmg;
    if (g.run.hp <= 0 && has(g.run, "secondwind") && (!g.secondWindUsed || g.secondWindRound === g.round)) {   // the rest of that volley can't finish you either
      g.secondWindUsed = true; g.secondWindRound = g.round; g.dmgTaken += g.run.hp - 1; g.run.hp = 1; g.secondWind = true; }
    if (g.run.hp <= 0) { g.run.hp = 0; g.phase = "dead"; }
  }

  // ---- abilities and sigils ----
  function fray(g, rowIndex) {
    var r = g.intent[rowIndex];
    if (!r || r.kind !== "attack" || r.frayed || g.frayLeft < 1 || g.phase !== "spell") return { ok: false };
    r.frayed = true; g.frayLeft--; applyRowMods(g, g.intent);
    return { ok: true, row: r };
  }
  function inkReroll(g, dieId) {
    var d = g.dice[dieId]; if (!d || d.state !== "pool" || g.inkRerollLeft < 1) return { ok: false };
    g.inkRerollLeft--; rollOne(g, d); return { ok: true };
  }
  function useSigil(g, idx) {
    var id = g.run.sigils[idx];
    if (!id || g.phase !== "spell") return { ok: false };
    if (!SIGILS[id] || !SIGILS[id].target) return { ok: false, passive: true };   // Hold Fast works by being carried
    g.armed = { idx: idx, id: id }; return { ok: true, targeting: true };
  }
  function useSigilOn(g, dieId, vowel) {
    var a = g.armed; if (!a) return { ok: false };
    var d = g.dice[dieId]; if (!d || d.state !== "pool") return { ok: false };
    g.run.sigils.splice(a.idx, 1); g.armed = null;
    if (a.id === "tumble") rollOne(g, d);
    if (a.id === "ink") { var v = "aeiou".indexOf(vowel) >= 0 && vowel ? vowel : "e"; d.letter = v; d.face = { l: v, gild: d.face && d.face.gild, inlay: d.face && d.face.inlay }; }
    return { ok: true, id: a.id };
  }
  function scoreWord(w) {
    var sum = 0; for (var i = 0; i < w.length; i++) sum += LETTER_VALUE[w[i]] || 0;
    return Math.round(sum * (CONFIG.lengthMult[Math.min(w.length, 9)] || 6) * CONFIG.pointsScale);
  }

  // ---- the tutorial: a scripted practice duel with Tamsin (d, 2026-11-06) ----
  // Each die's n-th roll shows its n-th face, so every step has the letters it needs:
  //   round 1: C A T S · D O G · A X  (score CATS, cancel with DOG, halve with AX: every die used = All Speak)
  //   round 2: S T O N E + Q Z V W, and rolling again turns those four into R A I N.
  var TUTORIAL = {
    dice: ["csaeit", "ateirs", "toesna", "snrtle", "deaots", "oqrlet", "gzaent", "avistr", "xwnelo"],
    hp: 45,   // 15 letter points: survives round 1, falls in round 2
    intent: [
      [ { word: "SLASH", kind: "attack", base: 90, amount: 90 }, { word: "JAB", kind: "attack", base: 40, amount: 40 } ],
      [ { word: "BITE", kind: "attack", base: 50, amount: 50 } ],
    ],
  };
  function startTutorial(run) {
    run.dice = TUTORIAL.dice.map(function (f) { var d = makeDie(f); d.eighth = true; return d; });
    run.charms = []; run.sigils = []; run.curse = null; run.house = run.house || null;
    var def = { id: "tamsin", name: "Tamsin Reed", hp: TUTORIAL.hp, atk: 40, turns: 9, role: "student", spells: ["SLASH"], quip: "Practice round. I'll go easy. Mostly." };
    run.game = newFight(run, def, seeded(1), { tutorial: true });
    run.game.room = "fight"; run.state = "fight";
    return run.game;
  }

  var API = {
    skipRoom: skipRoom, quizRules: quizRules, giveUp: giveUp, foePower: foePower, foeWordPoints: foeWordPoints, resolveBust: resolveBust, startTutorial: startTutorial, TUTORIAL: TUTORIAL, WORD_TESTS: WORD_TESTS, thornReady: thornReady,
    CONFIG: CONFIG, LETTER_VALUE: LETTER_VALUE, PATRONS: PATRONS, RELICS: RELICS, sellPrice: sellPrice, CHARMS: CHARMS, SIGILS: SIGILS, UPGRADES: UPGRADES, CURSES: CURSES, TRAITS: TRAITS,
    ROOMS: ROOMS, EVENTS: EVENTS, RARITY: RARITY, RARITIES: RARITIES,
    loadDictionary: loadDictionary, loadVocab: loadVocab, isWord: isWord, wordsFrom: wordsFrom, hasAnyWord: hasAnyWord, scoreWord: scoreWord,
    newRun: newRun, saveRun: saveRun, loadRun: loadRun, saveSummary: saveSummary, WORLDS: WORLDS, YEAR_MODS: YEAR_MODS, worldFor: worldFor, yearMods: yearMods, maxCharms: maxCharms, longestLegal: longestLegal, runScore: runScore, leaderboardEntry: leaderboardEntry, addToBoard: addToBoard, setHouse: setHouse, startNextAct: startNextAct, foeInfo: foeInfo, roomFoe: roomFoe, genMap: genMap, reachable: reachable,
    mapNode: mapNode, enterNode: enterNode, leaveRoom: leaveRoom, restHeal: restHeal, restFeast: restFeast, restSteel: restSteel, restCarve: restCarve, randomSeed: randomSeed, has: has, upg: upg,
    startFight: startFight, finishFight: finishFight, retryRoom: retryRoom, addLore: addLore,
    startTrial: startTrial, trialRoll: trialRoll, finishTrial: finishTrial, answerQuiz: answerQuiz, finishQuiz: finishQuiz,
    rollReward: rollReward, takeReward: takeReward, skipReward: skipReward, usable: usable,
    rerollShop: rerollShop, canBuy: canBuy, needsTarget: needsTarget, needsDieOnly: needsDieOnly, buy: buy, sellCharm: sellCharm, leaveShop: leaveShop,
    poolDice: poolDice, nextMinLen: nextMinLen, autoDest: autoDest, FORMS: FORMS, turnScore: turnScore, wordChips: wordChips, syncTurnDamage: syncTurnDamage, slotLabel: slotLabel, slotFits: slotFits, rollsLeft: rollsLeft, OMENS: OMENS, omenEffects: omenEffects, bustChance: bustChance, adaptMult: adaptMult, INLAYS: INLAYS, inlayInfo: inlayInfo, inlayMult: inlayMult, poolLetters: poolLetters, minLen: minLen, legalWords: legalWords, wordPower: wordPower, speedMult: speedMult, contribution: contribution, previewValue: previewValue,
    playWord: playWord, canPush: canPush, pushBlockReason: pushBlockReason, pushDiceCount: pushDiceCount, push: push, cast: cast, preview: preview, incoming: incoming,
    failPush: failPush, makeOffer: makeOffer, pushSeconds: pushSeconds, clockSeconds: clockSeconds, fray: fray, inkReroll: inkReroll, useSigil: useSigil, useSigilOn: useSigilOn, makeIntent: makeIntent,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.LF = API;
})(this);
