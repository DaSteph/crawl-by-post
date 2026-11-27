<script lang="ts">
	import { groupLog, LONG_POST, type LogRecord, type Person } from '#lib/engine/log.ts';
	import { text } from '#lib/text.ts';
	import { describeCheck } from './describe.ts';

	let {
		log,
		people,
		areaName
	}: {
		log: LogRecord[];
		people: Person[];
		/** The name of an area as the viewer may know it. */
		areaName: (id: string) => string;
	} = $props();

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
			<div>
				<span class="meta">{nameOf(e.seat)}{#if e.playedByGm} · <strong>{text.log.playedByGm}</strong>{/if}</span>
				{@render post(record, e.text)}
			</div>
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
	{:else if e.kind === 'challenge'}
		<li class="entry">
			{@render who('gm')}
			<div>
				<span class="meta">{text.log.challenge(nameOf(e.seat))}</span>
				<p class="text"><strong>{describeCheck(e.check)} · {text.challenge.dcLabel} {e.dc}</strong>{#if e.edge} · {text.challenge.edgeNote[e.edge]}{/if}</p>
				{#if e.stakes}<p class="text stakes">{e.stakes}</p>{/if}
			</div>
		</li>
	{:else if e.kind === 'roll'}
		<li class="entry">
			<span class="who gm" aria-hidden="true">d20</span>
			<div class="roll">
				<strong>{text.log.roll(nameOf(e.seat))} · {describeCheck(e.check)}</strong>
				<p class="num">
					{text.log.d20s(e.d20s, e.d20)}{#if e.edge} ({text.challenge.edgeNote[e.edge]}){/if}
					{text.log.modifier(e.modifier)} {text.log.total(e.total, e.dc)}
				</p>
				<p class="ok">{e.success ? `✓ ${text.log.success}` : `✗ ${text.log.failure}`}</p>
			</div>
		</li>
	{:else if e.kind === 'damage'}
		<li class="entry">
			<span class="who gm" aria-hidden="true">dmg</span>
			<div class="roll">
				<strong
					>{e.target
						? text.log.damageTarget(nameOf(e.seat), e.weapon, `${e.target.id} ${e.target.name}`)
						: text.log.damage(nameOf(e.seat), e.weapon)}</strong
				>
				<p class="num">{text.log.damageLine(e.formula, e.rolls, e.total)}</p>
			</div>
		</li>
	{:else if e.kind === 'monsterAttack'}
		<li class="entry">
			<span class="who monster" aria-hidden="true">{e.monster.id}</span>
			<div class="roll">
				<strong>{text.log.monsterAttack(`${e.monster.id} ${e.monster.name}`, nameOf(e.seat))}</strong>
				<ul class="strikes">
					{#each e.strikes as s, i (i)}
						<li>
							<span>{text.log.strike(s.attack)}</span>
							<span class="num">
								{text.log.d20s(s.d20s, s.d20)}{#if e.edge} ({text.challenge.edgeNote[e.edge]}){/if}
								{text.log.modifier(s.bonus)} {text.log.vsAc(s.total, e.ac)}
								· <strong>{s.hit ? `✓ ${text.log.hit}` : `✗ ${text.log.miss}`}</strong>
							</span>
							{#if s.damage}
								<span class="num">{text.log.damageLine(s.damage.formula, s.damage.rolls, s.damage.total)}</span>
							{/if}
							{#if s.effect}<span>{s.effect}</span>{/if}
						</li>
					{/each}
				</ul>
			</div>
		</li>
	{:else if e.kind === 'monsterHurt'}
		<li class="event hurt">{text.log.monsterHurt(`${e.monster.id} ${e.monster.name}`, text.monsters.conditions[e.condition])}</li>
	{:else if e.kind === 'characterHurt'}
		<li class="event hurt">{text.log.characterHurt(nameOf(e.seat), e.amount)}</li>
	{:else if e.kind === 'dying'}
		<li class="event dying">{text.log.dying(nameOf(e.seat))}</li>
	{:else if e.kind === 'torchLit'}
		<li class="event">{text.log.torchLit(nameOf(e.seat))}</li>
	{:else if e.kind === 'torchOut'}
		<li class="event torch-out">{text.log.torchOut(nameOf(e.seat))}</li>
	{:else if e.kind === 'declined'}
		<li class="event">{text.log.declined(nameOf(e.seat))}</li>
	{:else if e.kind === 'crawlStarted'}
		<li class="event">{text.log.crawlStarted(text.crawl.dangers[e.danger])}</li>
	{:else if e.kind === 'pass'}
		<li class="event">{e.timedOut ? text.log.autoPass : text.log.pass}</li>
	{:else if e.kind === 'timedOut'}
		<li class="event">{text.log.timedOut(nameOf(e.seat))}</li>
	{:else if e.kind === 'timeoutResolved'}
		<li class="event">{text.log.timeoutResolved[e.resolution](nameOf(e.seat))}</li>
	{:else if e.kind === 'timeoutChanged'}
		<li class="event">{text.log.timeoutChanged(e.hours)}</li>
	{:else if e.kind === 'doorway'}
		<li class="event">{text.log.doorway(nameOf(e.seat))}</li>
	{:else if e.kind === 'revealed'}
		<li class="event revealed">{text.log.revealed(areaName(e.areaId))}</li>
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
	.stakes {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
		font-style: italic;
	}
	.who.monster {
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--monster);
		color: var(--monster-text);
		box-shadow: 0 0 0 var(--monster-outline-width) var(--monster-outline);
		font-weight: 700;
		font-size: 0.6rem;
	}
	.strikes li {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-start;
		gap: 2px 10px;
	}
	.strikes li + li {
		border-top: 1px dashed var(--ink-2);
		padding-top: 2px;
	}
	.event.hurt,
	.event.dying,
	.event.torch-out {
		font-style: normal;
		color: var(--ink);
	}
	.event.dying {
		font-weight: 700;
	}
	.event.revealed {
		font-style: normal;
		font-weight: 600;
		color: var(--ink);
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
