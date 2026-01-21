/**
 * E2E tests for JSONPath Trace Display Customization
 *
 * Tests the facilitator flow for configuring JSONPath queries and
 * verifying that extracted content displays correctly in the TraceViewer.
 *
 * @spec TRACE_DISPLAY_SPEC
 */
import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';

const API_URL = 'http://127.0.0.1:8000';

const tag = ['@spec:TRACE_DISPLAY_SPEC'];

test.describe('JSONPath Trace Display Customization', { tag }, () => {
  test('facilitator can configure JSONPath settings and preview extraction', {
    tag: ['@spec:TRACE_DISPLAY_SPEC'],
  }, async ({ page }) => {
    const runId = `${Date.now()}`;

    // Create JSON-structured trace data for JSONPath extraction
    const traceInput = JSON.stringify({
      messages: [{ role: 'user', content: `Test question from run ${runId}` }],
      metadata: { source: 'e2e-test' }
    });
    const traceOutput = JSON.stringify({
      response: { text: `Test answer for run ${runId}`, confidence: 0.95 }
    });

    // Build scenario with real API for full integration test
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: `JSONPath Test ${runId}` })
      .withFacilitator()
      .withTrace({ input: traceInput, output: traceOutput })
      .withRealApi()
      .build();

    // Login as facilitator
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Click on the workshop from the list (matching by name pattern)
    const workshopNamePattern = new RegExp(`JSONPath Test ${runId.toString().slice(0, 8)}`);
    await page.getByRole('heading', { name: workshopNamePattern }).click();
    await page.waitForLoadState('networkidle');

    // Click Dashboard to see the general view with JsonPathSettings
    await page.getByRole('button', { name: /^Dashboard$/i }).click();

    // JsonPathSettings should be visible in FacilitatorDashboard
    await expect(page.getByText('Trace Display Settings')).toBeVisible();

    // Configure JSONPath for input extraction
    await page.locator('#input-jsonpath').fill('$.messages[0].content');

    // Configure JSONPath for output extraction
    await page.locator('#output-jsonpath').fill('$.response.text');

    // Click Preview to verify extraction
    await page.getByRole('button', { name: /Preview/i }).click();

    // Wait for preview results and verify extracted content is shown
    await expect(page.getByText('Preview Results')).toBeVisible();

    // The extracted input should show the user's question
    await expect(page.getByText(`Test question from run ${runId}`)).toBeVisible();

    // The extracted output should show the response text
    await expect(page.getByText(`Test answer for run ${runId}`)).toBeVisible();

    // Verify success badges are shown (indicating extraction worked)
    await expect(page.getByText('Extracted').first()).toBeVisible();

    // Save the settings
    await page.getByRole('button', { name: /Save Settings/i }).click();

    // Verify save success toast
    await expect(page.getByText(/JSONPath settings saved successfully/i)).toBeVisible();

    // Verify settings persisted via API
    const workshopData = await scenario.api.getWorkshop();
    expect(workshopData.input_jsonpath).toBe('$.messages[0].content');
    expect(workshopData.output_jsonpath).toBe('$.response.text');

    await scenario.cleanup();
  });

  test('TraceViewer displays extracted content when JSONPath is configured', {
    tag: ['@spec:TRACE_DISPLAY_SPEC'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;
    const expectedInputContent = `What is the capital of France? (${runId})`;
    const expectedOutputContent = `The capital of France is Paris. (${runId})`;

    // Create JSON-structured trace data
    const traceInput = JSON.stringify({
      messages: [{ role: 'user', content: expectedInputContent }]
    });
    const traceOutput = JSON.stringify({
      response: { text: expectedOutputContent }
    });

    // Build scenario with participant for viewing traces
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `JSONPath Display Test ${runId}` })
      .withFacilitator()
      .withParticipants(1)
      .withTrace({ input: traceInput, output: traceOutput })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Configure JSONPath settings via API
    const settingsResp = await scenario.page.request.put(
      `${API_URL}/workshops/${scenario.workshop.id}/jsonpath-settings`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          input_jsonpath: '$.messages[0].content',
          output_jsonpath: '$.response.text',
        },
      }
    );
    expect(settingsResp.ok(), 'jsonpath settings update should succeed').toBeTruthy();

    // Participant views trace - should see extracted content
    const participant = scenario.users.participant[0];
    const participantPage = await scenario.newPageAs(participant);

    // Should be in discovery phase, viewing the trace
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible();

    // The TraceViewer should show the EXTRACTED content, not raw JSON
    await expect(participantPage.getByText(expectedInputContent)).toBeVisible();
    await expect(participantPage.getByText(expectedOutputContent)).toBeVisible();

    // The raw JSON structure should NOT be visible (proving extraction worked)
    await expect(participantPage.getByText('"messages"')).not.toBeVisible();
    await expect(participantPage.getByText('"response"')).not.toBeVisible();

    await scenario.cleanup();
  });

  test('TraceViewer shows raw content when JSONPath is not configured', {
    tag: ['@spec:TRACE_DISPLAY_SPEC'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create JSON-structured trace (but DON'T configure JSONPath)
    const traceInput = JSON.stringify({
      messages: [{ role: 'user', content: `Raw JSON test ${runId}` }]
    });
    const traceOutput = JSON.stringify({
      response: { text: `Raw JSON output ${runId}` }
    });

    // Build scenario without JSONPath configuration
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `No JSONPath Test ${runId}` })
      .withFacilitator()
      .withParticipants(1)
      .withTrace({ input: traceInput, output: traceOutput })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Participant views trace - should see RAW JSON
    const participant = scenario.users.participant[0];
    const participantPage = await scenario.newPageAs(participant);

    // Should be in discovery phase
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible();

    // The TraceViewer should show the RAW JSON content (since no JSONPath configured)
    await expect(participantPage.getByText(/"messages"/)).toBeVisible();
    await expect(participantPage.getByText(/"response"/)).toBeVisible();

    await scenario.cleanup();
  });

  test('JSONPath extraction falls back to raw display on no match', {
    tag: ['@spec:TRACE_DISPLAY_SPEC'],
  }, async ({ page }) => {
    const runId = `${Date.now()}`;

    // Create trace with JSON structure
    const traceInput = JSON.stringify({
      messages: [{ role: 'user', content: `Fallback test ${runId}` }]
    });
    const traceOutput = JSON.stringify({
      response: { text: `Fallback output ${runId}` }
    });

    // Build scenario
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: `JSONPath Fallback Test ${runId}` })
      .withFacilitator()
      .withTrace({ input: traceInput, output: traceOutput })
      .withRealApi()
      .build();

    // Login as facilitator
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Click on the workshop from the list (matching by name pattern)
    const workshopNamePattern = new RegExp(`JSONPath Fallback Test ${runId.toString().slice(0, 8)}`);
    await page.getByRole('heading', { name: workshopNamePattern }).click();
    await page.waitForLoadState('networkidle');

    // Click Dashboard to see the general view with JsonPathSettings
    await page.getByRole('button', { name: /^Dashboard$/i }).click();

    // JsonPathSettings should be visible
    await expect(page.getByText('Trace Display Settings')).toBeVisible();

    // Configure an invalid JSONPath that won't match anything
    await page.locator('#input-jsonpath').fill('$.nonexistent.path');
    await page.locator('#output-jsonpath').fill('$.also.nonexistent');

    // Click Preview
    await page.getByRole('button', { name: /Preview/i }).click();

    // Wait for preview results
    await expect(page.getByText('Preview Results')).toBeVisible();

    // Should show "Showing original" badges indicating fallback
    await expect(page.getByText('Showing original').first()).toBeVisible();

    await scenario.cleanup();
  });

  test('multiple JSONPath matches are concatenated with newlines', {
    tag: ['@spec:TRACE_DISPLAY_SPEC'],
  }, async ({ page }) => {
    const runId = `${Date.now()}`;

    // Create trace with multiple messages that can be extracted
    const traceInput = JSON.stringify({
      messages: [
        { role: 'user', content: `First message ${runId}` },
        { role: 'assistant', content: `Second message ${runId}` },
        { role: 'user', content: `Third message ${runId}` }
      ]
    });
    const traceOutput = JSON.stringify({
      response: { text: `Single output ${runId}` }
    });

    // Build scenario
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: `Multi-match JSONPath Test ${runId}` })
      .withFacilitator()
      .withTrace({ input: traceInput, output: traceOutput })
      .withRealApi()
      .build();

    // Login as facilitator
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Click on the workshop from the list (matching by name pattern)
    const workshopNamePattern = new RegExp(`Multi-match JSONPath Test ${runId.toString().slice(0, 8)}`);
    await page.getByRole('heading', { name: workshopNamePattern }).click();
    await page.waitForLoadState('networkidle');

    // Click Dashboard to see the general view with JsonPathSettings
    await page.getByRole('button', { name: /^Dashboard$/i }).click();

    // JsonPathSettings should be visible
    await expect(page.getByText('Trace Display Settings')).toBeVisible();

    // Configure JSONPath to extract ALL message contents (using wildcard)
    await page.locator('#input-jsonpath').fill('$.messages[*].content');
    await page.locator('#output-jsonpath').fill('$.response.text');

    // Click Preview
    await page.getByRole('button', { name: /Preview/i }).click();

    // Wait for preview results
    await expect(page.getByText('Preview Results')).toBeVisible();

    // Should show success badge for input extraction
    await expect(page.getByText('Extracted').first()).toBeVisible();

    // All three message contents should be visible (concatenated)
    await expect(page.getByText(`First message ${runId}`)).toBeVisible();
    await expect(page.getByText(`Second message ${runId}`)).toBeVisible();
    await expect(page.getByText(`Third message ${runId}`)).toBeVisible();

    await scenario.cleanup();
  });
});
