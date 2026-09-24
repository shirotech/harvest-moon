// Villagers: schedules, gift tastes and dialogue. All characters are original.
//
// schedule(ctx) returns where the NPC should be right now, or null when they
// are at home (not visible). ctx = { min, dow, weekday, rain, season, day, festival }.
// Placement: { map, spot } (named spot on that map) or { map, x, y, dir }, plus
// optional wander radius.

const H = (h, m = 0) => h * 60 + m;
const at = (map, spot, wander = 0) => ({ map, spot, wander });

export const NPCS = {
  hollis: {
    name: 'Hollis',
    title: 'Mayor',
    sprite: 'npc_hollis',
    schedule({ min, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'fountain_n');
      if (min < H(8, 30) || min >= H(19)) return null;
      if (rain) return min < H(17) ? at('inn', 'seat_a') : null;
      if (min < H(12)) return at('village', 'fountain_w', 2);
      if (min < H(14)) return at('inn', 'seat_a');
      return at('village', 'north_st', 3);
    },
    gifts: {
      love: ['pumpkin', 'fish_gold', 'stew'],
      like: ['egg', 'milk_s', 'milk_m', 'milk_l', 'riceball', 'bread', 'chestnut'],
      hate: ['boot'],
    },
    lines: {
      intro: [
        "Ah, you must be {name}! Welcome, welcome. I'm Hollis, mayor of our little Willowmere.",
      ],
      any: [
        'Willowmere may be small, but every family here has roots as deep as an old oak.',
        "When I was your age I could carry two sacks of turnips at once. My back remembers it, too.",
        "Don't forget to rest. A tired farmer is a clumsy farmer!",
        "The noticeboard by the store has the season's festival dates. Mark them down!",
        "Have you met everyone yet? A kind word goes a long way in a village like ours.",
        'Your grandmother used to say the soil listens. Talk to your crops, eh?',
      ],
      rain: ["Rain! Your crops will be drinking well today. Take the chance to visit folks."],
      spring: ['Spring is the season of beginnings. Turnips grow fast, if you want a quick start.'],
      summer: ['Summer sun is fierce. Water early, before it gets too hot.'],
      fall: ['Autumn! The whole valley turns to gold. Pumpkins fetch a handsome price.'],
      winter: ["Nothing grows in the fields in winter. Tend your animals, and visit the warm spring in the woods."],
      close: ["You've done wonders with that farm. I'm proud to call you a neighbour, {name}."],
      festival: ['Welcome to the festival! Enjoy yourself — you have earned it.'],
      love: ['Oh my! This is wonderful. Thank you, {name}!'],
      like: ["How thoughtful. I'll enjoy this."],
      neutral: ['Why, thank you.'],
      hate: ['Er... I appreciate the thought, I suppose.'],
    },
  },

  marta: {
    name: 'Marta',
    title: 'Shopkeeper',
    sprite: 'npc_marta',
    shop: 'store',
    schedule({ min, dow, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'bench_w');
      if (min < H(8) || min >= H(21)) return null;
      if (dow === 2) {
        // Wednesday: shop closed
        if (min < H(12)) return at('village', 'flowers', 2);
        if (min < H(16)) return at('inn', 'seat_d');
        return null;
      }
      if (min < H(17)) return at('store', 'keeper');
      if (min < H(19)) return at('village', 'bench_w', 1);
      return at('inn', 'seat_d');
    },
    gifts: {
      love: ['strawberry', 'pie', 'bouquet'],
      like: ['turnip', 'potato', 'egg', 'herb', 'tomato', 'berry'],
      hate: ['boot', 'mushroom'],
    },
    lines: {
      intro: ["A new face! I'm Marta, and this is my store. Seeds, bread, a little of everything."],
      any: [
        "Seeds only sell in their own season. Plant them before the season turns, or they'll wither!",
        'Each bag of seeds sows a 3 by 3 patch. Till the soil first!',
        "I've run this store for twenty years. My feet say it's been forty.",
        "Bread keeps you going. I bake it every morning at five.",
        'Wednesday is my day off. Even shopkeepers need to put their feet up.',
        "If you're ever short on stamina, a rice ball works wonders.",
      ],
      rain: ["Rainy days are slow in the store. I don't mind a bit of company."],
      spring: ['Turnips, potatoes, strawberries — spring has something for every patch.'],
      summer: ['Corn keeps producing all summer once it ripens. A good investment!'],
      fall: ['Fall seeds are in. Carrots are quick, pumpkins are worth the wait.'],
      winter: ["No seeds in winter, dear. The ground's asleep."],
      close: ["You're practically family now. Come by anytime, even just to chat."],
      closed: ["The store's closed right now. Open 9 to 5, every day but Wednesday."],
      festival: ['A day off AND a festival! Heaven.'],
      love: ["For me? Oh, you shouldn't have! This is lovely."],
      like: ['Thank you, dear. That was sweet of you.'],
      neutral: ['Oh, thank you.'],
      hate: ["Hmm. I'll... find a use for this."],
    },
  },

  theo: {
    name: 'Theo',
    title: 'Rancher',
    sprite: 'npc_theo',
    shop: 'ranch',
    schedule({ min, dow, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'fountain_e');
      if (min < H(6) || min >= H(21)) return null;
      if (dow === 6) {
        // Sunday: shop closed
        if (min < H(12) && !rain) return at('village', 'pasture', 3);
        if (min < H(18)) return at('inn', 'seat_b');
        return null;
      }
      if (min < H(10)) return rain ? at('ranch', 'keeper') : at('village', 'pasture', 3);
      if (min < H(16)) return at('ranch', 'keeper');
      if (min < H(19)) return at('inn', 'seat_b');
      return null;
    },
    gifts: {
      love: ['milk_l', 'stew', 'corn'],
      like: ['milk_m', 'carrot', 'egg', 'potato', 'fish_m'],
      hate: ['boot', 'moonflower', 'bouquet'],
    },
    lines: {
      intro: ["Name's Theo. I run the ranch. If you need chickens, cows or feed, I'm your man."],
      any: [
        'Animals need feed every day. Fill their troughs and they will reward you.',
        'Talk to your animals. Brush your cows. A happy cow gives the best milk.',
        "Chickens lay one egg a day when they're fed. Simple creatures, bless 'em.",
        'You can buy feed by the bag here. Keep your feed bin stocked.',
        "I've been up since four. Cows don't sleep in, so neither do I.",
        'You need a milker to milk a cow. Brushes are handy too.',
      ],
      rain: ["Rain's good for the grass. My cows'll eat well tomorrow."],
      spring: ['Spring calves are the cutest thing in the valley. Don’t tell the chickens.'],
      summer: ['Keep your animals indoors on stormy days. They get jumpy.'],
      fall: ['Fall is a good time to buy a cow. They settle in before winter.'],
      winter: ["Winter's when your animals really pay off. No crops, but eggs and milk every day."],
      close: ["You treat your animals right, {name}. That's all I ask of anyone."],
      closed: ['Ranch shop is open 10 to 4. Closed Sundays.'],
      festival: ["Festivals mean pie. I'm here for the pie."],
      love: ['Now THAT is a fine gift. Thank you kindly.'],
      like: ["Much obliged, {name}."],
      neutral: ['Thanks.'],
      hate: ['Uh... not really my thing, friend.'],
    },
  },

  bram: {
    name: 'Bram',
    title: 'Smith',
    sprite: 'npc_bram',
    shop: 'smithy',
    schedule({ min, dow, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'bench_e');
      if (min < H(7) || min >= H(23)) return null;
      if (dow === 5) {
        // Saturday: workshop closed, gathers wood
        if (min < H(16) && !rain) return at('forest', 'clearing', 3);
        if (min < H(22)) return at('inn', 'seat_c');
        return null;
      }
      if (min < H(10)) return at('village', 'smithy_front', 1);
      if (min < H(18)) return at('smithy', 'keeper');
      return at('inn', 'seat_c');
    },
    gifts: {
      love: ['stew', 'chestnut', 'fish_l'],
      like: ['potato', 'riceball', 'mushroom', 'corn', 'bread'],
      hate: ['bouquet', 'strawberry', 'moonflower'],
    },
    lines: {
      intro: ["Hrm. Bram. I fix tools, build things. Bring me lumber and coin and I'll make your farm grow."],
      any: [
        'A better tool does more work per swing. Hold the button to charge an upgraded tool.',
        'Chop stumps and branches on your farm. I pay nothing for lumber, but I build with it.',
        'I can expand your coop or barn. Bigger buildings, more animals.',
        'Iron, copper, gold. Each upgrade takes a day at the forge.',
        "The forge doesn't care about the weather. Neither do I.",
        'Boulders need a copper hammer at least. Stubborn things, like me.',
      ],
      rain: ["Rain on the roof, fire in the forge. Good day for work."],
      spring: ['Spring means everyone wants their hoe sharpened. Same every year.'],
      summer: ["It's hot in here. Hotter out there. Pick your poison."],
      fall: ['Stock up on lumber before winter.'],
      winter: ['Winter is quiet. Good time to upgrade your tools while the fields sleep.'],
      close: ["You work hard, {name}. I respect that. ...Don't make it weird."],
      closed: ['Workshop is open 10 to 6. Saturdays I go to the woods.'],
      festival: ["I don't dance. ...Fine. One dance."],
      love: ['...This is good. Really good. Thanks.'],
      like: ['Hm. Not bad. Thanks.'],
      neutral: ['Hm.'],
      hate: ['What am I supposed to do with this?'],
    },
  },

  june: {
    name: 'June',
    title: 'Florist',
    sprite: 'npc_june',
    schedule({ min, dow, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'fountain_s');
      if (min < H(8) || min >= H(21)) return null;
      if (rain) return min < H(18) ? at('inn', 'seat_e') : null;
      if (min < H(12)) return at('village', 'flowers', 2);
      if ((dow === 1 || dow === 4) && min < H(16)) return at('farm', 'june_visit', 2);
      if (min < H(16)) return at('forest', 'meadow', 3);
      if (min < H(18)) return at('village', 'june_garden', 1);
      return at('inn', 'seat_e');
    },
    gifts: {
      love: ['bouquet', 'moonflower', 'strawberry'],
      like: ['berry', 'herb', 'melon', 'pie', 'egg'],
      hate: ['boot', 'fish_s', 'fish_m', 'fish_l'],
    },
    lines: {
      intro: ["Oh, hello! I'm June. I grow flowers... and I talk to them. Is that strange? Don't answer that."],
      any: [
        "Every flower has a favourite time of day. Moonflowers only open when it's dark!",
        'I love walking through the forest meadow in the afternoon.',
        'Your farm used to be covered in wildflowers. I hope you leave a few!',
        "Do you think flowers dream? I think they dream in colours we can't see.",
        'The warm spring in the forest is my secret thinking spot. Well, not so secret now.',
        "I sometimes visit your farm on Tuesdays and Fridays. Your field looks happier every week!",
      ],
      rain: ['Rain makes everything smell so green. I love it.'],
      spring: ['The blossom trees are out! Spring is my favourite. Every season is my favourite.'],
      summer: ['Summer nights are for moonflowers. They glow in the forest after dark.'],
      fall: ['The leaves are like confetti in fall. The whole valley is celebrating!'],
      winter: ['I keep my flowers by the window in winter. They miss the sun, like me.'],
      close: ['I always feel brighter after we talk, {name}. Is that weird? I hope not.'],
      festival: ['Isn’t this wonderful? Everyone together, all at once!'],
      love: ["Oh! Oh, it's beautiful! Thank you so, so much!"],
      like: ['How lovely! Thank you, {name}.'],
      neutral: ['Oh, for me? Thank you!'],
      hate: ['Oh... um. Thank you? I think?'],
    },
  },

  pip: {
    name: 'Pip',
    title: 'Kid',
    sprite: 'npc_pip',
    schedule({ min, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'fountain_w', 2);
      if (min < H(8) || min >= H(19)) return null;
      if (rain) return min < H(17) ? at('inn', 'seat_f') : null;
      if (min < H(12)) return at('village', 'fountain_s', 3);
      if (min < H(15)) return at('village', 'pond', 2);
      return at('village', 'fountain_e', 3);
    },
    gifts: {
      love: ['berry', 'boot', 'melon'],
      like: ['strawberry', 'pie', 'corn', 'chestnut', 'bread', 'pinecone'],
      hate: ['eggplant', 'carrot', 'herb'],
    },
    lines: {
      intro: ["Whoa, you're the new farmer! I'm Pip. I'm eight and three quarters. Wanna race?"],
      any: [
        "I saw a HUGE fish in the pond once. It was gold! Nobody believes me.",
        'Mom says I have to eat my carrots. I say carrots are for horses.',
        "When I grow up I'm gonna be a pirate. Or a baker. Or a pirate baker!",
        "Did you know if you stand still long enough, butterflies land on you? It's true!",
        "Finn said he'd teach me to fish. He says I have to be quiet though. That's the hard part.",
        'I found a cool rock yesterday. I named it Gerald.',
      ],
      rain: ["I'm not allowed outside when it rains. It's SO boring."],
      spring: ['Spring means bugs! Good bugs. The best bugs.'],
      summer: ["Summer is the best 'cause there's no school! Wait, is there school? I forget."],
      fall: ['I jumped in a leaf pile and found a chestnut. Best day ever.'],
      winter: ['Snowball fight! ...Okay, you win. Don’t tell anyone.'],
      close: ["You're my best grown-up friend. Don't tell Finn."],
      festival: ['FESTIVAL! I ate three pies already! ...Four.'],
      love: ["WHOA! Is this for me?! You're the coolest!"],
      like: ['Neat! Thanks!'],
      neutral: ['Oh. Okay. Thanks!'],
      hate: ['Blech! Gross! Why would you give me THIS?'],
    },
  },

  rosa: {
    name: 'Rosa',
    title: 'Innkeeper',
    sprite: 'npc_rosa',
    shop: 'inn',
    schedule({ min, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'fountain_s', 1);
      if (min < H(8) || min >= H(23)) return null;
      if (min < H(10, 30)) return at('store', 'customer');
      return at('inn', 'keeper');
    },
    gifts: {
      love: ['melon', 'pie', 'egg_gold'],
      like: ['tomato', 'eggplant', 'mushroom', 'herb', 'milk_s', 'milk_m', 'milk_l', 'egg'],
      hate: ['boot'],
    },
    lines: {
      intro: ["Welcome to the Lantern Inn! I'm Rosa. Hungry? Tired? Both? You're in the right place."],
      any: [
        "Everyone ends up at the inn eventually. It's the only place with a fire AND gossip.",
        'My stew recipe has eleven ingredients. I will take the twelfth to my grave.',
        "Farm-fresh eggs make the best omelettes. If you've got spare, I won't say no!",
        'Bram comes in every evening and orders the same thing. Every. Evening.',
        "A hot meal restores more than a nap. Trust me, I'm a professional.",
        "Hollis tells the same story about the great flood every week. It gets bigger each time.",
      ],
      rain: ['Rainy days are good for business. Everyone wants soup.'],
      spring: ['Spring greens make a lovely salad. If only anyone ordered salad.'],
      summer: ['Cold tea is my summer special. Nobody believes I make it with mint from my windowsill.'],
      fall: ['Pumpkin soup season! My favourite time of year.'],
      winter: ['Come in, come in, warm up by the fire.'],
      close: ["You've got a permanent seat by the fire, {name}. On the house. ...The seat, not the food."],
      closed: ['The kitchen opens at 10:30. Come back in a bit!'],
      festival: ['I made seven pies for today. Pip ate two before breakfast.'],
      love: ["Ooh! I know exactly what I'll cook with this. Thank you!"],
      like: ['Oh, how nice! Thank you, love.'],
      neutral: ['Thanks, hon.'],
      hate: ["I run an inn, not a rubbish tip, dear."],
    },
  },

  finn: {
    name: 'Finn',
    title: 'Fisherman',
    sprite: 'npc_finn',
    schedule({ min, rain, festival }) {
      if (festival && min >= H(9) && min < H(18)) return at('village', 'pond', 1);
      if (min < H(5) || min >= H(21)) return null;
      if (rain) return min < H(20) ? at('inn', 'seat_c') : null;
      if (min < H(12)) return at('forest', 'river_bank');
      if (min < H(14)) return at('inn', 'seat_b');
      if (min < H(18)) return at('forest', 'pond_bank');
      return at('forest', 'cabin_front', 1);
    },
    gifts: {
      love: ['fish_l', 'fish_gold', 'riceball'],
      like: ['fish_m', 'bamboo', 'snowroot', 'stew', 'bread'],
      hate: ['boot', 'bouquet'],
    },
    lines: {
      intro: ["Shh... you'll scare the fish. ...Oh, you're the new farmer? I'm Finn."],
      any: [
        "Cast your line, wait for the bobber to dip, then pull. Timing's everything.",
        'Bigger fish bite in the early morning. Or so my grandpa said. He also said a lot of things.',
        "They say there's a golden koi in these waters. I've seen it once. Maybe.",
        'The river and the pond have different fish. Try both.',
        "I pulled out an old boot last week. Pip wanted it. Kids are weird.",
        'Quiet mornings on the water... nothing better.',
      ],
      rain: ['Fish bite less in the rain. Good day for the inn.'],
      spring: ['Spring water is cold and clear. The trout love it.'],
      summer: ['In summer I fish at dawn, before the heat.'],
      fall: ['Fall fish are fat and lazy. Easy pickings.'],
      winter: ["The water's freezing but the fish don't care."],
      close: ["You're good company, {name}. You know when to be quiet."],
      festival: ["Festivals are loud. I'm staying by the pond."],
      love: ['Whoa... now that is a catch. Thanks, {name}.'],
      like: ['Oh, nice. Thanks.'],
      neutral: ['...Thanks.'],
      hate: ["I've got plenty of these, thanks."],
    },
  },
};

