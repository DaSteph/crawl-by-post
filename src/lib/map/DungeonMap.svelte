<script lang="ts">
	import { onMount } from 'svelte';
	import type { Cell } from '#lib/dungeon/model.ts';
	import { inRect } from '#lib/dungeon/model.ts';
	import type { MapView } from '#lib/engine/map.ts';
	import type { Moves } from '#lib/engine/movement.ts';
	import { text } from '#lib/text.ts';
	import { mapGeometry, type Door } from './geometry.ts';

	let {
		view,
		focus = null,
		busy = false,
		onmove,
		moves: movesOverride,
		selectedMonster = null,
		onselectmonster
	}: {
		view: MapView;
		/** A square to scroll into the middle on load, e.g. the viewer's token. */
		focus?: Cell | null;
		/** True while a move is on its way; targets stay visible but don't react. */
		busy?: boolean;
		/** Called with the tapped square when `moves` offers it. */
		onmove?: (cell: Cell) => void;
		/** The squares on offer; defaults to `view.moves`, the viewer's own token moves. */
		moves?: Moves | null;
		/** GM: the monster being moved, drawn highlighted. */
		selectedMonster?: string | null;
		/** GM: called when a monster token is tapped. */
		onselectmonster?: (id: string) => void;
	} = $props();

	const activeMoves = $derived(movesOverride === undefined ? view.moves : movesOverride);

	/** One grid square in SVG units. */
	const C = 24;
	/** One grid square on screen, in px: the minimum tap target size. */
	const PX = 44;
	const uid = $props.id();

	const geometry = $derived(mapGeometry(view.areas, view.exits));
	const b = $derived(geometry.bounds);
	const explored = $derived(view.areas.filter((a) => a.revealed).length);

	const areaAt = (cell: Cell) => view.areas.find((a) => inRect(cell, a.rect));
	// The GM sees unknown areas drawn dashed already, so "?" only goes where nothing is drawn.
	const markers = $derived(view.unknown.filter((u) => !areaAt(u.at)));
	const doorwayTargets = $derived(new Set((activeMoves?.doorways ?? []).map((c) => `${c.x},${c.y}`)));
	const isDoorwayTarget = (cell: Cell) => !!onmove && doorwayTargets.has(`${cell.x},${cell.y}`);

	function targetLabel(cell: Cell) {
		const area = areaAt(cell);
		return text.map.moveTo(area?.name ?? null, cell.x - b.x, cell.y - b.y);
	}

	function tap(cell: Cell) {
		if (!busy) onmove?.(cell);
	}

	function onkeydown(event: KeyboardEvent, cell: Cell) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			tap(cell);
		}
	}

	let scroller: HTMLDivElement | undefined = $state();
	/** Scrolls the map so `focus` sits in the middle. Done on load, and again when a notification is tapped. */
	export function centre() {
		if (!focus || !scroller) return;
		scroller.scrollLeft = (focus.x - b.x + 0.5) * PX - scroller.clientWidth / 2;
		scroller.scrollTop = (focus.y - b.y + 0.5) * PX - scroller.clientHeight / 2;
	}
	onMount(centre);

	/** Offsets along the wall for a door symbol centred on (0, 0). */
	function along(door: Door, offset: number) {
		return door.vertical ? { x: 0, y: offset } : { x: offset, y: 0 };
	}
</script>

<div class="scroller" bind:this={scroller}>
<svg
	class="map"
	viewBox="{b.x * C} {b.y * C} {b.w * C} {b.h * C}"
	width={b.w * PX}
	height={b.h * PX}
	role="group"
	aria-label={text.map.label(view.dungeonName, explored)}
