'use client';

import type { ComponentType } from 'react';
import InteractiveFeatureGuard from './InteractiveFeatureGuard';

/**
 * Higher-order component that wraps any page requiring live backends.
 * If NEXT_PUBLIC_SHOW_INTERACTIVE_PAGES is not enabled, the guard renders
 * a "not deployed" placeholder; otherwise it renders the wrapped page.
 */
export function withInteractiveGuard<P extends object>(
  Component: ComponentType<P>,
  title: string,
  slug: string,
) {
  return function GuardedPage(props: P) {
    return (
      <InteractiveFeatureGuard title={title} slug={slug}>
        <Component {...props} />
      </InteractiveFeatureGuard>
    );
  };
}