export const NPC_IDS = Object.keys(NPCS);

export const SHOPS = {
  store: {
    keeper: 'marta',
    name: "Marta's General Store",
    short: 'General Store',
    open: [H(9), H(17)],
    closedDow: [2],
  },
  ranch: {
    keeper: 'theo',
    name: "Theo's Ranch Supply",
    short: 'Ranch Supply',
    open: [H(10), H(16)],
    closedDow: [6],
  },
  smithy: {
    keeper: 'bram',
    name: "Bram's Workshop",
    short: "Bram's Workshop",
    open: [H(10), H(18)],
    closedDow: [5],
  },
  inn: {
    keeper: 'rosa',
    name: 'The Lantern Inn',
    short: 'Lantern Inn',
    open: [H(10, 30), H(22)],
    closedDow: [],
  },
};

export const FESTIVALS = {
  spring: { day: 8, name: 'Blossom Day', desc: 'The village celebrates the first blossoms around the fountain.' },
  summer: { day: 15, name: 'Firefly Night', desc: 'Everyone gathers in the plaza to welcome the fireflies.' },
  fall: { day: 20, name: 'Harvest Fair', desc: "A feast to give thanks for the season's harvest." },
  winter: { day: 24, name: 'Starlight Eve', desc: 'Lanterns and warm cider under the winter stars.' },
};
