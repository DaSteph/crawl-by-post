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
		waitingFor: (name: string) => `Waiting for ${name}`
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
		doorway: (name: string) => `${name} stops at a doorway.`,
		revealed: (area: string) => `The GM reveals ${area}.`,
		chat: 'chat',
		chatRun: (n: number) => `+${n} chat messages`,
		hideChat: 'Hide chat',
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
