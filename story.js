// Hushbones — the story script. YA tone: warm, funny, a little dark. Every scene is a list of lines.
// Canon lives in the Lore Bible (claude.ai artifact 2XQGQDBwg1hcAqy8BUfZhR); this file follows it.
// who: a speaker id (see SPEAKERS) or "narrator". Lines may use {house}, {houseMotto}, {exam}, {examSubject},
// {traitor}, {traitorSubject}, {friend} — filled in by the game.
(function (root) {
  "use strict";

  var SPEAKERS = {
    narrator: { name: "" },
    vane:     { name: "Headmistress Orla Vane", art: "portrait" },
    tamsin:   { name: "Tamsin Reed", art: "portrait" },          // your roommate, same house as you
    you:      { name: "You", art: "portrait" },
    warden:   { name: "The Warden", art: "portrait" },
    hester:   { name: "Hester Wynn" },                           // your grandmother; never seen, only her letter
    venn:     { name: "Professor Venn" }, ashgrove: { name: "Professor Ashgrove" }, thale: { name: "Professor Thale" },
    brack:    { name: "Professor Brack" }, quell: { name: "Professor Quell" },
  };

  // ---------------------------------------------------------------- the world
  var LORE = [   // d's opening (shortened 2026-11-07, d: "story is too long")
    { who: "narrator", text: "Before there were words, there were eight Murmurs: ancient spirits whose words could shape reality. Seven speakers tricked them into spelling HUSH, and the word became their prison." },
    { who: "narrator", text: "Their essences hardened into bone, then were carved into dice. At Thistlemoor Academy, students roll the dice, spell a word, and lend them a voice." },
  ];

  var INTRO = [
    { who: "narrator", text: "The envelope came in your grandmother's handwriting, three years after her funeral: an admission letter, and nine dice the colour of old piano keys. The dice were warm." },
    { who: "hester", text: "If the bones have started to stir, I'm sorry. Keep them close. I never decided whether they deserved ______. Maybe you will. — H." },
    { who: "vane", text: "Late admissions are rare. Welcome to Thistlemoor. Your bones will need a house: choose the one that sounds like you." },
  ];

  var CHOSEN = [
    { who: "vane", text: "{house}. “{houseMotto}” Good. Tamsin will show you to your room." },
    { who: "tamsin", text: "A roommate, finally! I'm Tamsin. Everyone duels here, so stay sharp: stop their words before they land." },
  ];

  // ---------------------------------------------------------------- the three acts
  var ACT_INTRO = {
    1: [
      { who: "narrator", text: "ACT I — NOVICE TERM" },
      { who: "tamsin", text: "The new kid gets challenged by everyone. Still standing at the end of term? Then you sit the exam with {exam}." },
    ],
    2: [
      { who: "narrator", text: "ACT II — THE LOWMARKET" },
      { who: "vane", text: "Last night bones were taken from the locked Ossuary, out through the old smugglers' tunnel." },
      { who: "vane", text: "No novice leaves the grounds until they're found. That includes you. Especially you. That is not a request." },
      { who: "narrator", text: "Your dice won't sit still. Ever since the bones left, they tug toward Fairgate like a compass needle. That night you roll them to practise. All nine land in a row: L. O. W. M. A. R. K. E. T." },
      { who: "narrator", text: "You roll again. LOWMARKET. You put them away. They roll themselves out of the pouch and spell it on the floor." },
      { who: "tamsin", text: "The Lowmarket? Under Fairgate? That's where people go to buy things that fell off a cart. Or out of a vault?" },
      { who: "tamsin", text: "...Fine. There's a night coach at eleven. But if we get expelled, I'm telling everyone it was the dice." },
    ],
    3: [
      { who: "narrator", text: "ACT III — THE AWAKENING" },
      { who: "tamsin", text: "The Warden didn't take those bones. A teacher signed them out and paid him to look away. Somebody with a key to the Sealed Library." },
      { who: "vane", text: "Whoever it is has followers now: people who believe the Murmurs were wronged and deserve to speak. Some just want to use them." },
      { who: "vane", text: "Nobody knows what happens if one actually returns. The bones are in the Sealed Library. Do not let them make you roll." },
    ],
  };
  // Tamsin's own stake, by traitor: played at the end of the Act III intro.
  var TAMSIN_HOOK = {
    venn:     [{ who: "tamsin", text: "That ink on the vault door... Aunt Bryony has letters in that ink. Someone wrote to her about voices for years." }],
    ashgrove: [{ who: "tamsin", text: "Hushbone chips are turning up in my hometown. My cousins are buying them. I need this to stop." }],
    thale:    [{ who: "tamsin", text: "Whoever opened those wards wasn't greedy. Bryony always said the bones were asking for something. What if someone finally listened?" }],
    brack:    [{ who: "tamsin", text: "Someone's been writing down this year's dead. My gran died in March. I just... want to know if she's on it." }],
    quell:    [{ who: "tamsin", text: "The duelling team's drill sheets have been coming through me all term. I never looked at them. I'm looking now." }],
  };

  // The Act I exam, by examiner
  var EXAM = {
    venn:     [{ who: "venn", text: "Etymology is the study of where words come from. Today, we study where yours are going. Begin." }],
    ashgrove: [{ who: "ashgrove", text: "I don't grade on accuracy. I grade on nerve. Make it loud, novice." }],
    thale:    [{ who: "thale", text: "Defense is a word you spend on yourself. Let's see whether you know when to." }],
    brack:    [{ who: "brack", text: "Restoration teaches patience. I will be very patient while you fail. Then I'll show you how to fix it." }],
    quell:    [{ who: "quell", text: "Speed is a kindness to your enemies; they suffer less. Ready? Of course you're not. Go." }],
  };
  var ACT_END = {
    1: [
      { who: "narrator", text: "You pass. Barely, brilliantly, and with ink on your face." },
      { who: "tamsin", text: "You BEAT {exam}! Nobody beats {exam}! I'm telling everyone. I'm telling people who don't even go here." },
      { who: "narrator", text: "But your dice answered {exam} too loudly, and {exam} noticed. That week, at the staff meeting, someone else noticed too." },
      { who: "narrator", text: "That night your dice grow warm in their pouch. They roll themselves across the floor and land on one word: OPEN." },
    ],
    2: [
      { who: "warden", text: "Found me, then. You think I stole them? I'm a jailer. I open the door when the ledger says so." },
      { who: "warden", text: "Midnight. A teacher signed them out, \"for study\", and paid me enough to disappear into Fairgate. Theft or rescue, that's your problem, not mine." },
      { who: "warden", text: "Ask your teachers who signs things at midnight. One of them won't answer." },
      { who: "vane", text: "I told you not to leave the grounds. And your dice walked you straight to him. Of course they did." },
      { who: "vane", text: "Those are the bones of the Eighth Murmur, the one the Seven never quite finished. The Academy has guarded them for four hundred years." },
      { who: "vane", text: "Your grandmother took the missing pieces, fifty years ago: the nine in your pocket. She was my closest friend. When the bones began to stir, I posted her letter." },
      { who: "vane", text: "Those nine are bound to you. Only you can make them speak, and only with them can the Eighth wake. Whoever took the rest doesn't need your dice. They need you." },
    ],
  };

  // Clues, in the order you find them: Suspicion (has an innocent explanation), Contradiction, Proof.
  // Each one found strips an advantage from the traitor's final duel.
  var CLUE_STAGE = ["Suspicion", "Contradiction", "Proof"];
  var CLUES = {
    venn:     ["Blue-black ink on the vault door. Then again, Professor Venn marks every essay in it; half the school has it on their hands.",
               "A dictionary page with the entry for “voice” circled and one line in the margin: not yet. Someone has been studying the Eighth's last words.",
               "An unsent letter to someone named Ada: “I've found the name I was keeping.” The same phrase is carved across the stolen bones. Only someone who handled the stolen bones could know it."],
    ashgrove: ["The vault lock wasn't picked. It was melted. Then again, Professor Ashgrove lectures on that very lock.",
               "Ashgrove says she spent that night by the staff-room fire. The hearth is warded to log every lighting. It was never lit.",
               "Hushbone chips for sale in town, wrapped in pages of Ashgrove's class handouts, with her notes on which chips came from the stolen bones."],
    thale:    ["The ward circle around the Ossuary is broken. Then again, Professor Thale maintains the wards. He could have been repairing it.",
               "A hex-key, the kind that opens sealed doors. Its teeth are filed into letters: the letters of the Eighth's last words.",
               "A lecture note in Thale's hand quoting the Eighth's actual words: “let us speak.” Nobody could know them without listening to its bones."],
    brack:    ["Restoration salts on the Ossuary shelves. Then again, Professor Brack treats the vault guards every week.",
               "The guards weren't hurt that night. Nobody needed restoring.",
               "A list of this year's dead in Brack's own handwriting, with causes and times from her infirmary records, written on Ossuary inventory paper. Beside each name: “with a voice, perhaps.”"],
    quell:    ["Timing marks scratched into the vault door, in the security staff's notation. Security does run timed drills.",
               "The drills that night were cancelled. By Professor Quell, who isn't security.",
               "An old Academy record of the year Quell lost to the Headmistress, annotated in his hand with the order of first voices the Eighth must hear. His name is first."],
  };
  var CLUE_OUTCOME = [
    "You'll know what to look for when you face them: they'll have lost their edge.",
    "You can see their plan's seams now. They won't have time on their side.",
    "You know who it is. When you meet them, you can say their name first.",
  ];

  // The betrayal, by traitor. Shown in the Silent Chair before the final duel. NAMED lines replace the opener when you found the Proof.
  var REVEAL = {
    venn: [
      { who: "venn", text: "Ah. You found the letters to Ada. My sister. She lost her voice the winter I was twelve, and then she lost everything else." },
      { who: "venn", text: "The Eighth can say anything into being. I only need it to say one name. One small, safe word." },
      { who: "tamsin", text: "Professor, if it wakes, it won't stop at her name." },
      { who: "venn", text: "Then I suppose I should define my terms. Roll, student. Let it speak." },
    ],
    ashgrove: [
      { who: "ashgrove", text: "Don't look so wounded. I taught you nerve, didn't I? Here it is." },
      { who: "ashgrove", text: "The hush was botched. It can only wake for a breath. One breath in front of everyone, and four hundred years of lies about who owns this power are over." },
      { who: "tamsin", text: "You melted the vault lock. You let the Warden take the blame." },
      { who: "ashgrove", text: "He was paid. You're not. Make it loud, novice. Last lesson." },
    ],
    thale: [
      { who: "thale", text: "We carve them, roll them, borrow their voices and call it education. Have you ever asked a Hushbone what it wants?" },
      { who: "thale", text: "I have. I broke every ward between here and this chair to listen. It said: let us speak." },
      { who: "tamsin", text: "Just the Eighth? Not the others?" },
      { who: "thale", text: "Just the one that asked. I'm not a monster. But I won't stop either." },
    ],
    brack: [
      { who: "brack", text: "I have mended broken arms, broken hearts and one broken dragon. I cannot mend dead." },
      { who: "brack", text: "But the Eighth could. One word, “live”, said by something old enough to mean it. Whatever else comes true with it." },
      { who: "tamsin", text: "You made a list. People who died this year. My gran's name is on it." },
      { who: "brack", text: "Then help me, Tamsin. No? Then I'll be very patient with both of you." },
    ],
    quell: [
      { who: "quell", text: "Fast. You've always been fast. I noticed on your first Speed Trial. I notice everything first." },
      { who: "quell", text: "The Seven were cowards. They silenced what they should have commanded. A waking Murmur must answer the first voice it hears." },
      { who: "quell", text: "It will hear mine. And then she'll finally lose something." },
      { who: "tamsin", text: "That's it? This is about a duel you lost when you were a novice?" },
      { who: "quell", text: "Everything is about a duel you lost as a novice. Ready? Of course you're not." },
    ],
  };
  // Found the Proof: you name them before they can.
  var NAMED = {
    venn:     [{ who: "you", text: "Professor Venn. You've found the name you were keeping. Ada." }],
    ashgrove: [{ who: "you", text: "Professor Ashgrove. The hearth was never lit." }],
    thale:    [{ who: "you", text: "Professor Thale. Let us speak, it said. You heard it." }],
    brack:    [{ who: "you", text: "Professor Brack. Your handwriting, your records. With a voice, perhaps." }],
    quell:    [{ who: "you", text: "Professor Quell. You put your own name first." }],
  };
  // The Silent Chair: the stolen bones are laid in a ring. Any All Speak here completes the set and wakes the Eighth.
  var CHAIR = [
    { who: "narrator", text: "The Silent Chair. The stolen bones lie in a ring around it, and your nine are warm enough to burn." },
    { who: "narrator", text: "Here, if every one of your dice speaks at once, every bone in the ring speaks with them. The Eighth will wake." },
  ];
  // What the Eighth says when it wakes, by traitor (the word they wanted it to say, or its own).
  var WHISPER = { venn: "ADA", ashgrove: "ROAR", thale: "PLEASE", brack: "LIVE", quell: "FIRST" };

  var ENDING_SEALED = [
    { who: "narrator", text: "{traitor} falls, and the Silent Chair goes quiet. Really quiet: the kind you can hear." },
    { who: "vane", text: "Not one breath. You held all nine still, the whole time. Hester would have cried." },
    { who: "vane", text: "{traitor} taught here for nineteen years. I trusted them with my students. I will not make that mistake again." },
    { who: "narrator", text: "The ring of bones is carried back to the Ossuary. Your dice cool in your palm, ordinary as old piano keys." },
    { who: "narrator", text: "Hester's letter is still in your pocket. You finally know the word she left out: SILENCE." },
  ];
  var ENDING_WOKEN = [
    { who: "narrator", text: "{traitor} falls. But for one breath, every bone in the room spoke at once, and something enormous turned to look at you." },
    { who: "narrator", text: "It said one word, softly, as if it had been waiting a very long time to be careful: {whisper}." },
    { who: "vane", text: "It's back under. Mostly. It's stirring now, and it knows your voice." },
    { who: "tamsin", text: "Your dice are humming. Is that bad? Tell me that's not bad." },
    { who: "narrator", text: "Hester's letter is still in your pocket. You finally know the word she left out: A VOICE." },
  ];
  // The secret sixth ending: unlocked once all five traitors have been unmasked (Casebook complete).
  var SECRET = [
    { who: "narrator", text: "Five years. Five teachers. Five reasons. And every one of them decided what the Eighth should say." },
    { who: "narrator", text: "Nobody ever asked it. You kneel by the Silent Chair and, very carefully, you do." },
    { who: "narrator", text: "Your nine dice roll on their own, slowly, one at a time: A. S. K. E. D." },
    { who: "vane", text: "Asked. It wanted to be asked." },
    { who: "tamsin", text: "That's it? Four hundred years, and it just wanted someone to ask?" },
    { who: "narrator", text: "Somewhere below the floor, the old bones and your nine settle against each other like a held breath let go." },
    { who: "narrator", text: "Hester's missing word is not SILENCE, and it is not A VOICE. It is A CHOICE." },
  ];
  var LAST_CHOICE = [
    { who: "vane", text: "The bones go back to the Ossuary tonight. And your nine... I could keep them safe. Or you could." },
  ];
  var DEFEAT = {
    1: [{ who: "tamsin", text: "Hey. Hey. Everybody loses their first term. Mostly. Get up, we're going again." }],
    2: [{ who: "tamsin", text: "The Lowmarket wins this round. We'll come back with better words." }],
    3: [{ who: "vane", text: "Not tonight, then. But they have not won. Not while you're still willing to speak." }],
  };
  // HUSH spelled with the Eighth's own bones: they refuse (a Murmur never says the same word twice).
  var NOT_TWICE = "Your dice go cold. Something very old answers, from inside the bone: “Not twice.”";

  root.STORY = { SPEAKERS: SPEAKERS, LORE: LORE, INTRO: INTRO, CHOSEN: CHOSEN, ACT_INTRO: ACT_INTRO, TAMSIN_HOOK: TAMSIN_HOOK, EXAM: EXAM,
    ACT_END: ACT_END, CLUE_STAGE: CLUE_STAGE, CLUES: CLUES, CLUE_OUTCOME: CLUE_OUTCOME, REVEAL: REVEAL, NAMED: NAMED, CHAIR: CHAIR,
    WHISPER: WHISPER, SECRET: SECRET, ENDING_SEALED: ENDING_SEALED, ENDING_WOKEN: ENDING_WOKEN, LAST_CHOICE: LAST_CHOICE, DEFEAT: DEFEAT, NOT_TWICE: NOT_TWICE,
    ENDING: ENDING_SEALED };
})(this);
