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
		unnamedRoom: 'a room',
		unnamedPassage: 'a passage'
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
		spotlightToken: (initials: string, seat: number) => `${initials}, player ${seat}, has the spotlight`
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
		status: (danger: string, round: number) => `Crawl · ${danger} · Round ${round}`,
		yourTurn: 'Your turn',
		yourTurnGm: 'Your turn: respond or pass',
		gmTurn: 'The GM’s turn',
		playerTurn: (name: string) => `${name}’s turn`,
		waitingFor: (name: string) => `Waiting for ${name}`,
		timeLeft: (hours: number) => (hours < 1 ? 'under 1 h left' : `${hours} h left`),
		timedOut: 'timed out: the GM decides'
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
		d20s: (rolls: number[], kept: number) =>
			rolls.length > 1 ? `d20 ${rolls.join(' / ')} → ${kept}` : `d20 ${kept}`,
		modifier: (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`,
		total: (total: number, dc: number) => `= ${total} vs DC ${dc}`,
		success: 'Success',
		failure: 'Failure',
		declined: (name: string) => `${name} backs out.`,
		damage: (name: string, weapon: string) => `${name} rolls damage with ${weapon}`,
		damageLine: (formula: string, rolls: number[], total: number) => `${formula}: ${rolls.join(' + ') || '0'} → ${total}`,
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
