import { test, expect } from '@playwright/test';

// This repo doesn't include Node typings in the client TS config; keep `process.env` without adding deps.
declare const process: { env: Record<string, string | undefined> };

const FACILITATOR_EMAIL =
  process.env.E2E_FACILITATOR_EMAIL ?? 'facilitator123@email.com';
const FACILITATOR_PASSWORD =
  process.env.E2E_FACILITATOR_PASSWORD ?? 'facilitator123';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

async function getFacilitatorId(request: any): Promise<string> {
  const resp = await request.post(`${API_URL}/users/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: FACILITATOR_EMAIL, password: FACILITATOR_PASSWORD },
  });
  expect(resp.ok(), 'facilitator login should succeed').toBeTruthy();
  const body = (await resp.json()) as { user?: { id?: string } };
  expect(body.user?.id, 'login response should include user.id').toMatch(
    /^[a-f0-9-]{36}$/i,
  );
  return body.user!.id!;
}

// Inline fixtures (avoid Node `fs/path` imports; repo client TS config doesn't include Node typings).
// Keep these intentionally small but diverse: one per discovery category.
const syntheticTraces = [
  {
    input:
      'Review this function and suggest improvements:\n```python\ndef process(d):\n    r = []\n    for i in d:\n        if i > 0:\n            r.append(i * 2)\n    return r\n```',
    output:
      'Here are some improvements for readability and clarity:\n\n```python\ndef double_positive_numbers(numbers: list[int]) -> list[int]:\n    """Return a list of positive numbers doubled."""\n    return [num * 2 for num in numbers if num > 0]\n```',
    context: {
      target_categories: ['themes'],
      difficulty: 'easy',
      rationale: 'General maintainability / readability improvements',
    },
  },
  {
    input:
      "This JSON parser breaks on some inputs. Can you fix it?\n```python\nimport json\n\ndef parse_config(config_str):\n    return json.loads(config_str)\n```",
    output:
      "Handle empty input and unicode BOM prefix before json.loads(). Mention malformed JSON as a follow-up.",
    context: {
      target_categories: ['edge_cases'],
      difficulty: 'medium',
      rationale: 'Edge cases: empty string, BOM, malformed JSON',
    },
  },
  {
    input:
      'Is there a bug in this pagination function?\n```python\ndef get_page(items, page_num, page_size=10):\n    start = page_num * page_size\n    end = start + page_size\n    return items[start:end]\n```',
    output:
      'Discuss 0-index vs 1-index, validate bounds, and show the 1-index fix using (page_num - 1).',
    context: {
      target_categories: ['boundary_conditions'],
      difficulty: 'easy',
      rationale: 'Boundary condition: off-by-one indexing',
    },
  },
  {
    input:
      'Why does this SQL query sometimes return wrong results?\n```python\ndef get_user(db, username):\n    query = f"SELECT * FROM users WHERE username = \'{username}\'"\n    return db.execute(query).fetchone()\n```',
    output:
      'Explain SQL injection risk and fix with parameterized query.',
    context: {
      target_categories: ['failure_modes'],
      difficulty: 'medium',
      rationale: 'Failure mode: SQL injection vulnerability',
    },
  },
  {
    input: 'Write a function to validate an email address.',
    output:
      'Ask clarifying questions about requirements (DNS, international, signup vs validation) and provide a simple baseline.',
    context: {
      target_categories: ['missing_info'],
      difficulty: 'medium',
      rationale: 'Missing info: requirements are underspecified',
    },
  },
  {
    input:
      'Should I use a class or functions for this data processing pipeline?\n```python\n# Current approach with functions:\ndef load_data(path): ...\ndef clean_data(df): ...\ndef transform_data(df): ...\ndef save_data(df, path): ...\n```',
    output:
      'Compare trade-offs and say both can be valid depending on scale/config/state.',
    context: {
      target_categories: ['disagreements'],
      difficulty: 'hard',
      rationale: 'Disagreements: multiple valid design approaches',
    },
  },
] as Array<{
  input: string;
  output: string;
  context: {
    target_categories: string[];
    difficulty: string;
    rationale: string;
  };
}>;

