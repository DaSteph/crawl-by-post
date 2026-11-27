<script lang="ts">
	/**
	 * Push onboarding: add to home screen, allow notifications, test push.
	 * Opens by itself the first time a link is opened on a device; once done
	 * (or put off) it shrinks to a one-line status.
	 */
	import { onMount } from 'svelte';
	import { PUBLIC_VAPID_KEY } from '$app/env/public';
	import { text } from '#lib/text.ts';
	import { detectPlatform, isStandalone, pushSupported, registerDevice, sendTest, type Platform } from './client.ts';

	/** The participant's link path, `/session/<id>/<secret>`. */
	let { base }: { base: string } = $props();
	const t = text.onboarding;

	type Step = 'install' | 'permission' | 'test';
	type Test = 'idle' | 'sending' | 'waiting' | 'received' | 'failed';

	let ready = $state(false);
	let platform = $state<Platform>('desktop');
	let standalone = $state(false);
	let supported = $state(false);
	let permission = $state<NotificationPermission>('default');
	let endpoint = $state<string | null>(null);
	let open = $state(false);
	let skippedInstall = $state(false);
	let asking = $state(false);
	let subscribeError = $state(false);
	let test = $state<Test>('idle');
	let showSawIt = $state(false);
	let installPrompt = $state<(Event & { prompt: () => Promise<void> }) | null>(null);

	const storageKey = $derived(`onboarding:${base}`);
	const configured = Boolean(PUBLIC_VAPID_KEY);

	/** iOS can only subscribe in the home screen app; elsewhere installing is optional. */
	const installRequired = $derived(platform === 'ios' && !standalone);
	const steps = $derived<Step[]>(
		platform === 'desktop' || standalone ? ['permission', 'test'] : ['install', 'permission', 'test']
	);
	const step = $derived<Step>(
		steps.includes('install') && (installRequired || !skippedInstall)
			? 'install'
			: endpoint === null
				? 'permission'
				: 'test'
	);

	function remember(value: 'done' | 'later') {
		try {
			localStorage.setItem(storageKey, value);
		} catch {
			// Private mode: it just opens again next time.
		}
	}

	function close(value: 'done' | 'later') {
		remember(value);
		open = false;
	}

	onMount(() => {
		platform = detectPlatform();
		standalone = isStandalone();
		supported = pushSupported();
		if (supported) permission = Notification.permission;

		let seen: string | null = null;
		try {
			seen = localStorage.getItem(storageKey);
		} catch {
			// Treat as first visit.
		}

		const onInstallPrompt = (e: Event) => {
			e.preventDefault();
			installPrompt = e as Event & { prompt: () => Promise<void> };
		};
		window.addEventListener('beforeinstallprompt', onInstallPrompt);

		const onMessage = (e: MessageEvent) => {
			if (e.data?.type === 'push-test' && test === 'waiting') test = 'received';
		};
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', onMessage);
			navigator.serviceWorker.startMessages();
		}

		(async () => {
			// Already allowed on this device (maybe for another link): refresh the
			// subscription for this link without asking again.
			if (supported && configured && permission === 'granted') {
				endpoint = await registerDevice(base, PUBLIC_VAPID_KEY!, true).catch(() => null);
			}
			open = seen === null && endpoint === null;
			ready = true;
		})();

		return () => {
			window.removeEventListener('beforeinstallprompt', onInstallPrompt);
			if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
		};
	});

	async function install() {
		if (!installPrompt) return;
		await installPrompt.prompt();
		installPrompt = null;
		skippedInstall = true;
	}

	async function allow() {
		asking = true;
		subscribeError = false;
		try {
			// Must run straight from the tap: iOS only asks inside a user gesture.
			permission = await Notification.requestPermission();
			if (permission === 'granted') endpoint = await registerDevice(base, PUBLIC_VAPID_KEY!, true);
		} catch {
			subscribeError = true;
		} finally {
			asking = false;
		}
	}

	let sawItTimer: ReturnType<typeof setTimeout> | undefined;

	async function sendTestPush() {
		if (!endpoint) return;
		test = 'sending';
		showSawIt = false;
		clearTimeout(sawItTimer);
		let result = await sendTest(base, endpoint).catch(() => 'failed' as const);
		if (result === 'unknown') {
			// The server forgot this device (e.g. the push service dropped it): register again.
			endpoint = await registerDevice(base, PUBLIC_VAPID_KEY!, true).catch(() => null);
			result = endpoint ? await sendTest(base, endpoint).catch(() => 'failed' as const) : 'failed';
		}
		if (result !== 'sent') {
			test = 'failed';
			return;
		}
		test = 'waiting';
		// Some platforms don't hand the push to an open page; let the player confirm by eye.
		sawItTimer = setTimeout(() => (showSawIt = true), 6000);
	}
