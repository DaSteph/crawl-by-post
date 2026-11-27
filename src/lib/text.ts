/** All UI text lives here (English only for now), so translation is possible later. */
export const text = {
	appName: 'crawl-by-post',
	tagline: 'Asynchronous OSR dungeon crawls in short, phone-sized turns.',
	sourceLink: 'Source code',
	license: 'AGPL-3.0',

	start: {
		title: 'Start a new session',
		nameLabel: 'Session name',
		namePlaceholder: 'e.g. The Lost Citadel',
		dungeonLabel: 'Dungeon',
		dungeonPlaceholder: 'Pick a dungeon',
		noDungeons:
			'No dungeon files found. Put .yaml or .json files into the dungeon directory on the server (DUNGEONS_DIR).',
		invalidDungeons: 'These dungeon files have errors and can’t be picked:',
		submit: 'Create session',
		noAccount: 'No account needed. You get a secret GM link instead.'
	},

	saveLink: {
		title: 'Save this link',
		intro: 'This is your GM link for',
		warning:
			'It is the only key to your session. Nobody can recover it if you lose it, so bookmark it or store it somewhere safe now.',
		copy: 'Copy link',
		copied: 'Copied',
		open: 'I saved it, open the session'
	},

	session: {
		youAreGm: 'You are the GM',
		youArePlayer: (seat: number) => `You are player ${seat}`,
		players: 'Players',
		noPlayers: 'No players yet. Add 2–4 players and send each one their own link.',
		addPlayer: 'Add player',
		tableFull: 'The table is full (4 players).',
		player: (seat: number) => `Player ${seat}`,
		linkHint: 'Send each player their own link. Anyone with a link can play that seat.'
	},

	map: {
		label: (dungeon: string, explored: number) =>
			`Map of ${dungeon}. ${explored} ${explored === 1 ? 'area' : 'areas'} explored.`,
		unavailable: 'The dungeon is unavailable right now. Ask your GM.',
		gmErrors: 'The dungeon file can’t be loaded:',
		gmHint: 'Dashed walls are not revealed yet. Only you see them, and the S marks secret doors.',
		areas: 'Rooms and corridors',
		corridor: (id: string) => `Corridor ${id}`,
		revealed: 'revealed',
		hidden: 'hidden',
		mood: 'Read-aloud',
		notes: 'GM notes',
		monsters: 'Monsters',
		unknown: 'Unknown area behind a doorway',
		moveTo: (area: string | null, col: number, row: number) =>
			`Move here: ${area ? `${area}, ` : ''}column ${col}, row ${row}`,
		moveToDoorway: 'Move to this doorway. The GM reveals what lies beyond.',
		moveHint: 'Tap a square to move your token, then post what you do. A “?” is unexplored: you stop at its doorway.',
		moving: 'Moving…',
		badMove: 'Tap a square on the map to move.',
		reveal: 'Reveal',
		hide: 'Hide',
		revealHint: 'Revealing drafts the read-aloud text into your post box. Edit it, then post.',
		atDoorway: 'At a doorway',
		waitingAt: (who: string, area: string) => `${who} waits at the way into ${area}.`,
		monsterToken: (id: string, name: string, condition: string) => `${id}, ${name}, ${condition}`,
		selectMonster: (id: string, name: string) => `${id}, ${name}: select to move`,
		unnamedRoom: 'a room',
		unnamedPassage: 'a passage',
		darkHint: 'Hatched areas are dark: no light burns there.'
	},

	light: {
		title: 'Light',
		levels: { bright: 'Bright', flickering: 'Flickering', guttering: 'Guttering' },
		yourTorch: (level: string) => `Your torch: ${level}`,
		torchOf: (name: string, level: string) => `${name}’s torch: ${level}`,
		youInDarkness: 'You: in darkness',
		inDarkness: (name: string) => `${name}: in darkness`,
		none: 'No light burns.',
		lightTorch: 'Light a torch',
		lightHint: 'Take a torch from your inventory and cross it off there. It burns for a secret number of turns.',
		carrying: 'carries a light',
		counters: 'Torch counters',
		countersHint:
			'Only you see these. Each counter ticks once per player action, in combat once per round; 0 puts the light out.',
		goingOut: (turns: number) =>
			turns === 1 ? 'Burnt down: goes out when the next player turn starts.' : `Burnt down: goes out in ${turns} player turns.`,
		counterLabel: (name: string) => `${name}’s torch`,
		save: 'Save',
		areaLabel: 'Light',
		overrides: { auto: 'Carried light', lit: 'Always lit', dark: 'Always dark' },
		overrideHint: 'Rule on special light here: daylight, magic, a fire.',
		lit: 'lit',
		dark: 'dark',
		darkPreset: (name: string) => `🌑 ${name} is in darkness: disadvantage preset.`,
		monsterDarkPreset: (name: string) => `🌑 ${name} is in darkness: advantage preset.`
	},

	character: {
		importTitle: 'Your character',
		importIntro:
			'Export your character from Shadowdarklings (the JSON download) and upload the file here. Your token appears in the start room.',
		fileLabel: 'Shadowdarklings JSON export',
		importSubmit: 'Import character',
		importFailed: 'The character could not be imported:',
		noFile: 'Choose your Shadowdarklings .json file first.',
		tooLarge: 'That file is too large to be a Shadowdarklings export.',
		summary: (ancestry: string, className: string, level: number) =>
			[ancestry, className, `level ${level}`].filter(Boolean).join(' · '),
		hp: 'HP',
		ac: 'AC',
		abilities: 'Abilities',
		weapons: 'Weapons',
		weaponLine: (bonus: string, range: string | null, damage: string, props: string[]) =>
			[`${bonus} to hit`, range, `${damage} damage`, ...props].filter(Boolean).join(' · '),
		ranges: { close: 'close', near: 'near', far: 'far' },
		spells: 'Spells',
		spellcasting: (bonus: string) => `Spellcasting check: d20 ${bonus}`,
		gear: 'Gear',
		treasures: 'Treasure',
		languages: 'Languages',
		readOnly: 'From your Shadowdarklings export, read-only.',
		inventory: 'Inventory',
		inventoryHint: 'Free text: loot, used-up items, notes. Only you can edit it.',
		inventorySave: 'Save inventory',
		inventorySaved: 'Saved',
		characters: 'Characters',
		noCharacter: 'No character imported yet.',
		token: (initials: string, seat: number) => `${initials}, player ${seat}`,
		spotlightToken: (initials: string, seat: number) => `${initials}, player ${seat}, has the spotlight`,
		dyingToken: 'dying',
		dying: 'Dying',
		dyingHint: 'At 0 HP. The GM rules on what happens.',
		setHp: 'Set HP',
		setHpHint: 'Your ruling: healing, stabilising, or any other change.',
		save: 'Save'
	},

	monsters: {
		title: 'Monsters',
		inSight: 'Monsters in sight',
		none: 'No monsters on the map.',
		place: (label: string) => `Place ${label}`,
		listed: (count: string, name: string, label: string) => `${count} × ${name} (${label})`,
		placeHint: 'HP is rolled when you place a monster. You can edit it below the map.',
		conditions: { unhurt: 'unhurt', wounded: 'wounded', nearDeath: 'near death', down: 'down' },
		hp: 'HP',
		maxHp: 'Max HP',
		ac: 'AC',
		saveHp: 'Save HP',
		move: 'Move',
		moving: (id: string) => `Tap a square to move ${id}.`,
		cancelMove: 'Cancel',
		remove: 'Remove',
		attackTitle: 'Attack',
		attackOption: 'Attack',
		attackTarget: 'Target',
		attackHint: 'Rolled in the open against the character’s AC and locked in the log. Damage waits for your confirmation.',
		attackNotNow: 'Monsters attack in your turn.',
		attackRoll: 'Roll attack',
		noAttacks: 'This monster has no attacks.',
		attackLine: (count: number, name: string, bonus: number | null, damage: string | null, effect: string | null) =>
			[
				`${count > 1 ? `${count} ` : ''}${name}${bonus === null ? '' : ` ${bonus < 0 ? '−' : '+'}${Math.abs(bonus)}`}`,
				damage,
				effect
			]
				.filter(Boolean)
				.join(' · ')
	},

	hp: {
		title: 'HP changes to confirm',
		intro: 'Nothing changes until you confirm. Adjust the number first if your ruling differs.',
		monster: (id: string, name: string) => `${id} ${name}`,
		preview: (from: number, to: number, condition: string | null) =>
			`${from} → ${to} HP${condition ? ` (${condition})` : ''}`,
		amount: 'Damage',
		confirm: 'Confirm',
		dismiss: 'Dismiss'
	},

	crawl: {
		notStarted: 'The crawl hasn’t started yet.',
		notStartedPlayer: 'The GM starts the crawl once everyone has imported a character. You can chat until then.',
		startTitle: 'Start crawl',
		startIntro:
			'Initiative is rolled for every imported character (d20 + DEX). The winner goes first, then seat order, with your turn between every player turn.',
		dangerLabel: 'Danger level',
		dangers: { unsafe: 'Unsafe', risky: 'Risky', deadly: 'Deadly' },
		dangerHints: {
			unsafe: 'Wandering monsters checked every 3 rounds',
			risky: 'Wandering monsters checked every 2 rounds',
			deadly: 'Wandering monsters checked every round'
		},
		start: 'Start crawl',
		restartTitle: 'New crawl',
		restartHint: 'Rerolls initiative and resets the round count.',
		yourTurnGmOpens: 'Your turn: the monsters act first',
		status: (danger: string, round: number) => `Crawl · ${danger} · Round ${round}`,
		combatStatus: (round: number) => `Combat · Round ${round}`,
		yourTurn: 'Your turn',
		yourTurnGm: 'Your turn: respond or pass',
		gmTurn: 'The GM’s turn',
		playerTurn: (name: string) => `${name}’s turn`,
		waitingFor: (name: string) => `Waiting for ${name}`,
		timeLeft: (hours: number) => (hours < 1 ? 'under 1 h left' : `${hours} h left`),
		timedOut: 'timed out: the GM decides'
	},

	combat: {
		banner: 'Combat',
		start: 'Start combat',
		startHint:
			'Rolls initiative: every character d20 + DEX, the monsters once (d20 + their best DEX). If the monsters win, your turn opens the fight. Light ticks once per round, and wandering monster checks pause.',
		endTitle: 'End combat',
		endHint: 'Starts a new crawl right away, with fresh initiative.',
		end: 'End combat, start crawl',
		openingHint: 'The monsters won initiative. Have them act, then post or pass to hand on to the first player.'
	},

	wandering: {
		due: 'Wandering monster check due',
		postponed: 'Wandering monster check postponed',
		dueIntro: (name: string) => `${name} rolls 1d6 for it. On a 1, a wandering monster turns up.`,
		postponedIntro: 'It comes back when this round completes. You can still set it now.',
		notYourTurn: 'You can set it in your turn. Postponing or skipping works any time.',
		whoLabel: 'Who rolls',
		next: 'next',
		set: (name: string) => `Set check for ${name}`,
		setRoll: (name: string) => `Set check, ${name} rolls now`,
		postpone: 'Postpone',
		skip: 'Skip',
		badDecision: 'Pick set, postpone or skip.',
		checkName: 'Wandering monster check (1d6)',
		rollHint: 'Roll 1d6. On a 1, a wandering monster turns up. The result is locked in the log.',
		placeTitle: 'Wandering monsters',
		placeHint: 'From the dungeon file. Placed on the first free square of the area you pick.',
		areaLabel: 'Area',
		place: (name: string) => `Place ${name}`
	},

	timeout: {
		title: (name: string) => `${name}’s turn timed out`,
		intro: 'An absent player is a ruling, not a punishment. You decide what happens.',
		skip: 'Skip this turn',
		wait: (hours: number) => `Wait another ${hours} h`,
		playAs: (name: string) => `Play ${name}`,
		playAsLabel: (name: string) => `What does ${name} do?`,
		playAsPlaceholder: 'Keep it in character and cautious',
		playAsNote: 'Posted as their action, marked “played by the GM” in the log.',
		postAs: (name: string) => `Post for ${name}`,
		rollFor: (name: string) => `Roll for ${name}`,
		rollDamageFor: (name: string) => `Roll damage for ${name}`,
		cancel: 'Back',
		settingsTitle: 'Turn timeout',
		settingsHint: (hours: number) =>
			`Each turn, yours included, may take ${hours} h. The one holding the spotlight is reminded at half time. Your turn passes by itself when it runs out; for a player’s turn, you decide.`,
		hoursLabel: 'Hours per turn',
		save: 'Save',
		saved: 'Saved'
	},

	challenge: {
		title: 'Set a challenge',
		intro: (name: string) => `For ${name}, in response to their action.`,
		preConsented: (name: string) => `${name} will roll whatever you set: the roll happens right away.`,
		typeLabel: 'Type',
		test: 'Test',
		attack: 'Attack',
		abilityLabel: 'Ability',
		weaponLabel: 'Weapon',
		noWeapons: 'This character has no weapons to attack with.',
		dcLabel: 'DC',
		dcHintAttack: 'For an attack, use the target’s AC.',
		customDc: 'Other DC',
		edgeLabel: 'Advantage',
		edges: { none: 'Neither', advantage: 'Advantage', disadvantage: 'Disadvantage' },
		stakesLabel: 'Stakes',
		stakesPlaceholder: 'e.g. If you fail, the floor gives way',
		submit: 'Set challenge',
		submitRoll: 'Set challenge and roll',
		testName: (ability: string) => `${ability} test`,
		attackName: (weapon: string) => `Attack with ${weapon}`,
		attackTargetName: (weapon: string, target: string) => `Attack ${target} with ${weapon}`,
		targetLabel: 'Target',
		otherTarget: 'Something else',
		dcFromAc: (ac: number) => `DC is the target’s AC: ${ac}`,
		edgeNote: { advantage: 'with advantage', disadvantage: 'with disadvantage' },
		yourChallenge: 'The GM sets a challenge',
		waiting: (name: string) => `${name} decides whether to roll.`,
		accept: 'Roll',
		decline: 'Back out',
		acceptHint: 'You roll d20 + your modifier. The result is locked in the log.',
		hit: 'Hit! Roll your damage.',
		rollDamage: (formula: string) => `Roll damage (${formula})`,
		waitingDamage: (name: string) => `${name} rolls damage.`,
		preConsent: 'I’ll roll whatever you set',
		preConsentHint: 'If the GM sets a challenge, you roll it right away.'
	},

	log: {
		title: 'Log',
		empty: 'Nothing has happened yet.',
		earlier: (n: number) => `Show ${n} earlier`,
		crawlStarted: (danger: string) => `A new crawl begins. Danger: ${danger}.`,
		initiative: 'Initiative',
		rollLine: (d20: number, modifier: number, total: number) =>
			`d20 ${d20} ${modifier < 0 ? '−' : '+'} ${Math.abs(modifier)} = ${total}`,
		rollOff: (rolls: string) => `Tie, rolled off: ${rolls}`,
		goesFirst: (name: string) => `${name} goes first.`,
		monstersInitiative: 'Monsters',
		monstersFirst: (name: string) => `The monsters go first, then ${name}.`,
		combatStarted: '⚔️ Combat! Light now burns down once per round.',
		combatEnded: 'The fight is over.',
		round: (n: number) => `Round ${n}`,
		pass: 'The GM passes.',
		autoPass: 'The GM’s turn timed out and passes on.',
		timedOut: (name: string) => `${name}’s turn timed out. The GM decides.`,
		timeoutResolved: {
			skip: (name: string) => `The GM skips ${name}’s turn.`,
			wait: (name: string) => `The GM waits longer for ${name}.`,
			playAs: (name: string) => `The GM plays ${name} this turn.`
		},
		timeoutChanged: (hours: number) => `The GM sets the turn timeout to ${hours} h.`,
		playedByGm: 'played by the GM',
		doorway: (name: string) => `${name} stops at a doorway.`,
		revealed: (area: string) => `The GM reveals ${area}.`,
		chat: 'chat',
		chatRun: (n: number) => `+${n} chat messages`,
		hideChat: 'Hide chat',
		challenge: (name: string) => `Challenge for ${name}`,
		roll: (name: string) => `${name} rolls`,
		committedRollLine: (sides: number, result: number) => `d${sides} ${result}`,
		wanderingMonster: 'A wandering monster turns up!',
		noWanderingMonster: 'Nothing turns up.',
		d20s: (rolls: number[], kept: number) =>
			rolls.length > 1 ? `d20 ${rolls.join(' / ')} → ${kept}` : `d20 ${kept}`,
		modifier: (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`,
		total: (total: number, dc: number) => `= ${total} vs DC ${dc}`,
		success: 'Success',
		failure: 'Failure',
		declined: (name: string) => `${name} backs out.`,
		damage: (name: string, weapon: string) => `${name} rolls damage with ${weapon}`,
		damageLine: (formula: string, rolls: number[], total: number) => `${formula}: ${rolls.join(' + ') || '0'} → ${total}`,
		damageTarget: (name: string, weapon: string, target: string) => `${name} hits ${target} with ${weapon}`,
		monsterAttack: (monster: string, name: string) => `${monster} attacks ${name}`,
		strike: (attack: string) => attack,
		vsAc: (total: number, ac: number) => `= ${total} vs AC ${ac}`,
		hit: 'Hit',
		miss: 'Miss',
		monsterHurt: (monster: string, condition: string) => `${monster} is ${condition}.`,
		characterHurt: (name: string, amount: number) => `${name} loses ${amount} HP.`,
		dying: (name: string) => `${name} is dying. The GM rules on what happens.`,
		torchLit: (name: string) => `${name} lights a torch.`,
		torchOut: (name: string) => `${name}’s torch goes out.`,
		readMore: 'Read more',
		readLess: 'Show less',
		gm: 'GM'
	},

	compose: {
		label: 'Your post',
		placeholderTurn: 'What do you do?',
		placeholderGm: 'Describe what happens',
		placeholderChat: 'Table talk',
		postTurn: 'Post turn',
		postResponse: 'Post response',
		pass: 'Pass',
		postChat: 'Post as chat',
		outOfTurn: 'It’s not your turn, so this goes into the log as quiet chat.',
		count: (n: number, over: number) => `${n} / ${over}`,
		tooLong: 'Long post: shorter turns keep the game moving.',
		offline: 'You’re offline. Your text is kept here; post it once you’re connected again.',
		failed: 'That didn’t go through. Your text is kept here; try again.'
	},

	push: {
		yourTurn: 'Your turn. What do you do?',
		gmTurn: (name: string) => `${name} acted. Respond or pass.`,
		gmOpens: 'Combat! The monsters won initiative: your turn opens the fight.',
		challenge: 'The GM sets a challenge for you. Roll or back out.',
		damage: 'Hit! Roll your damage.',
		reminder: (body: string) => `Reminder: ${body}`,
		playerTimedOut: (name: string) => `${name}’s turn timed out. Skip, wait or play for them.`,
		testTitle: 'crawl-by-post',
		testBody: 'Test notification: you’re all set.'
	},

	onboarding: {
		title: 'Get notified when it’s your turn',
		intro: 'Turns can be days apart. Set this up once on each device you play on, and you get a notification whenever the spotlight passes to you.',
		later: 'Later',
		done: 'Done',
		setUp: 'Set up notifications',
		offLine: 'Notifications are off on this device.',
		onLine: 'Notifications are on for this device.',
		step: (n: number, total: number) => `Step ${n} of ${total}`,
		installTitle: 'Add to your home screen',
		installIos: [
			'Tap the Share button in Safari (the square with an arrow pointing up).',
			'Choose “Add to Home Screen”, then tap “Add”.',
			'Close Safari and open crawl-by-post from your home screen. This setup continues there.'
		],
		iosWhy: 'On iPhone and iPad, notifications only work in the home screen app, not in a Safari tab.',
		installAndroid: 'Optional, but handy: the app opens straight into this session.',
		installAndroidSteps: 'Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.',
		installButton: 'Install app',
		skipInstall: 'Skip',
		permissionTitle: 'Allow notifications',
		permissionIntro: 'Your browser asks for permission. Choose “Allow”.',
		permissionButton: 'Allow notifications',
		permissionWorking: 'Waiting for your answer…',
		denied:
			'Notifications are blocked for this site. Allow them in your browser or system settings for this app, then reload.',
		testTitle: 'Send a test notification',
		testIntro: 'Check that notifications really reach this device.',
		testButton: 'Send test notification',
		testSending: 'Sending…',
		testWaiting: 'Sent. Waiting for it to arrive…',
		testReceived: 'It arrived. You’ll be notified when it’s your turn.',
		testSawIt: 'I saw the notification',
		testRetry: 'Send again',
		testFailed: 'The test notification couldn’t be sent. Try again in a moment.',
		subscribeFailed: 'This device couldn’t be registered for notifications. Try again.',
		unsupported: 'This browser can’t receive push notifications. Try a current Chrome, Firefox, Edge or Safari.',
		notConfigured: 'Push notifications aren’t set up on this server yet. Ask whoever runs it.'
	},

	colours: {
		blue: 'blue',
		purple: 'purple',
		green: 'green',
		magenta: 'magenta'
	},

	errors: {
		badLinkTitle: 'This link does not work',
		badLink:
			'Check that you copied the whole link. If it still does not work, ask your GM for a new one.',
		genericTitle: 'Something went wrong',
		home: 'Go to the start page'
	}
} as const;
