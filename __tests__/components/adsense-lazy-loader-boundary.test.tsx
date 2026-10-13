import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
const cleanups: (() => void)[] = [];
function render(element: ReactElement) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  const unmount = () => act(() => { root.unmount(); container.remove(); });
  cleanups.push(unmount); return { unmount };
}
function cleanup() { cleanups.splice(0).forEach(fn => fn()); }
const state = vi.hoisted(() => ({ review: false, pathname: '/guides/test' }));
vi.mock('@/lib/adsense-review-mode', () => ({ get ADSENSE_REVIEW_MODE() { return state.review; } }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
let loader: typeof import('@/components/adsense-lazy-loader');
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_ID', 'test-only-publisher');
  loader = await import('@/components/adsense-lazy-loader');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  state.review = false;
  state.pathname = '/guides/test';
  window.history.replaceState({}, '', state.pathname);
  document.body.innerHTML = '<main data-content-ad-eligible="true" data-content-ad-path="/guides/test"></main>';
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); document.getElementById('keepioo-adsense-sdk')?.remove(); });
const trigger = () => act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(11000); });
const sdk = () => document.getElementById('keepioo-adsense-sdk');
describe('advertising SDK adversarial boundaries', () => {
  it('review mode blocks SDK despite a positive marker and user action', () => {
    state.review = true;
    expect(loader.shouldLoadAdsenseScript(state.pathname)).toBe(false);
    render(<loader.AdsenseLazyLoader />); trigger(); expect(sdk()).toBeNull();
  });
  it('rejects an unrelated marker, a mismatched route and ambiguous multiple main elements', () => {
    document.body.innerHTML = '<aside data-content-ad-eligible="true"></aside><main></main>';
    expect(loader.hasEligibleAdsensePage(state.pathname)).toBe(false);
    document.body.innerHTML = '<main data-content-ad-eligible="true" data-content-ad-path="/guides/old"></main>';
    expect(loader.hasEligibleAdsensePage(state.pathname)).toBe(false);
    document.body.innerHTML += '<main data-content-ad-eligible="true" data-content-ad-path="/guides/test"></main>';
    expect(loader.hasEligibleAdsensePage(state.pathname)).toBe(false);
  });
  it('rechecks eligibility after it is revoked while waiting', () => {
    render(<loader.AdsenseLazyLoader />);
    document.querySelector('main')!.setAttribute('data-content-ad-eligible', 'false');
    trigger(); expect(sdk()).toBeNull();
  });
  it('does not inject a delayed SDK after navigating to a utility route', () => {
    render(<loader.AdsenseLazyLoader />);
    window.history.replaceState({}, '', '/login'); trigger(); expect(sdk()).toBeNull();
  });
  it('loads one owned SDK only on an explicitly eligible current page, and removes it on cleanup', () => {
    const view = render(<loader.AdsenseLazyLoader />); trigger();
    expect(sdk()).not.toBeNull();
    expect(document.querySelectorAll('#keepioo-adsense-sdk')).toHaveLength(1);
    trigger(); expect(document.querySelectorAll('#keepioo-adsense-sdk')).toHaveLength(1);
    view.unmount(); expect(sdk()).toBeNull();
  });
  it('blocks utility routes even with a fabricated positive main marker', () => {
    for (const path of ['/login', '/admin', '/search', '/checkout']) expect(loader.shouldLoadAdsenseScript(path)).toBe(false);
  });
});
