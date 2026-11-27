import type { Check } from '#lib/engine/challenges.ts';
import { text } from '#lib/text.ts';

/** "DEX test" or "Attack with Longsword". */
export function describeCheck(check: Check): string {
	return check.type === 'test' ? text.challenge.testName(check.ability) : text.challenge.attackName(check.weapon.name);
}
