/**
 * How the consent banner tells every other fixed-bottom surface how much of
 * the bottom edge it is occupying.
 *
 * THE DEFECT THIS CLOSES. The banner is `fixed inset-x-0 bottom-0` and the PDP
 * sticky add-to-cart bar is `fixed inset-x-0 bottom-0`.
 * They are both pinned to the bottom edge and they physically overlap, so
 * whichever wins the stacking contest hides the other. Raising the banner's
 * `z-index` alone is the WRONG fix and is the trap here: it puts the consent
 * bar on top of the add-to-cart button, which is worse than the reported bug.
 * The collision is the defect; the stacking order is only half of it. So the
 * banner publishes its height and the sticky bar sits clear of it, and the
 * banner is additionally given a higher stacking level so the two can never
 * contest the same pixels during the bar's 300 ms slide.
 *
 * WHY A CSS CUSTOM PROPERTY AND NOT A STORE. `lib/consent-store.ts` already
 * exists and the banner already writes to it, so a `bannerHeight` field there
 * would have been the obvious move. Three reasons it is not:
 *
 *  - **Every consumer would have to subscribe and re-render.** A custom
 *    property on `:root` is read by the style system; the sticky bar needs no
 *    hook, no subscription and no render, and its `bottom` is resolved by the
 *    browser at paint.
 *  - **It composes with surfaces that cannot subscribe.** Any future
 *    fixed-bottom element — including one whose markup this repo does not own
 *    — offsets itself with one `calc()`.
 *  - **It cannot be read on the server**, which is the property
 *    `lib/consent.ts` spends its docblock protecting. A React store invites a
 *    provider; a `:root` variable cannot be lifted into the tree at all.
 *
 * WHY NOT "RESERVE SPACE AT THE BOTTOM OF THE VIEWPORT". Padding the document
 * would put the banner back in flow and reintroduce the layout shift the
 * banner is `position: fixed` to avoid — CLS was measured at 0.0061 with the
 * banner up, with the banner absent from every shift source. That is the whole
 * reason this shape was chosen over the reserve-space shape.
 *
 * WHY A TRANSFORM AND NOT `bottom`, WHICH IS WHAT THIS DID FIRST. "It is
 * already `position: fixed`, so moving it shifts nothing" is FALSE, and the
 * measurement says so: a fixed element that MOVES is a layout-shift source
 * like any other. With the sticky bar offset by `bottom: calc(10px + var(…))`,
 * the bar sat at 10px through hydration and jumped 105px the moment the banner
 * measured itself, and the PDP scored **0.00543 in all three runs with
 * `.headkit-product-sticky-bar` named as the source**, against **0.00000** on
 * the two clean runs of the same page without the offset. A transform is the
 * one way to move a box that the layout-shift algorithm does not count at all,
 * so consumers translate rather than re-place themselves — and the PDP bar is
 * already transform-animated, so this costs it nothing.
 *
 * The variable is ABSENT rather than `0px` when the banner is not mounted, so
 * every consumer's `var(--…, 0px)` fallback makes the no-banner case
 * byte-for-byte what it was before this existed.
 */

/**
 * The custom property every fixed-bottom surface offsets by. Lives here rather
 * than inline at either end so the two ends cannot drift apart on a typo —
 * `lib/consent-banner-offset.test.ts` asserts both ends name this string.
 */
export const CONSENT_BANNER_HEIGHT_VAR = "--headkit-consent-banner-height";

/**
 * The `transform` a fixed-bottom surface uses to lift itself clear of the
 * banner: zero while no banner is up, the banner's height while one is.
 *
 * Exported as a string because Tailwind's arbitrary-value syntax for the same
 * expression needs underscores for the spaces `calc()` requires around `*`,
 * which is exactly the sort of thing that silently produces no rule at all.
 * A consumer may use either; the guard checks whichever it finds.
 */
export function consentAwareLift(): string {
  return `translateY(calc(var(${CONSENT_BANNER_HEIGHT_VAR}, 0px) * -1))`;
}

/**
 * Publish the banner's measured height.
 *
 * Called from the banner's own effect on mount and on every resize — the bar
 * wraps to two rows on a narrow viewport and grows again when "Choose what to
 * allow" expands the checkboxes, so a fixed constant would be wrong in exactly
 * the states a shopper is most likely to be in.
 */
export function publishConsentBannerHeight(height: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    CONSENT_BANNER_HEIGHT_VAR,
    `${Math.max(0, Math.round(height))}px`,
  );
}

/**
 * Remove the property, restoring every consumer's fallback.
 *
 * REMOVAL, not a write of `0px`: a shopper who has chosen must leave no trace
 * in the computed style, and an absent property is the only way to say "this
 * mechanism is not in play" rather than "it is in play and measures nothing".
 */
export function clearConsentBannerHeight(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(CONSENT_BANNER_HEIGHT_VAR);
}
