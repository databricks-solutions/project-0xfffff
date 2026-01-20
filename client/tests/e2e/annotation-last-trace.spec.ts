/**
 * Test for bug: Last trace annotation cannot be saved
 *
 * Bug report: Multiple annotators labeling 10 traces report that the last one
 * cannot be saved. Facilitator sees 9/10 completed.
 *
 * These tests verify that all 10 annotations are saved correctly via API.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';
import { submitAnnotationViaApi, getAnnotations } from '../lib/actions/annotation';

const API_URL = 'http://127.0.0.1:8000';

test.describe('Annotation - Last Trace Bug', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, () => {
  test('all 10 annotations should be saved when annotating via API', async ({
    page,
  }) => {
    // Create a real API scenario
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Last Trace Bug Test' })
      .withFacilitator()
      .withSMEs(2)
      .withTraces(10)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const traces = scenario.traces;

    expect(traces.length).toBe(10);

    // Have each SME annotate all 10 traces via API
    for (const sme of scenario.users.sme) {
      for (let i = 0; i < traces.length; i++) {
        const trace = traces[i];
        await submitAnnotationViaApi(
          page,
          workshopId,
          {
            trace_id: trace.id,
            user_id: sme.id,
            rating: 4,
            comment: `Annotation from ${sme.name} for trace ${i + 1}`,
          },
          API_URL
        );
      }
    }

    // Verify all annotations were saved for each user
    for (const sme of scenario.users.sme) {
      const annotations = await getAnnotations(page, workshopId, sme.id, API_URL);
      expect(annotations.length).toBe(10);

      // Verify we have annotations for all 10 traces
      const annotatedTraceIds = new Set(annotations.map((a) => a.trace_id));
      expect(annotatedTraceIds.size).toBe(10);
    }

    // Verify facilitator's view: all 10 traces should have annotations
    const allAnnotations = await getAnnotations(page, workshopId, undefined, API_URL);
    const tracesWithAnnotations = new Set(allAnnotations.map((a) => a.trace_id));

    // Key assertion - facilitator should see 10/10, not 9/10
    expect(tracesWithAnnotations.size).toBe(10);

    await scenario.cleanup();
  });

  test('10th trace annotation should be saved correctly', async ({ page }) => {
    // Create scenario with real API
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Tenth Trace Test' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(10)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const sme = scenario.users.sme[0];
    const traces = scenario.traces;

    // Save annotations for traces 1-9
    for (let i = 0; i < 9; i++) {
      await submitAnnotationViaApi(
        page,
        workshopId,
        {
          trace_id: traces[i].id,
          user_id: sme.id,
          rating: 4,
        },
        API_URL
      );
    }

    // Verify 9 annotations exist
    let annotations = await getAnnotations(page, workshopId, sme.id, API_URL);
    expect(annotations.length).toBe(9);

    // Now save the 10th annotation - this is the key test
    await submitAnnotationViaApi(
      page,
      workshopId,
      {
        trace_id: traces[9].id,
        user_id: sme.id,
        rating: 5,
        comment: 'The critical 10th annotation',
      },
      API_URL
    );

    // Verify all 10 annotations now exist
    annotations = await getAnnotations(page, workshopId, sme.id, API_URL);
    expect(annotations.length).toBe(10);

    // Verify trace 10 specifically was saved
    const trace10Annotation = annotations.find((a) => a.trace_id === traces[9].id);
    expect(trace10Annotation).toBeDefined();
    expect(trace10Annotation!.rating).toBe(5);
    expect(trace10Annotation!.comment).toBe('The critical 10th annotation');

    await scenario.cleanup();
  });

  test('concurrent annotations from multiple users should all be saved', async ({
    page,
  }) => {
    // Create scenario with real API
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Concurrent Annotation Test' })
      .withFacilitator()
      .withSMEs(3)
      .withTraces(10)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const traces = scenario.traces;
    const smes = scenario.users.sme;

    // All SMEs annotate all traces concurrently (simulated by interleaving)
    for (let i = 0; i < traces.length; i++) {
      // Each SME annotates trace i
      await Promise.all(
        smes.map((sme) =>
          submitAnnotationViaApi(
            page,
            workshopId,
            {
              trace_id: traces[i].id,
              user_id: sme.id,
              rating: (i % 5) + 1,
            },
            API_URL
          )
        )
      );
    }

    // Verify each SME has all 10 annotations
    for (const sme of smes) {
      const annotations = await getAnnotations(page, workshopId, sme.id, API_URL);
      expect(annotations.length).toBe(10);
    }

    // Verify total annotation count
    const allAnnotations = await getAnnotations(page, workshopId, undefined, API_URL);
    expect(allAnnotations.length).toBe(30); // 3 SMEs * 10 traces

    await scenario.cleanup();
  });

  /**
   * UI BUG REPRODUCTION TEST
   *
   * This test reproduces the bug where the 10th annotation fails to save
   * when clicking the Complete button in the UI.
   */
  test('UI: 10th annotation should be saved when clicking Complete button', async ({
    page,
  }) => {
    // Create a real API scenario with exactly 10 traces
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'UI Last Trace Bug Test' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(10)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const sme = scenario.users.sme[0];

    // Navigate to the app and login as SME
    await page.goto(`/?workshop=${workshopId}`);
    await scenario.loginAs(sme);

    // Wait for annotation interface to load
    await expect(page.getByText('Rate this Response')).toBeVisible({
      timeout: 15000,
    });

    // Annotate all 10 traces through the UI
    for (let i = 0; i < 10; i++) {
      // Wait for the progress indicator to show correct trace number
      await expect(page.getByText(`Trace ${i + 1} of 10`)).toBeVisible({
        timeout: 5000,
      });

      // Select a rating - find the radio button for "Agree" (rating 4)
      // The Likert scale has: Strongly Disagree(1), Disagree(2), Neutral(3), Agree(4), Strongly Agree(5)
      const agreeRadio = page.locator('input[type="radio"][value="4"]').first();
      await agreeRadio.click();

      // Verify the rating was selected
      await expect(agreeRadio).toBeChecked();

      // Click Next (or Complete for the last trace)
      if (i < 9) {
        const nextButton = page.getByRole('button', { name: /next/i });
        await expect(nextButton).toBeEnabled();
        await nextButton.click();
      } else {
        // Last trace - click Complete button
        const completeButton = page.getByTestId('complete-annotation-button');
        await expect(completeButton).toBeEnabled();
        await completeButton.click();
      }

      // Wait for the save to complete (background save happens on navigation)
      await page.waitForTimeout(1000);
    }

    // Wait for completion message
    await expect(
      page.getByText('All traces annotated! Great work.')
    ).toBeVisible({ timeout: 10000 });

    // CRITICAL: Verify all 10 annotations were saved via API
    const annotations = await getAnnotations(page, workshopId, sme.id, API_URL);

    // This is the key assertion - should be 10, not 9
    expect(
      annotations.length,
      `Expected 10 annotations but got ${annotations.length}. The 10th trace annotation was not saved.`
    ).toBe(10);

    // Verify we have annotations for all 10 unique traces
    const annotatedTraceIds = new Set(annotations.map((a) => a.trace_id));
    expect(
      annotatedTraceIds.size,
      `Expected 10 unique trace annotations but got ${annotatedTraceIds.size}`
    ).toBe(10);

    await scenario.cleanup();
  });
});