>
	<defs>
		<pattern id="{uid}-grid" width={C} height={C} patternUnits="userSpaceOnUse">
			<path d="M {C} 0 L 0 0 0 {C}" class="grid" />
		</pattern>
		<pattern id="{uid}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
			<line x1="0" y1="0" x2="0" y2="6" class="hatch" />
		</pattern>
	</defs>

	<rect x={b.x * C} y={b.y * C} width={b.w * C} height={b.h * C} class="paper" />
	<rect x={b.x * C} y={b.y * C} width={b.w * C} height={b.h * C} fill="url(#{uid}-grid)" />

	<!-- No light burns here: hatched over the grid. -->
	{#each view.areas.filter((a) => !a.lit) as area (area.id)}
		<rect
			x={area.rect.x * C}
			y={area.rect.y * C}
			width={area.rect.w * C}
			height={area.rect.h * C}
			fill="url(#{uid}-hatch)"
			class="dark"
		/>
	{/each}

	{#each geometry.walls as wall, i (i)}
		<line
			x1={wall.x1 * C}
			y1={wall.y1 * C}
			x2={wall.x2 * C}
			y2={wall.y2 * C}
			class="wall"
			class:hidden={wall.hidden}
		/>
	{/each}

	{#each geometry.doors as door, i (i)}
		<g transform="translate({door.x * C} {door.y * C})" class="door" class:hidden={door.hidden}>
			{#if door.type === 'door' || door.type === 'locked'}
				<rect
					x={door.vertical ? -3.5 : -(C - 8) / 2}
					y={door.vertical ? -(C - 8) / 2 : -3.5}
					width={door.vertical ? 7 : C - 8}
					height={door.vertical ? C - 8 : 7}
				/>
				{#if door.type === 'locked'}
					<circle r="2" class="lock" />
				{/if}
			{:else if door.type === 'portcullis'}
				{#each [-C / 3, 0, C / 3] as offset (offset)}
					<circle cx={along(door, offset).x} cy={along(door, offset).y} r="1.8" class="bar" />
				{/each}
			{:else if door.type === 'secret'}
				<circle r="7" class="secret-bg" />
				<text class="secret" text-anchor="middle" dominant-baseline="central">S</text>
			{/if}
		</g>
	{/each}

	{#snippet unknownBox()}
		<rect x="4" y="5" width={C - 8} height={C - 9} rx="3" class="unknown-box" />
		<text x={C / 2} y={C / 2 + 0.5} text-anchor="middle" dominant-baseline="central">?</text>
	{/snippet}
	{#each markers as marker (`${marker.at.x},${marker.at.y}`)}
		{#if isDoorwayTarget(marker.at)}
			<g
				transform="translate({marker.at.x * C} {marker.at.y * C})"
				class="unknown target"
				role="button"
				tabindex="0"
				aria-label={text.map.moveToDoorway}
				aria-disabled={busy ? 'true' : undefined}
				onclick={() => tap(marker.at)}
				onkeydown={(e) => onkeydown(e, marker.at)}
			>
				{@render unknownBox()}
			</g>
		{:else}
			<g transform="translate({marker.at.x * C} {marker.at.y * C})" class="unknown" role="img" aria-label={text.map.unknown}>
				{@render unknownBox()}
			</g>
		{/if}
	{/each}

	{#each view.tokens as token (token.seat)}
		<g
			transform="translate({(token.cell.x + 0.5) * C} {(token.cell.y + 0.5) * C})"
			class="player-token {token.tokenColour}"
			class:spotlight={token.spotlight}
			class:dying={token.dying}
			role="img"
			aria-label={(token.spotlight
				? text.character.spotlightToken(token.initials, token.seat)
				: text.character.token(token.initials, token.seat)) +
				(token.dying ? `, ${text.character.dyingToken}` : '') +
				(token.carriesLight ? `, ${text.light.carrying}` : '')}
		>
			{#if token.spotlight}
				<circle r={C * 0.42} class="pulse" />
				<circle r={C * 0.42 + 3.5} class="ring" />
			{/if}
			<circle r={C * 0.42} class="disc" />
			<text text-anchor="middle" dominant-baseline="central">{token.initials}</text>
			{#if token.carriesLight}
				<path
					transform="translate({C * 0.36} {-C * 0.3}) scale(0.62)"
					d="M0 -7 C 5 -2, 4 4, 0 4 C -4 4, -5 -1, -1 -3 C -0.5 -1, 1 -1, 0 -7 Z"
					class="flame"
				/>
			{/if}
		</g>
	{/each}

	{#snippet monsterDisc(monster: MapView['monsters'][number])}
		{#if selectedMonster === monster.id}
			<circle r={C * 0.42 + 3.5} class="ring" />
		{/if}
		<circle r={C * 0.42} class="disc" />
		<text text-anchor="middle" dominant-baseline="central" class:long={monster.id.length > 2}>{monster.id}</text>
	{/snippet}
	{#each view.monsters as monster (monster.id)}
		{@const label = text.map.monsterToken(monster.id, monster.name, text.monsters.conditions[monster.condition])}
		{#if onselectmonster}
			<g
				transform="translate({(monster.cell.x + 0.5) * C} {(monster.cell.y + 0.5) * C})"
				class="monster-token selectable"
				class:selected={selectedMonster === monster.id}
				role="button"
				tabindex="0"
				aria-label={text.map.selectMonster(monster.id, monster.name)}
				aria-pressed={selectedMonster === monster.id}
				onclick={() => onselectmonster(monster.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onselectmonster(monster.id);
					}
				}}
			>
				{@render monsterDisc(monster)}
			</g>
		{:else}
			<g
				transform="translate({(monster.cell.x + 0.5) * C} {(monster.cell.y + 0.5) * C})"
				class="monster-token"
				role="img"
				aria-label={label}
			>
				<title>{label}</title>
				{@render monsterDisc(monster)}
			</g>
		{/if}
	{/each}

	{#if onmove && activeMoves}
		{#each activeMoves.cells as cell (`${cell.x},${cell.y}`)}
			<g
				transform="translate({cell.x * C} {cell.y * C})"
				class="move"
				role="button"
				tabindex="0"
				aria-label={targetLabel(cell)}
				aria-disabled={busy ? 'true' : undefined}
				onclick={() => tap(cell)}
				onkeydown={(e) => onkeydown(e, cell)}
			>
				<rect width={C} height={C} class="hit" />
				<circle cx={C / 2} cy={C / 2} r="1.6" class="dot" />
				<rect x="1.5" y="1.5" width={C - 3} height={C - 3} rx="3" class="focus" />
			</g>
		{/each}
	{/if}
</svg>
</div>

<style>
	.scroller {
		overflow: auto;
		max-height: 70vh;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}
	.map {
		display: block;
		margin-inline: auto;
	}
	.unknown-box {
		fill: var(--paper);
		stroke: var(--ink-2);
		stroke-width: 1.2;
		stroke-dasharray: 3 2.5;
	}
	.unknown text {
		fill: var(--ink-2);
		font-size: 12px;
		font-weight: 700;
	}
	.unknown.target,
	.move {
		cursor: pointer;
		outline: none;
	}
	.unknown.target .unknown-box {
		stroke: var(--ink);
	}
	.unknown.target text {
		fill: var(--ink);
	}
	.hit {
		fill: transparent;
	}
	.dot {
		fill: var(--ink-2);
		opacity: 0.55;
	}
	.focus {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1.5;
		opacity: 0;
	}
	.move:hover .focus,
	.move:focus-visible .focus {
		opacity: 1;
	}
	.unknown.target:focus-visible .unknown-box {
		stroke-width: 2.4;
	}
	[aria-disabled='true'] {
		cursor: progress;
	}
	.paper {
		fill: var(--paper);
	}
	.hatch {
		stroke: var(--hatch);
		stroke-width: 1.4;
	}
	.flame {
		fill: var(--ink);
		stroke: var(--paper);
		stroke-width: 0.9;
	}
	.grid {
		fill: none;
		stroke: var(--grid);
		stroke-width: 1;
	}
	.wall {
		stroke: var(--ink);
		stroke-width: 3;
		stroke-linecap: square;
	}
	.wall.hidden {
		stroke: var(--ink-2);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
		stroke-linecap: butt;
	}
	.door rect {
		fill: var(--paper);
		stroke: var(--ink);
		stroke-width: 1.8;
	}
	.lock,
	.bar {
		fill: var(--ink);
	}
	.secret-bg {
		fill: var(--paper);
	}
	.secret {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 700;
	}
	.player-token .disc {
		stroke: var(--ink);
		stroke-width: 1.5;
	}
	.ring {
		fill: none;
		stroke: var(--ink);
		stroke-width: 3;
	}
	.pulse {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
		transform-box: fill-box;
		transform-origin: center;
		animation: pulse 2.2s ease-out infinite;
	}
	@keyframes pulse {
		0% {
			transform: scale(1);
			opacity: 0.9;
		}
		100% {
			transform: scale(1.7);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
			opacity: 0;
		}
	}
	.player-token text {
		fill: var(--token-text);
		font-size: 9.5px;
		font-weight: 700;
	}
	.player-token.blue .disc {
		fill: var(--token-blue);
	}
	.player-token.purple .disc {
		fill: var(--token-purple);
	}
	.player-token.green .disc {
		fill: var(--token-green);
	}
	.player-token.magenta .disc {
		fill: var(--token-magenta);
	}
	.player-token.dying .disc {
		opacity: 0.45;
		stroke-dasharray: 2.5 2;
		stroke-width: 2;
	}
	.monster-token .disc {
		fill: var(--monster);
		stroke: var(--monster-outline);
		stroke-width: var(--monster-outline-width);
	}
	.monster-token text {
		fill: var(--monster-text);
		font-size: 9.5px;
		font-weight: 700;
	}
	.monster-token text.long {
		font-size: 7.5px;
	}
	.monster-token.selectable {
		cursor: pointer;
		outline: none;
	}
	.monster-token.selectable:focus-visible .disc {
		stroke: var(--focus);
		stroke-width: 3;
	}
	.door.hidden rect {
		stroke: var(--ink-2);
	}
	.door.hidden .lock,
	.door.hidden .bar,
	.door.hidden .secret {
		fill: var(--ink-2);
	}
</style>
