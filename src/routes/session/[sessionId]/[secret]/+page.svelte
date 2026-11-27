<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { cellsOf, type Cell } from '#lib/dungeon/model.ts';
	import type { MapArea } from '#lib/engine/map.ts';
	import type { Moves } from '#lib/engine/movement.ts';
	import MonsterPanel from '#lib/monsters/MonsterPanel.svelte';
	import HpChanges from '#lib/monsters/HpChanges.svelte';
	import TorchTracker from '#lib/light/TorchTracker.svelte';
	import { DANGER_LEVELS } from '#lib/engine/turns.ts';
	import Compose from '#lib/turn/Compose.svelte';
	import Log from '#lib/turn/Log.svelte';
	import ChallengeForm from '#lib/turn/ChallengeForm.svelte';
	import ChallengePrompt from '#lib/turn/ChallengePrompt.svelte';
	import TimeoutPrompt from '#lib/turn/TimeoutPrompt.svelte';
	import { MAX_TURN_TIMEOUT_HOURS, MIN_TURN_TIMEOUT_HOURS } from '#lib/engine/timeouts.ts';
	import CopyLink from '#lib/CopyLink.svelte';
	import CharacterCard from '#lib/character/CharacterCard.svelte';
	import { MAX_INVENTORY_LENGTH, MAX_PLAYERS } from '#lib/engine/index.ts';
	import DungeonMap from '#lib/map/DungeonMap.svelte';
	import Onboarding from '#lib/push/Onboarding.svelte';
	import { text } from '#lib/text.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const visitor = $derived(data.visitor);
	const ownSheet = $derived(visitor.role === 'player' ? (data.sheets[0] ?? null) : null);
	const sheetBySeat = $derived(new Map(data.sheets.map((s) => [s.seat, s])));
	let importing = $state(false);
	let savingInventory = $state(false);
	let startingCrawl = $state(false);
	let savingTimeout = $state(false);
	let moving = $state(false);
	let moveForm: HTMLFormElement | undefined = $state();
	let moveTarget = $state<Cell | null>(null);
	let compose: ReturnType<typeof Compose> | undefined = $state();
	/** The area whose reveal or hide is on its way. */
	let revealing = $state<string | null>(null);
	let placing = $state(false);
	/** GM: the monster whose new square is being picked on the map. */
	let movingMonster = $state<string | null>(null);
	let monsterMoveForm: HTMLFormElement | undefined = $state();
	let monsterTarget = $state<Cell | null>(null);

	const mapView = $derived(data.map.ok ? data.map.view : null);
	const ownToken = $derived(
		visitor.role === 'player' ? (mapView?.tokens.find((t) => t.seat === visitor.seat) ?? null) : null
	);
	/** Seats standing in an area without light. */
	const darkSeats = $derived(mapView?.tokens.filter((t) => t.dark).map((t) => t.seat) ?? []);
	const focusCell = $derived(ownToken?.cell ?? mapView?.tokens.find((t) => t.spotlight)?.cell ?? null);

	function areaName(id: string) {
		const area = mapView?.areas.find((a) => a.id === id);
		return area?.name ?? (area?.kind === 'corridor' ? text.map.unnamedPassage : text.map.unnamedRoom);
	}

	/** GM: tokens standing at the way into an unknown area, so the reveal is one tap away. */
	const waiting = $derived(
		visitor.role !== 'gm' || !mapView
			? []
			: mapView.unknown.flatMap((u) => {
					const seats = mapView.tokens.filter((t) => t.cell.x === u.doorway.x && t.cell.y === u.doorway.y);
					const area = mapView.areas.find((a) => a.id === u.area);
					return seats.length && area ? [{ area, who: seats.map((t) => nameOf(t.seat)).join(', ') }] : [];
				})
	);

	/** GM: every free square of the dungeon, while a monster is being moved. */
	const monsterMoves = $derived.by((): Moves | null => {
		if (!movingMonster || !mapView) return null;
		const view = mapView;
		const taken = new Set([...view.tokens, ...view.monsters].map((t) => `${t.cell.x},${t.cell.y}`));
		const cells = view.areas.flatMap((a) => cellsOf(a.rect)).filter((c) => !taken.has(`${c.x},${c.y}`));
		return { cells, doorways: [] };
	});

	async function moveMonster(cell: Cell) {
		if (moving || !monsterMoveForm) return;
		monsterTarget = cell;
		await tick();
		monsterMoveForm.requestSubmit();
	}

	async function move(cell: Cell) {
		if (moving || !moveForm) return;
		moveTarget = cell;
		await tick();
		moveForm.requestSubmit();
	}

	const me = $derived(visitor.role === 'gm' ? 'gm' : visitor.role === 'player' ? visitor.seat : null);
	const crawl = $derived(data.crawl);
	const holder = $derived(crawl ? (crawl.spotlight.kind === 'gm' ? 'gm' : crawl.spotlight.seat) : null);
	const spotlight = $derived(crawl?.spotlight ?? null);
	/** True when the visitor's turn is a post, not accepting a challenge or rolling damage. */
	const acting = $derived(
		(spotlight?.kind === 'player' && spotlight.seat === me) || (spotlight?.kind === 'gm' && me === 'gm')
	);
	/** GM: the character a challenge would go to, in the GM's turn. */
	const challengeSheet = $derived(
		visitor.role === 'gm' && spotlight?.kind === 'gm' ? (sheetBySeat.get(spotlight.afterSeat) ?? null) : null
	);
	const nameOf = (seat: number) => data.people.find((p) => p.seat === seat)?.name ?? text.session.player(seat);
	const turnLine = $derived.by(() => {
		if (holder === null) return null;
		if (holder === me) return me === 'gm' ? text.crawl.yourTurnGm : text.crawl.yourTurn;
		if (holder === 'gm') return text.crawl.gmTurn;
		return me === 'gm' ? text.crawl.waitingFor(nameOf(holder)) : text.crawl.playerTurn(nameOf(holder));
	});

	const timer = $derived(data.timer);
	/** GM: the timed-out player's turn waiting for a decision. */
	const timedOutTurn = $derived(
		visitor.role === 'gm' && timer.timedOut && spotlight && spotlight.kind !== 'gm' ? spotlight : null
	);
	const timeLine = $derived.by(() => {
		if (!crawl) return null;
		if (timer.timedOut) return text.crawl.timedOut;
		if (!timer.timeoutAt) return null;
		return text.crawl.timeLeft(Math.floor((Date.parse(timer.timeoutAt) - Date.now()) / 3600_000));
	});

	// No live updates: refresh when the app comes back into view, or when a turn push arrives.
	onMount(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible') invalidateAll();
		};
		const onPush = (e: MessageEvent) => {
			if (e.data?.type === 'push') invalidateAll();
		};
		document.addEventListener('visibilitychange', refresh);
		navigator.serviceWorker?.addEventListener('message', onPush);
		return () => {
			document.removeEventListener('visibilitychange', refresh);
			navigator.serviceWorker?.removeEventListener('message', onPush);
		};
	});
