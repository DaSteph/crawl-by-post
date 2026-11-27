import type { Check } from '#lib/engine/challenges.ts';
import { text } from '#lib/text.ts';

/** "DEX test", "Attack with Longsword", "Attack G1 Goblin with Longsword" or "Wandering monster check (1d6)". */
export function describeCheck(check: Check): string {
	if (check.type === 'test') return text.challenge.testName(check.ability);
	if (check.type === 'committedRoll') return text.wandering.checkName;
	return check.target
		? text.challenge.attackTargetName(check.weapon.name, `${check.target.id} ${check.target.name}`)
		: text.challenge.attackName(check.weapon.name);
}
