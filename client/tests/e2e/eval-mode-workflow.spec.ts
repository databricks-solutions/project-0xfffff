import { expect, test } from '@playwright/test';

const FACILITATOR_EMAIL = process.env.E2E_FACILITATOR_EMAIL ?? 'facilitator123@email.com';
const FACILITATOR_PASSWORD = process.env.E2E_FACILITATOR_PASSWORD ?? 'facilitator123';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test(
  'eval mode supports per-trace criteria and scoring',
  { tag: ['@spec:EVAL_MODE_SPEC'] },
  async ({ request }) => {
    const loginResp = await request.post(`${API_URL}/users/auth/login`, {
      data: {
        email: FACILITATOR_EMAIL,
        password: FACILITATOR_PASSWORD,
      },
    });
    expect(loginResp.ok()).toBeTruthy();
    const loginBody = await loginResp.json();
    const facilitatorId = loginBody.user.id as string;

    const createWorkshopResp = await request.post(`${API_URL}/workshops/`, {
      data: {
        name: 'E2E Eval Mode Workshop',
        description: 'E2E eval mode creation and scoring',
        facilitator_id: facilitatorId,
        mode: 'eval',
      },
    });
    expect(createWorkshopResp.ok()).toBeTruthy();
    const workshop = await createWorkshopResp.json();
    const workshopId = workshop.id as string;
    expect(workshop.mode).toBe('eval');

    const traceResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
      data: [
        {
          input: 'User asks for billing support.',
          output: 'Agent provides a concrete next step.',
        },
      ],
    });
    expect(traceResp.ok()).toBeTruthy();
    const trace = (await traceResp.json())[0];

    const criterionResp = await request.post(`${API_URL}/workshops/${workshopId}/traces/${trace.id}/criteria`, {
      data: {
        text: 'Contains a concrete next step',
        criterion_type: 'standard',
        weight: 5,
        created_by: facilitatorId,
      },
    });
    expect(criterionResp.ok()).toBeTruthy();

    const rubricResp = await request.get(`${API_URL}/workshops/${workshopId}/traces/${trace.id}/rubric`);
    expect(rubricResp.ok()).toBeTruthy();
    const rubric = await rubricResp.json();
    expect(rubric.markdown).toContain('Contains a concrete next step');

    const scoreResp = await request.get(`${API_URL}/workshops/${workshopId}/eval-results?trace_id=${trace.id}`);
    expect(scoreResp.ok()).toBeTruthy();
    const scores = await scoreResp.json();
    expect(Array.isArray(scores)).toBeTruthy();
    expect(scores[0].trace_id).toBe(trace.id);
    expect(typeof scores[0].normalized_score).toBe('number');
  }
);
