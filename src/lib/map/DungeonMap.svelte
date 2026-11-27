<script lang="ts">
	import { onMount } from 'svelte';
	import type { Cell } from '#lib/dungeon/model.ts';
	import { inRect } from '#lib/dungeon/model.ts';
	import type { MapView } from '#lib/engine/map.ts';
	import { text } from '#lib/text.ts';
	import { mapGeometry, type Door } from './geometry.ts';

	let {
		view,
		focus = null,
		busy = false,
		onmove
	}: {
		view: MapView;
		/** A square to scroll into the middle on load, e.g. the viewer's token. */
		focus?: Cell | null;
		/** True while a move is on its way; targets stay visible but don't react. */
		busy?: boolean;
		/** Called with the tapped square when `view.moves` offers it. */
		onmove?: (cell: Cell) => void;
	} = $props();

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
	const doorwayTargets = $derived(new Set((view.moves?.doorways ?? []).map((c) => `${c.x},${c.y}`)));
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
	onMount(() => {
		if (!focus || !scroller) return;
		scroller.scrollLeft = (focus.x - b.x + 0.5) * PX - scroller.clientWidth / 2;
		scroller.scrollTop = (focus.y - b.y + 0.5) * PX - scroller.clientHeight / 2;
	});

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
	</defs>

	<rect x={b.x * C} y={b.y * C} width={b.w * C} height={b.h * C} class="paper" />
	<rect x={b.x * C} y={b.y * C} width={b.w * C} height={b.h * C} fill="url(#{uid}-grid)" />

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
			role="img"
			aria-label={token.spotlight
				? text.character.spotlightToken(token.initials, token.seat)
				: text.character.token(token.initials, token.seat)}
		>
			{#if token.spotlight}
				<circle r={C * 0.42} class="pulse" />
				<circle r={C * 0.42 + 3.5} class="ring" />
			{/if}
			<circle r={C * 0.42} class="disc" />
			<text text-anchor="middle" dominant-baseline="central">{token.initials}</text>
		</g>
	{/each}

	{#if onmove && view.moves}
		{#each view.moves.cells as cell (`${cell.x},${cell.y}`)}
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
	.door.hidden rect {
		stroke: var(--ink-2);
	}
	.door.hidden .lock,
	.door.hidden .bar,
	.door.hidden .secret {
		fill: var(--ink-2);
	}
</style>
