<script lang="ts">
	import { groupLog, LONG_POST, type LogRecord, type Person } from '#lib/engine/log.ts';
	import { text } from '#lib/text.ts';

	let { log, people }: { log: LogRecord[]; people: Person[] } = $props();

	/** Blocks shown before "show earlier" is needed; the newest are at the bottom. */
	const WINDOW = 60;

	const bySeat = $derived(new Map(people.map((p) => [p.seat, p])));
	const blocks = $derived(groupLog(log));
	let showAll = $state(false);
	const visible = $derived(showAll ? blocks : blocks.slice(-WINDOW));
	const hidden = $derived(blocks.length - visible.length);

	/** Ids of expanded chat runs (by first record) and long posts. */
	let open = $state(new Set<number>());
	function toggle(id: number) {
		const next = new Set(open);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		open = next;
	}

	const nameOf = (seat: number) => bySeat.get(seat)?.name ?? text.session.player(seat);
	const initialsOf = (seat: number) => bySeat.get(seat)?.initials ?? `P${seat}`;
</script>

{#snippet who(author: number | 'gm')}
	{#if author === 'gm'}
		<span class="who gm" aria-label={text.log.gm}>{text.log.gm}</span>
	{:else}
		<span class="who token {bySeat.get(author)?.tokenColour ?? ''}" aria-label={nameOf(author)}>{initialsOf(author)}</span>
	{/if}
{/snippet}

{#snippet post(record: LogRecord, body: string)}
	{#if body.length > LONG_POST && !open.has(record.id)}
		<p class="text">{body.slice(0, LONG_POST).trimEnd()}…</p>
		<button type="button" class="more" onclick={() => toggle(record.id)}>{text.log.readMore}</button>
	{:else}
		<p class="text">{body}</p>
		{#if body.length > LONG_POST}
			<button type="button" class="more" onclick={() => toggle(record.id)}>{text.log.readLess}</button>
		{/if}
	{/if}
{/snippet}

{#snippet entry(record: LogRecord)}
	{@const e = record.entry}
	{#if e.kind === 'action'}
		<li class="entry">
			{@render who(e.seat)}
			<div><span class="meta">{nameOf(e.seat)}</span>{@render post(record, e.text)}</div>
		</li>
	{:else if e.kind === 'response'}
		<li class="entry">
			{@render who('gm')}
			<div>{@render post(record, e.text)}</div>
		</li>
	{:else if e.kind === 'chat'}
		<li class="entry chat">
			{@render who(e.author)}
			<div>
				<span class="meta">{e.author === 'gm' ? text.log.gm : nameOf(e.author)} · {text.log.chat}</span>
				{@render post(record, e.text)}
			</div>
		</li>
	{:else if e.kind === 'initiative'}
		<li class="entry">
			<span class="who gm" aria-hidden="true">d20</span>
			<div class="roll">
				<strong>{text.log.initiative}</strong>
				<ul>
					{#each e.rolls as r (r.seat)}
						<li class:winner={r.seat === e.winner}>
							<span>{nameOf(r.seat)}</span>
							<span class="num">{text.log.rollLine(r.d20, r.modifier, r.total)}</span>
						</li>
					{/each}
				</ul>
				{#each e.rollOffs as round, i (i)}
					<p class="meta">{text.log.rollOff(round.map((r) => `${nameOf(r.seat)} ${r.d20}`).join(', '))}</p>
				{/each}
				<p class="ok">{text.log.goesFirst(nameOf(e.winner))}</p>
			</div>
		</li>
	{:else if e.kind === 'crawlStarted'}
		<li class="event">{text.log.crawlStarted(text.crawl.dangers[e.danger])}</li>
	{:else if e.kind === 'pass'}
		<li class="event">{text.log.pass}</li>
	{:else if e.kind === 'round'}
		<li class="divider"><span>{text.log.round(e.round)}</span></li>
	{/if}
{/snippet}

<section class="log" aria-label={text.log.title}>
	<h2>{text.log.title}</h2>
	{#if blocks.length === 0}
		<p class="muted small">{text.log.empty}</p>
	{:else}
		{#if hidden > 0}
			<button type="button" class="collapsed" onclick={() => (showAll = true)}>{text.log.earlier(hidden)}</button>
		{/if}
		<ol>
			{#each visible as block (block.kind === 'chat' ? `c${block.records[0].id}` : block.record.id)}
				{#if block.kind === 'entry'}
					{@render entry(block.record)}
				{:else if open.has(block.records[0].id)}
					{#each block.records as record (record.id)}
						{@render entry(record)}
					{/each}
					<li>
						<button type="button" class="collapsed" onclick={() => toggle(block.records[0].id)}>{text.log.hideChat}</button>
					</li>
				{:else}
					<li>
						<button type="button" class="collapsed" aria-expanded="false" onclick={() => toggle(block.records[0].id)}>
							{text.log.chatRun(block.records.length)}
						</button>
					</li>
				{/if}
			{/each}
		</ol>
	{/if}
</section>

<style>
	.log {
		display: grid;
		gap: 8px;
	}
	h2 {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	ol,
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	ul {
		gap: 2px;
	}
	p {
		margin: 0;
	}
	.entry {
		display: grid;
		grid-template-columns: 28px 1fr;
		gap: 8px;
		align-items: start;
		line-height: 1.4;
	}
	.who {
		width: 28px;
		height: 28px;
		font-size: 0.68rem;
	}
	.who.gm {
		display: grid;
		place-items: center;
		border: 1.5px solid var(--ink);
		border-radius: 50%;
		font-weight: 700;
	}
	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.meta {
		display: block;
		font-size: 0.72rem;
		color: var(--ink-2);
	}
	.chat {
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.chat .who {
		width: 22px;
		height: 22px;
		font-size: 0.6rem;
		justify-self: center;
		opacity: 0.8;
	}
	.roll {
		display: grid;
		gap: 4px;
		padding: 6px 10px;
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		background: var(--surface);
		font-size: 0.85rem;
	}
	.roll li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.winner,
	.ok {
		font-weight: 700;
	}
	.event {
		font-size: 0.85rem;
		color: var(--ink-2);
		font-style: italic;
	}
	.divider {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--ink-2);
	}
	.collapsed {
		justify-self: start;
		font: inherit;
		font-size: 0.8rem;
		color: var(--ink-2);
		background: none;
		border: 1px dashed var(--ink-2);
		border-radius: 999px;
		padding: 4px 12px;
		min-height: 32px;
		cursor: pointer;
	}
	.more {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: none;
		padding: 4px 0;
		min-height: 32px;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
</style>