</script>

{#if ready}
	{#if open}
		<section class="card onboarding" aria-labelledby="onboarding-title">
			<h2 id="onboarding-title">{t.title}</h2>
			<p class="muted">{t.intro}</p>

			{#if !configured}
				<p>{t.notConfigured}</p>
			{:else if !supported && !installRequired}
				<p>{t.unsupported}</p>
			{:else}
				<p class="muted small">{t.step(steps.indexOf(step) + 1, steps.length)}</p>

				{#if step === 'install'}
					<h3>{t.installTitle}</h3>
					{#if platform === 'ios'}
						<ol>
							{#each t.installIos as line, i (i)}<li>{line}</li>{/each}
						</ol>
						<p class="note">{t.iosWhy}</p>
					{:else}
						<p>{t.installAndroid}</p>
						{#if installPrompt}
							<div class="row">
								<button class="button" onclick={install}>{t.installButton}</button>
								<button class="button secondary" onclick={() => (skippedInstall = true)}>{t.skipInstall}</button>
							</div>
						{:else}
							<p>{t.installAndroidSteps}</p>
							<div class="row">
								<button class="button secondary" onclick={() => (skippedInstall = true)}>{t.skipInstall}</button>
							</div>
						{/if}
					{/if}
				{:else if step === 'permission'}
					<h3>{t.permissionTitle}</h3>
					{#if permission === 'denied'}
						<p class="error" role="alert">{t.denied}</p>
					{:else}
						<p>{t.permissionIntro}</p>
						<div class="row">
							<button class="button" onclick={allow} disabled={asking}>
								{asking ? t.permissionWorking : t.permissionButton}
							</button>
						</div>
						{#if subscribeError}<p class="error" role="alert">{t.subscribeFailed}</p>{/if}
					{/if}
				{:else}
					<h3>{t.testTitle}</h3>
					<p>{t.testIntro}</p>
					<div class="row wrap" aria-live="polite">
						{#if test === 'received'}
							<p class="ok">✓ {t.testReceived}</p>
						{:else}
							<button class="button" onclick={sendTestPush} disabled={test === 'sending'}>
								{test === 'sending' ? t.testSending : test === 'idle' ? t.testButton : t.testRetry}
							</button>
							{#if test === 'waiting'}
								<span class="muted small">{t.testWaiting}</span>
								{#if showSawIt}
									<button class="button secondary" onclick={() => (test = 'received')}>{t.testSawIt}</button>
								{/if}
							{/if}
						{/if}
					</div>
					{#if test === 'failed'}<p class="error" role="alert">{t.testFailed}</p>{/if}
				{/if}
			{/if}

			<div class="row end">
				{#if test === 'received'}
					<button class="button" onclick={() => close('done')}>{t.done}</button>
				{:else}
					<button class="button secondary" onclick={() => close('later')}>{t.later}</button>
				{/if}
			</div>
		</section>
	{:else if endpoint === null}
		<p class="status small">
			<span>{t.offLine}</span>
			<button class="link" onclick={() => (open = true)}>{t.setUp}</button>
		</p>
	{/if}
{/if}

<style>
	.onboarding {
		display: grid;
		gap: 10px;
		margin-bottom: 16px;
	}
	h2,
	h3,
	p,
	ol {
		margin: 0;
	}
	h3 {
		font-size: 1rem;
	}
	ol {
		padding-left: 20px;
		display: grid;
		gap: 4px;
	}
	.note {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row.wrap {
		flex-wrap: wrap;
	}
	.row.end {
		justify-content: flex-end;
	}
	.small {
		font-size: 0.85rem;
	}
	.error,
	.ok {
		font-weight: 700;
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		margin: 0 0 16px;
	}
	.link {
		min-height: var(--tap);
		padding: 0 4px;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
</style>
