<script lang="ts">
	import type { MapView } from '#lib/engine/map.ts';
	import { text } from '#lib/text.ts';
	import { mapGeometry, type Door } from './geometry.ts';

	let { view }: { view: MapView } = $props();

	/** One grid square in SVG units. */
	const C = 24;
	const uid = $props.id();

	const geometry = $derived(mapGeometry(view.areas, view.exits));
	const b = $derived(geometry.bounds);
	const explored = $derived(view.areas.filter((a) => a.revealed).length);

	/** Offsets along the wall for a door symbol centred on (0, 0). */
	function along(door: Door, offset: number) {
		return door.vertical ? { x: 0, y: offset } : { x: offset, y: 0 };
	}
</script>

<svg
	class="map"
	viewBox="{b.x * C} {b.y * C} {b.w * C} {b.h * C}"
	style:max-width="{b.w * 34}px"
	role="img"
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

	{#each view.tokens as token (token.seat)}
		<g
			transform="translate({(token.cell.x + 0.5) * C} {(token.cell.y + 0.5) * C})"
			class="player-token {token.tokenColour}"
			role="img"
			aria-label={text.character.token(token.initials, token.seat)}
		>
			<circle r={C * 0.42} />
			<text text-anchor="middle" dominant-baseline="central">{token.initials}</text>
		</g>
	{/each}
</svg>

<style>
	.map {
		display: block;
		width: 100%;
		height: auto;
		margin-inline: auto;
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
	.player-token circle {
		stroke: var(--ink);
		stroke-width: 1.5;
	}
	.player-token text {
		fill: var(--token-text);
		font-size: 9.5px;
		font-weight: 700;
	}
	.player-token.blue circle {
		fill: var(--token-blue);
	}
	.player-token.purple circle {
		fill: var(--token-purple);
	}
	.player-token.green circle {
		fill: var(--token-green);
	}
	.player-token.magenta circle {
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