</script>

<svelte:head>
	<title>{visitor.sessionName} · {text.appName}</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<header class="stack">
	<h1>{visitor.sessionName}</h1>
	{#if visitor.role === 'gm'}
		<p class="role"><span class="badge">GM</span> {text.session.youAreGm}</p>
	{:else if visitor.role === 'player'}
		<p class="role">
			<span class="token {visitor.tokenColour}">{ownSheet?.initials ?? `P${visitor.seat}`}</span>
			{text.session.youArePlayer(visitor.seat)} ({text.colours[visitor.tokenColour]})
		</p>
	{/if}
</header>

<Onboarding base="/session/{page.params.sessionId}/{page.params.secret}" />

<section class="turn" class:mine={holder !== null && holder === me} aria-live="polite">
	{#if crawl && turnLine}
		<strong>{turnLine}</strong>
		<span class="muted small"
			>{text.crawl.status(text.crawl.dangers[crawl.danger], crawl.round)}{#if timeLine} · {timeLine}{/if}</span
		>
	{:else}
		<strong>{text.crawl.notStarted}</strong>
		{#if visitor.role === 'player'}<span class="muted small">{text.crawl.notStartedPlayer}</span>{/if}
	{/if}
</section>

{#snippet revealForm(area: MapArea)}
	<form
		method="POST"
		action="?/reveal"
		use:enhance={() => {
			revealing = area.id;
			const revealingNow = !area.revealed;
			const mood = area.mood;
			return async ({ result, update }) => {
				await update({ reset: false });
				revealing = null;
				// The mood text becomes an editable draft; it is never posted by itself.
				if (result.type === 'success' && revealingNow && mood) compose?.insert(mood);
			};
		}}
	>
		<input type="hidden" name="area" value={area.id} />
		<input type="hidden" name="reveal" value={area.revealed ? '0' : '1'} />
		<button class="button {area.revealed ? 'secondary' : ''}" disabled={revealing !== null}>
			{area.revealed ? text.map.hide : text.map.reveal}
		</button>
	</form>
{/snippet}

{#snippet placeForms(area: MapArea)}
	{#each area.monsters as m (m.index)}
		<form
			method="POST"
			action="?/placeMonster"
			use:enhance={() => {
				placing = true;
				return async ({ update }) => {
					await update({ reset: false });
					placing = false;
				};
			}}
		>
			<input type="hidden" name="area" value={area.id} />
			<input type="hidden" name="index" value={m.index} />
			<button class="button secondary" disabled={placing}>{text.monsters.place(`${m.name} (${m.label})`)}</button>
		</form>
	{/each}
{/snippet}

{#snippet crawlForm()}
	<form
		method="POST"
		action="?/startCrawl"
		class="stack-sm"
		use:enhance={() => {
			startingCrawl = true;
			return async ({ update }) => {
				await update();
				startingCrawl = false;
			};
		}}
	>
		<fieldset class="stack-sm">
			<legend><strong>{text.crawl.dangerLabel}</strong></legend>
			{#each DANGER_LEVELS as danger (danger)}
				<label class="choice">
					<input type="radio" name="danger" value={danger} required checked={danger === (crawl?.danger ?? 'risky')} />
					<span>{text.crawl.dangers[danger]} <span class="muted small">· {text.crawl.dangerHints[danger]}</span></span>
				</label>
			{/each}
		</fieldset>
		{#if form?.crawlError}
			<p class="error" role="alert">{form.crawlError}</p>
		{/if}
		<button class="button" disabled={startingCrawl}>{text.crawl.start}</button>
	</form>
{/snippet}

{#if visitor.role === 'gm' && !crawl}
	<section class="card stack">
		<h2>{text.crawl.startTitle}</h2>
		<p class="muted">{text.crawl.startIntro}</p>
		{@render crawlForm()}
	</section>
{/if}

<section class="card map-card stack" aria-label={text.map.areas}>
	{#if data.map.ok}
		<h2>{data.map.view.dungeonName}</h2>
		{#if visitor.role === 'gm'}
			<DungeonMap
				view={data.map.view}
				focus={focusCell}
				busy={moving}
				moves={monsterMoves}
				onmove={movingMonster ? moveMonster : undefined}
				selectedMonster={movingMonster}
				onselectmonster={(id) => (movingMonster = movingMonster === id ? null : id)}
			/>
			{#if movingMonster}
				<div class="row wrap">
					<p class="small" role="status">{moving ? text.map.moving : text.monsters.moving(movingMonster)}</p>
					<button type="button" class="button secondary" onclick={() => (movingMonster = null)}>{text.monsters.cancelMove}</button>
				</div>
			{/if}
		{:else}
			<DungeonMap
				view={data.map.view}
				focus={focusCell}
				busy={moving}
				onmove={data.map.view.moves ? move : undefined}
			/>
		{/if}
		{#if visitor.role === 'player' && data.map.view.monsters.length}
			<div class="stack-sm" aria-label={text.monsters.inSight}>
				<strong class="small">{text.monsters.inSight}</strong>
				<ul class="monster-list">
					{#each data.map.view.monsters as m (m.id)}
						<li><span class="monster-disc" aria-hidden="true">{m.id}</span> {m.name} · <strong>{text.monsters.conditions[m.condition]}</strong></li>
					{/each}
				</ul>
			</div>
		{/if}
		<p class="muted small">{text.map.darkHint}</p>
		{#if me !== null}
			<TorchTracker
				lights={data.map.view.lights}
				tokens={data.map.view.tokens}
				{nameOf}
				{me}
				canLight={Boolean(ownSheet) && !ownToken?.carriesLight}
				error={form?.lightError ?? null}
				errorFor={form?.lightId ?? null}
			/>
		{/if}
		{#if data.map.view.moves}
			<p class="small" role="status">{moving ? text.map.moving : text.map.moveHint}</p>
		{/if}
		{#if form?.moveError}
			<p class="error" role="alert">{form.moveError}</p>
		{/if}
		<form
			method="POST"
			action="?/move"
			hidden
			bind:this={moveForm}
			use:enhance={() => {
				moving = true;
				return async ({ update }) => {
					await update({ reset: false, invalidateAll: true });
					moving = false;
				};
			}}
		>
			<input type="hidden" name="x" value={moveTarget?.x ?? ''} />
			<input type="hidden" name="y" value={moveTarget?.y ?? ''} />
		</form>
		<form
			method="POST"
			action="?/moveMonster"
			hidden
			bind:this={monsterMoveForm}
			use:enhance={() => {
				moving = true;
				return async ({ result, update }) => {
					await update({ reset: false, invalidateAll: true });
					moving = false;
					if (result.type === 'success') movingMonster = null;
				};
			}}
		>
			<input type="hidden" name="id" value={movingMonster ?? ''} />
			<input type="hidden" name="x" value={monsterTarget?.x ?? ''} />
			<input type="hidden" name="y" value={monsterTarget?.y ?? ''} />
		</form>
		{#if visitor.role === 'gm'}
			{#if waiting.length}
				<div class="waiting stack-sm" aria-label={text.map.atDoorway}>
					<strong>{text.map.atDoorway}</strong>
					{#each waiting as w (w.area.id)}
						<div class="row wrap">
							<span>{text.map.waitingAt(w.who, w.area.name ?? text.map.corridor(w.area.id))}</span>
							{@render revealForm(w.area)}
						</div>
						{#if w.area.monsters.length}
							<div class="row wrap start">{@render placeForms(w.area)}</div>
						{/if}
					{/each}
					<p class="muted small">{text.map.revealHint}</p>
				</div>
			{/if}
			{#if form?.revealError}
				<p class="error" role="alert">{form.revealError}</p>
			{/if}
			{#if form?.monsterError && !form?.monsterId}
				<p class="error" role="alert">{form.monsterError}</p>
			{/if}
			<p class="muted small">{text.map.gmHint}</p>
		{/if}
	{:else if data.map.errors}
		<p class="error">{text.map.gmErrors}</p>
		<ul class="file-errors">
			{#each data.map.errors as error, i (i)}
				<li>{error}</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{text.map.unavailable}</p>
	{/if}
</section>

{#if me !== null}
	<section class="card stack">
		<Log log={data.log} people={data.people} {areaName} />
		{#if visitor.role === 'gm' && data.hpChanges.length}
			<HpChanges
				changes={data.hpChanges}
				monsters={mapView?.monsters ?? []}
				sheets={data.sheets}
				error={form?.hpError ?? null}
			/>
		{/if}
		{#if spotlight?.kind === 'challenge' || spotlight?.kind === 'damage'}
			<ChallengePrompt
				pending={spotlight}
				mine={spotlight.seat === me}
				name={nameOf(spotlight.seat)}
				error={form?.challengeError ?? null}
			/>
		{/if}
		{#if timedOutTurn}
			<TimeoutPrompt
				spotlight={timedOutTurn}
				name={nameOf(timedOutTurn.seat)}
				hours={timer.hours}
				error={form?.resolveError ?? null}
			/>
		{/if}
		{#if challengeSheet && spotlight?.kind === 'gm'}
			<details class="challenge" open={spotlight.preConsent ?? false}>
				<summary>
					<span>{text.challenge.title}</span>
					{#if spotlight.preConsent}<span class="muted small">{text.challenge.preConsent}</span>{/if}
				</summary>
				<ChallengeForm
					sheet={challengeSheet}
					preConsent={spotlight.preConsent ?? false}
					monsters={mapView?.monsters ?? []}
					dark={darkSeats.includes(challengeSheet.seat)}
					error={form?.challengeError ?? null}
				/>
			</details>
		{/if}
		<Compose
			bind:this={compose}
			sessionId={page.params.sessionId!}
			{me}
			{holder}
			{acting}
			serverError={form?.postError ?? null}
		/>
	</section>
{/if}

{#if visitor.role === 'gm' && mapView}
	<section class="card stack">
		<h2>{text.monsters.title}</h2>
		<MonsterPanel
			monsters={mapView.monsters}
			sheets={data.sheets}
			gmTurn={spotlight?.kind === 'gm'}
			defaultSeat={spotlight?.kind === 'gm' ? spotlight.afterSeat : null}
			{darkSeats}
			moving={movingMonster}
			onmove={(id) => (movingMonster = id)}
			error={form?.monsterError ?? null}
			errorFor={form?.monsterId ?? null}
		/>
	</section>
{/if}

{#if visitor.role === 'gm' && crawl}
	<section class="card">
		<details>
			<summary><span>{text.crawl.restartTitle}</span><span class="muted small">{text.crawl.restartHint}</span></summary>
			{@render crawlForm()}
		</details>
	</section>
{/if}

{#if visitor.role === 'gm'}
	<section class="card">
		<details open={Boolean(form?.timeoutError)}>
			<summary><span>{text.timeout.settingsTitle}</span><span class="muted small">{timer.hours} h</span></summary>
			<form
				method="POST"
				action="?/turnTimeout"
				class="stack-sm"
				use:enhance={() => {
					savingTimeout = true;
					return async ({ update }) => {
						await update({ reset: false });
						savingTimeout = false;
					};
				}}
			>
				<p class="muted small">{text.timeout.settingsHint(timer.hours)}</p>
				<label for="hours"><strong>{text.timeout.hoursLabel}</strong></label>
				<div class="row">
					<input
						id="hours"
						name="hours"
						type="number"
						inputmode="numeric"
						min={MIN_TURN_TIMEOUT_HOURS}
						max={MAX_TURN_TIMEOUT_HOURS}
						step="1"
						required
						value={timer.hours}
					/>
					<button class="button" disabled={savingTimeout}>{text.timeout.save}</button>
					{#if form?.timeoutSaved}<span class="muted small" role="status">{text.timeout.saved}</span>{/if}
				</div>
				{#if form?.timeoutError}
					<p class="error" role="alert">{form.timeoutError}</p>
				{/if}
			</form>
		</details>
	</section>
{/if}

{#if visitor.role === 'player'}
	<section class="card stack" aria-label={text.character.importTitle}>
		{#if ownSheet}
			<details open>
				<summary><span>{ownSheet.character.name}</span><span class="muted small">{text.character.hp} {ownSheet.hp}/{ownSheet.character.maxHp} · {text.character.ac} {ownSheet.character.ac}{#if ownSheet.dying} · <strong>{text.character.dying}</strong>{/if}</span></summary>
				<CharacterCard sheet={ownSheet} />
			</details>
			<form
				method="POST"
				action="?/saveInventory"
				class="stack-sm"
				use:enhance={() => {
					savingInventory = true;
					return async ({ update }) => {
						await update({ reset: false });
						savingInventory = false;
					};
				}}
			>
				<label for="inventory"><strong>{text.character.inventory}</strong></label>
				<p class="muted small" id="inventory-hint">{text.character.inventoryHint}</p>
				<textarea
					id="inventory"
					name="inventory"
					rows="5"
					maxlength={MAX_INVENTORY_LENGTH}
					aria-describedby="inventory-hint">{ownSheet.inventory}</textarea
				>
				{#if form?.inventoryError}
					<p class="error" role="alert">{form.inventoryError}</p>
				{/if}
				<div class="row">
					<button class="button" disabled={savingInventory}>{text.character.inventorySave}</button>
					{#if form?.inventorySaved}<span class="muted small" role="status">{text.character.inventorySaved}</span>{/if}
				</div>
			</form>
		{:else}
			<h2>{text.character.importTitle}</h2>
			<p class="muted">{text.character.importIntro}</p>
			<form
				method="POST"
				action="?/importCharacter"
				enctype="multipart/form-data"
				class="stack-sm"
				use:enhance={() => {
					importing = true;
					return async ({ update }) => {
						await update();
						importing = false;
					};
				}}
			>
				<label for="export">{text.character.fileLabel}</label>
				<input id="export" name="export" type="file" accept=".json,application/json" required />
				{#if form?.importErrors}
					<div role="alert" class="stack-sm">
						<p class="error">{text.character.importFailed}</p>
						<ul class="file-errors">
							{#each form.importErrors as e, i (i)}
								<li>{e}</li>
							{/each}
						</ul>
					</div>
				{/if}
				<button class="button" disabled={importing}>{text.character.importSubmit}</button>
			</form>
		{/if}
	</section>
{/if}

{#if visitor.role === 'gm' && data.map.ok}
	<section class="card stack">
		<h2>{text.map.areas}</h2>
		{#if form?.areaLightError}
			<p class="error" role="alert">{form.areaLightError}</p>
		{/if}
		<ul class="stack-sm">
			{#each data.map.view.areas as area (area.id)}
				<li>
					<details>
						<summary>
							<span>{area.name ?? text.map.corridor(area.id)}</span>
							<span class="muted small"
								>{area.id} · {area.revealed ? text.map.revealed : text.map.hidden} · {area.lit
									? text.light.lit
									: text.light.dark}</span
							>
						</summary>
						<div class="row wrap">
							{@render revealForm(area)}
							{#if !area.revealed && area.mood}<span class="muted small">{text.map.revealHint}</span>{/if}
						</div>
						<form method="POST" action="?/areaLight" class="stack-sm" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="area" value={area.id} />
							<fieldset class="pills">
								<legend>{text.light.areaLabel}</legend>
								{#each [['', 'auto'], ['lit', 'lit'], ['dark', 'dark']] as const as [value, key] (key)}
									<label>
										<input
											type="radio"
											name="light"
											{value}
											checked={(area.lightOverride ?? '') === value}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										/><span>{text.light.overrides[key]}</span>
									</label>
								{/each}
							</fieldset>
							<p class="muted small">{text.light.overrideHint}</p>
						</form>
						<dl>
							{#if area.mood}
								<dt>{text.map.mood}</dt>
								<dd class="mood">{area.mood}</dd>
							{/if}
							{#if area.notes}
								<dt>{text.map.notes}</dt>
								<dd>{area.notes}</dd>
							{/if}
							{#if area.monsters.length}
								<dt>{text.map.monsters}</dt>
								<dd class="stack-sm">
									<span>{area.monsters.map((m) => text.monsters.listed(m.count, m.name, m.label)).join(', ')}</span>
									<div class="row wrap start">{@render placeForms(area)}</div>
									<span class="muted small">{text.monsters.placeHint}</span>
								</dd>
							{/if}
						</dl>
					</details>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.players}
	<section class="card stack">
		<h2>{text.session.players}</h2>
		{#if data.players.length === 0}
			<p class="muted">{text.session.noPlayers}</p>
		{:else}
			<p class="muted">{text.session.linkHint}</p>
			<ul class="stack">
				{#each data.players as player (player.seat)}
					<li class="stack-sm">
						<span class="role">
							<span class="token {player.tokenColour}">P{player.seat}</span>
							{text.session.player(player.seat)} ({text.colours[player.tokenColour]})
						</span>
						<CopyLink link={player.link} label={text.session.player(player.seat)} />
						{#if sheetBySeat.get(player.seat)}
							{@const sheet = sheetBySeat.get(player.seat)!}
							<details>
								<summary><span>{sheet.character.name}</span><span class="muted small">{text.character.hp} {sheet.hp}/{sheet.character.maxHp} · {text.character.ac} {sheet.character.ac}{#if sheet.dying} · <strong>{text.character.dying}</strong>{/if}</span></summary>
								<CharacterCard {sheet} />
								<form method="POST" action="?/characterHp" class="stack-sm" use:enhance={() => async ({ update }) => update({ reset: false })}>
									<input type="hidden" name="seat" value={sheet.seat} />
									<label for="hp-{sheet.seat}"><strong>{text.character.setHp}</strong></label>
									<p class="muted small">{text.character.setHpHint}</p>
									<div class="row">
										<input id="hp-{sheet.seat}" name="hp" type="number" inputmode="numeric" min="0" max={sheet.character.maxHp} step="1" required value={sheet.hp} />
										<span class="muted">/ {sheet.character.maxHp}</span>
										<button class="button secondary">{text.character.save}</button>
									</div>
									{#if form?.characterHpError && form?.characterHpSeat === sheet.seat}
										<p class="error" role="alert">{form.characterHpError}</p>
									{/if}
								</form>
								{#if sheet.inventory}
									<p class="small"><strong>{text.character.inventory}:</strong> <span class="pre">{sheet.inventory}</span></p>
								{/if}
							</details>
						{:else}
							<p class="muted small">{text.character.noCharacter}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#if data.players.length < MAX_PLAYERS}
			<form method="POST" action="?/addPlayer" use:enhance>
				<button class="button">{text.session.addPlayer}</button>
			</form>
		{:else}
			<p class="muted">{text.session.tableFull}</p>
		{/if}
	</section>
{/if}

<style>
	.stack {
		display: grid;
		gap: 12px;
	}
	.stack-sm {
		display: grid;
		gap: 6px;
	}
	header {
		margin-bottom: 24px;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.role {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		padding: 0 6px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.error {
		font-weight: 700;
	}
	section + section {
		margin-top: 16px;
	}
	.map-card {
		padding: 12px;
	}
	.small {
		font-size: 0.85rem;
	}
	.file-errors {
		padding-left: 18px;
		list-style: disc;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		min-height: var(--tap);
		padding-block: 10px;
		cursor: pointer;
		font-weight: 600;
	}
	dl {
		margin: 0 0 12px;
	}
	dt {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
		margin-top: 8px;
	}
	dd {
		margin: 2px 0 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row.wrap {
		flex-wrap: wrap;
		justify-content: space-between;
	}
	.row.wrap.start {
		justify-content: flex-start;
		gap: 8px;
	}
	.monster-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
	}
	.monster-list li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.monster-disc {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--monster);
		color: var(--monster-text);
		box-shadow: 0 0 0 var(--monster-outline-width) var(--monster-outline);
		font-size: 0.65rem;
		font-weight: 700;
	}
	.waiting {
		padding: 10px 12px;
		border: 2px solid var(--ink);
		border-radius: var(--radius);
	}
	textarea {
		width: 100%;
		font: inherit;
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
		background: var(--surface);
		color: inherit;
	}
	.pre {
		white-space: pre-wrap;
	}
	input[type='number'] {
		width: 6em;
		min-height: var(--tap);
		font: inherit;
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
		background: var(--surface);
		color: inherit;
	}
	.turn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		padding: 10px 14px;
		border: 2px solid var(--ink);
		border-radius: 14px;
	}
	.turn.mine {
		background: var(--ink);
		color: var(--paper);
	}
	.turn.mine .muted {
		color: inherit;
		opacity: 0.8;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
	}
	.choice input {
		width: 20px;
		height: 20px;
		accent-color: var(--ink);
		flex: none;
	}
	.challenge {
		border: 2px solid var(--ink);
		border-radius: var(--radius);
		padding: 0 12px 12px;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pills legend {
		width: 100%;
		margin-bottom: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}
	.pills label {
		position: relative;
	}
	.pills input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.pills span {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 12px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-weight: 600;
	}
	.pills input:checked + span {
		background: var(--ink);
		color: var(--paper);
	}
	.pills input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.mood {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
		font-style: italic;
	}
</style>
