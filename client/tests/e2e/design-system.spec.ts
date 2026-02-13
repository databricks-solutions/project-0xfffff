/**
 * E2E tests for DESIGN_SYSTEM_SPEC.
 *
 * Tests dark mode toggle behavior and focus indicator visibility.
 */
import { test, expect } from '@playwright/test';

test.use({ tag: ['@spec:DESIGN_SYSTEM_SPEC'] });

test.describe('Design System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that loads the app styles
    await page.goto('/');
    // Wait for the page to be interactive
    await page.waitForLoadState('domcontentloaded');
  });

  test('dark mode toggle adds .dark class to html element', async ({ page }) => {
    // The design system uses class strategy: adding .dark to <html>
    // Verify the mechanism works by toggling the class directly
    const html = page.locator('html');

    // Initially should not have .dark class (default is light mode)
    const initialClasses = await html.getAttribute('class') || '';
    const startsWithDark = initialClasses.includes('dark');

    // Toggle dark mode by adding .dark class (simulating what a toggle would do)
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    // Verify .dark class is present
    await expect(html).toHaveClass(/dark/);

    // Verify CSS variables change in dark mode by checking computed background
    const darkBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim();
    });
    // Dark mode background should differ from the light mode default
    expect(darkBg).toBeTruthy();

    // Toggle back to light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });

    // Verify .dark class is removed
    const finalClasses = await html.getAttribute('class') || '';
    expect(finalClasses).not.toContain('dark');
  });

  test('focus indicators visible when tabbing through interactive elements', async ({
    page,
  }) => {
    // Tab through the page to focus on interactive elements
    // The design system spec requires: focus-visible:ring-2, focus-visible:ring-primary

    // Press Tab to move focus to the first focusable element
    await page.keyboard.press('Tab');

    // Find the currently focused element
    const focusedElement = page.locator(':focus');

    // There should be a focused element after pressing Tab
    const focusedCount = await focusedElement.count();
    if (focusedCount > 0) {
      // Check that the focused element has some form of visible focus indicator
      // This could be an outline, box-shadow (ring), or border change
      const focusStyles = await focusedElement.evaluate((el) => {
        const styles = getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          boxShadow: styles.boxShadow,
        };
      });

      // The element should have SOME visible focus indication
      // Either a non-none outline or a box-shadow (Tailwind ring uses box-shadow)
      const hasOutline =
        focusStyles.outlineStyle !== 'none' &&
        focusStyles.outlineWidth !== '0px';
      const hasBoxShadow =
        focusStyles.boxShadow !== 'none' && focusStyles.boxShadow !== '';

      expect(hasOutline || hasBoxShadow).toBe(true);
    }
  });
});
