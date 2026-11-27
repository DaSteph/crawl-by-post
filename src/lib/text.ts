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
		monsters: 'Monsters'
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
		token: (initials: string, seat: number) => `${initials}, player ${seat}`
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