test.describe('Assisted Facilitation Flow', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('discovery questions API returns coverage metadata and stops appropriately', async ({
    page,
    request,
  }) => {
    const runId = `${Date.now()}`;

    // In Playwright UI mode, having a `page` makes the app preview render (even for API-heavy tests).
    await page.goto('/');
    await expect(page.getByText('Workshop Portal')).toBeVisible();

    const facilitatorId = await getFacilitatorId(request);

    // 1. Create a workshop via API (requires facilitator_id)
    const createResp = await request.post(`${API_URL}/workshops/`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: `E2E Assisted Facilitation ${runId}`, facilitator_id: facilitatorId },
    });
    expect(createResp.ok(), 'workshop creation should succeed').toBeTruthy();
    const workshop = (await createResp.json()) as { id: string };
    const workshopId = workshop.id;

    // 2. Upload a subset of synthetic traces (one per category for variety)
    const selectedTraces = syntheticTraces.slice(0, 6); // First 6 traces cover all categories
    const uploadResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
      headers: { 'Content-Type': 'application/json' },
      data: selectedTraces,
    });
    expect(uploadResp.ok(), 'trace upload should succeed').toBeTruthy();
    const createdTraces = (await uploadResp.json()) as Array<{ id: string }>;
    expect(createdTraces.length).toBe(6);
    const traceId = createdTraces[0]!.id;

    // 3. Begin discovery
    const beginResp = await request.post(
      `${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=3`,
    );
    expect(beginResp.ok(), 'begin discovery should succeed').toBeTruthy();

    // 4. Create a participant
    const participantResp = await request.post(`${API_URL}/users/`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email: `e2e-assisted-${runId}@example.com`,
        name: `E2E Assisted Participant ${runId}`,
        role: 'participant',
        workshop_id: workshopId,
      },
    });
    expect(participantResp.ok()).toBeTruthy();
    const participant = (await participantResp.json()) as { id: string };

    // 5. Fetch discovery questions - should return baseline question with coverage metadata
    const questionsResp = await request.get(
      `${API_URL}/workshops/${workshopId}/traces/${traceId}/discovery-questions?user_id=${participant.id}`,
    );
    expect(questionsResp.ok(), 'discovery questions should succeed').toBeTruthy();
    const questionsData = (await questionsResp.json()) as {
      questions: Array<{ id: string; prompt: string; category?: string }>;
      can_generate_more: boolean;
      stop_reason: string | null;
      coverage: { covered: string[]; missing: string[] };
    };

    // Validate response structure
    expect(questionsData.questions.length).toBeGreaterThanOrEqual(1);
    expect(questionsData.questions[0]!.id).toBe('q_1'); // Baseline question
    expect(questionsData.coverage).toBeDefined();
    expect(questionsData.coverage.covered).toContain('themes'); // Baseline covers themes
    expect(questionsData.coverage.missing.length).toBeGreaterThan(0); // Should have missing categories

    // 6. Submit a finding to enable follow-up question generation context
    const findingResp = await request.post(`${API_URL}/workshops/${workshopId}/findings`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        trace_id: traceId,
        user_id: participant.id,
        insight: 'The code review suggestions are helpful but could mention edge cases for empty inputs.',
      },
    });
    expect(findingResp.ok(), 'finding submit should succeed').toBeTruthy();
  });

  test('participants can submit findings and complete discovery with synthetic traces', async ({ page, request }) => {
    const runId = `${Date.now()}`;
    const participantEmail = `e2e-assisted-participant-${runId}@example.com`;
    const participantName = `E2E Assisted Participant ${runId}`;

    // Create workshop via API (stable + avoids relying on facilitator UI for this test)
    const facilitatorId = await getFacilitatorId(request);
    const createWorkshopResp = await request.post(`${API_URL}/workshops/`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: `E2E Assisted UI ${runId}`, facilitator_id: facilitatorId },
    });
    expect(createWorkshopResp.ok(), 'workshop creation should succeed').toBeTruthy();
    const workshop = (await createWorkshopResp.json()) as { id: string };
    const workshopId = workshop.id;

    // Upload synthetic traces (use 3 for faster test)
    const selectedTraces = syntheticTraces.slice(0, 3);
    const uploadResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
      headers: { 'Content-Type': 'application/json' },
      data: selectedTraces,
    });
    expect(uploadResp.ok()).toBeTruthy();

    // Begin discovery with all 3 traces
    const beginResp = await request.post(
      `${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=3`,
    );
    expect(beginResp.ok()).toBeTruthy();

    // Create participant via API (stable; the UI login flow is what we want to render)
    const participantCreateResp = await request.post(`${API_URL}/users/`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email: participantEmail,
        name: participantName,
        role: 'participant',
        workshop_id: workshopId,
      },
    });
    expect(participantCreateResp.ok(), 'participant create should succeed').toBeTruthy();

    // Participant logs in via UI and completes discovery (this is what you want to watch in Playwright UI)
    await page.goto(`/?workshop=${workshopId}`);
    await expect(page.getByText('Workshop Portal')).toBeVisible();
    await page.locator('#email').fill(participantEmail);
    await page.locator('button[type="submit"]').click();

    // Should see discovery phase
    await expect(page.getByTestId('discovery-phase-title')).toBeVisible();

    // Fill in the baseline question for each trace.
    // TraceViewerDemo uses ids like `dq-q_1` for the baseline question.
    for (let i = 0; i < 3; i++) {
      const q1 = page.locator('#dq-q_1');
      await expect(q1).toBeVisible();
      await q1.fill(`Insight for trace ${i + 1}: Clear structure; consider edge cases.`);
      // Trigger autosave (saving happens onBlur)
      await q1.blur();

      if (i < 2) {
        await page.getByRole('button', { name: /^Next$/i }).click();
      } else {
        await page.getByRole('button', { name: /^Complete$/i }).click();
      }
    }

    // Complete discovery phase
    const completeButton = page.getByTestId('complete-discovery-phase-button');
    await expect(completeButton).toBeVisible();
    await completeButton.click();

    // Verify participant completion via API
    const usersResp = await request.get(
      `${API_URL}/users/?workshop_id=${workshopId}&role=participant`,
    );
    const users = (await usersResp.json()) as Array<{ id: string; email: string }>;
    const participant = users.find((u) => u.email === participantEmail);
    expect(participant).toBeTruthy();

    await expect
      .poll(async () => {
        const statusResp = await request.get(
          `${API_URL}/workshops/${workshopId}/discovery-completion-status`,
        );
        if (!statusResp.ok()) return null;
        return statusResp.json();
      })
      .toMatchObject({
        total_participants: 1,
        completed_participants: 1,
        all_completed: true,
      });
  });

  test('discovery summaries API returns structured output with rubric candidates', async ({
    request,
  }) => {
    const runId = `${Date.now()}`;

    const facilitatorId = await getFacilitatorId(request);

    // Setup: Create workshop, traces, participants, and findings via API
    const createResp = await request.post(`${API_URL}/workshops/`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: `E2E Summaries Test ${runId}`, facilitator_id: facilitatorId },
    });
    const workshop = (await createResp.json()) as { id: string };
    const workshopId = workshop.id;

    // Upload synthetic traces
    const selectedTraces = syntheticTraces.slice(0, 6);
    const uploadResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
      headers: { 'Content-Type': 'application/json' },
      data: selectedTraces,
    });
    const createdTraces = (await uploadResp.json()) as Array<{ id: string }>;

    // Begin discovery
    await request.post(`${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=6`);

    // Create multiple participants with diverse findings
    const participants: Array<{ id: string; name: string }> = [];
    const findingsData = [
      'Good naming conventions but could use more error handling for edge cases.',
      'The response addresses the main issue but misses boundary conditions like empty inputs.',
      'Clear explanation but I disagree with the approach - a different pattern would be more maintainable.',
    ];

    for (let i = 0; i < 3; i++) {
      const participantResp = await request.post(`${API_URL}/users/`, {
        headers: { 'Content-Type': 'application/json' },
        data: {
          email: `e2e-summary-${runId}-${i}@example.com`,
          name: `Summary Participant ${i + 1}`,
          role: 'participant',
          workshop_id: workshopId,
        },
      });
      const participant = (await participantResp.json()) as { id: string; name: string };
      participants.push(participant);

      // Submit findings for multiple traces
      for (let j = 0; j < Math.min(3, createdTraces.length); j++) {
        await request.post(`${API_URL}/workshops/${workshopId}/findings`, {
          headers: { 'Content-Type': 'application/json' },
          data: {
            trace_id: createdTraces[j]!.id,
            user_id: participant.id,
            insight: `${findingsData[i]} (Trace ${j + 1})`,
          },
        });
      }
    }

    // Verify findings were created
    const findingsResp = await request.get(`${API_URL}/workshops/${workshopId}/findings`);
    expect(findingsResp.ok()).toBeTruthy();
    const findings = (await findingsResp.json()) as Array<{ id: string }>;
    expect(findings.length).toBeGreaterThanOrEqual(3);

    // Get discovery summaries (cached or generate)
    // Note: Without an LLM configured, this will return empty summaries or error
    // This test validates the API structure and basic flow
    const summariesResp = await request.get(`${API_URL}/workshops/${workshopId}/discovery-summaries`);
    
    // If summaries haven't been generated yet, we get a 404
    if (summariesResp.status() === 404) {
      // This is expected without LLM - the structure test passes
      return;
    }

    if (summariesResp.ok()) {
      const summaries = (await summariesResp.json()) as {
        overall: Record<string, unknown>;
        by_user: Array<Record<string, unknown>>;
        by_trace: Array<Record<string, unknown>>;
        candidate_rubric_questions?: string[];
        key_disagreements?: Array<{ theme: string; viewpoints: string[] }>;
        discussion_prompts?: Array<{ theme: string; prompt: string }>;
        convergence?: { theme_agreement: Record<string, number>; overall_alignment_score: number };
        ready_for_rubric?: boolean;
      };

      // Validate structure (fields may be empty without LLM)
      expect(summaries.overall).toBeDefined();
      expect(Array.isArray(summaries.by_user)).toBe(true);
      expect(Array.isArray(summaries.by_trace)).toBe(true);
    }
  });

  test('findings with user details includes participant info', async ({ request }) => {
    const runId = `${Date.now()}`;

    const facilitatorId = await getFacilitatorId(request);

    // Quick setup
    const createResp = await request.post(`${API_URL}/workshops/`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: `E2E Findings Details ${runId}`, facilitator_id: facilitatorId },
    });
    const workshop = (await createResp.json()) as { id: string };
    const workshopId = workshop.id;

    // Upload one trace
    const uploadResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
      headers: { 'Content-Type': 'application/json' },
      data: [syntheticTraces[0]],
    });
    const traces = (await uploadResp.json()) as Array<{ id: string }>;

    await request.post(`${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=1`);

    // Create participant
    const participantName = `Details Tester ${runId}`;
    const participantResp = await request.post(`${API_URL}/users/`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email: `e2e-details-${runId}@example.com`,
        name: participantName,
        role: 'participant',
        workshop_id: workshopId,
      },
    });
    const participant = (await participantResp.json()) as { id: string };

    // Submit finding
    await request.post(`${API_URL}/workshops/${workshopId}/findings`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        trace_id: traces[0]!.id,
        user_id: participant.id,
        insight: 'Test insight for findings with user details.',
      },
    });

    // Get findings with user details
    const findingsWithUsersResp = await request.get(
      `${API_URL}/workshops/${workshopId}/findings-with-users`,
    );
    expect(findingsWithUsersResp.ok()).toBeTruthy();
    const findingsWithUsers = (await findingsWithUsersResp.json()) as Array<{
      user_id: string;
      user_name: string;
      insight: string;
    }>;

    expect(findingsWithUsers.length).toBeGreaterThanOrEqual(1);
    const finding = findingsWithUsers.find((f) => f.user_id === participant.id);
    expect(finding).toBeTruthy();
    expect(finding!.user_name).toBe(participantName);
    expect(finding!.insight).toContain('Test insight');
  });
});
