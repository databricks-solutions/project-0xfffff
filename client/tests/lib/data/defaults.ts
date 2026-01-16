/**
 * Default test data values
 *
 * Provides sensible defaults for test scenarios.
 */

import type { WorkshopPhase, UserRole } from '../types';

/**
 * Default facilitator credentials (matches config/auth.yaml in dev)
 */
export const DEFAULT_FACILITATOR = {
  email: 'facilitator123@email.com',
  password: 'facilitator123',
  name: 'Test Facilitator',
};

/**
 * Default API URL
 */
export const DEFAULT_API_URL =
  process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

/**
 * Default base URL for the app
 */
export const DEFAULT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Sample trace inputs for realistic test data
 */
export const SAMPLE_TRACE_INPUTS = [
  'How do I reset my password?',
  'What are the system requirements?',
  'Can you explain the pricing tiers?',
  'How do I export my data?',
  'Is there an API available?',
  'How do I cancel my subscription?',
  'What payment methods do you accept?',
  'How do I contact support?',
  'Can I upgrade my plan?',
  'How do I enable two-factor authentication?',
];

/**
 * Sample trace outputs for realistic test data
 */
export const SAMPLE_TRACE_OUTPUTS = [
  'To reset your password, go to Settings > Security > Change Password. If you are locked out, click "Forgot Password" on the login page.',
  'The system requires a modern web browser (Chrome, Firefox, Safari, or Edge) and a stable internet connection. We recommend at least 4GB RAM for optimal performance.',
  'We offer three pricing tiers: Free (limited features), Pro ($19/month), and Enterprise (custom pricing). Each tier includes progressively more features and support.',
  'You can export your data from Settings > Data > Export. We support CSV, JSON, and Excel formats. The export includes all your records from the selected date range.',
  'Yes! We have a comprehensive REST API. Documentation is available at docs.example.com/api. You will need an API key which you can generate from Settings > Integrations.',
  'To cancel your subscription, go to Settings > Billing > Subscription and click "Cancel Subscription". You will retain access until the end of your billing period.',
  'We accept all major credit cards (Visa, Mastercard, American Express) as well as PayPal. Enterprise customers can also pay by invoice.',
  'You can contact support via the Help button in the app, by emailing support@example.com, or through our live chat during business hours (9 AM - 6 PM EST).',
  'You can upgrade your plan at any time from Settings > Billing > Upgrade. The price difference will be prorated for your current billing period.',
  'To enable 2FA, go to Settings > Security > Two-Factor Authentication. You can use either SMS or an authenticator app like Google Authenticator.',
];

/**
 * Sample discovery finding insights
 */
export const SAMPLE_INSIGHTS = [
  'The response is clear and actionable. It provides step-by-step instructions that users can follow easily.',
  'Good response but could be more concise. Some users might find the explanation too lengthy.',
  'Missing important context about prerequisites. Should mention what permissions are needed.',
  'Excellent response that anticipates follow-up questions. The additional tips are helpful.',
  'The response is accurate but uses too much technical jargon. Could be simplified for general users.',
  'Well-structured response with good use of formatting. The numbered steps make it easy to follow.',
  'Response could benefit from including a link to relevant documentation.',
  'Good handling of edge cases mentioned. The alternative options provided are useful.',
];

/**
 * Generate a unique test run ID
 */
export function generateRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique email for a test user
 */
export function generateTestEmail(role: UserRole, runId: string): string {
  return `e2e-${role}-${runId}@test.example.com`;
}

/**
 * Generate a test user name
 */
export function generateTestName(role: UserRole, index: number): string {
  const roleNames = {
    facilitator: 'Facilitator',
    sme: 'SME Expert',
    participant: 'Participant',
  };
  return `Test ${roleNames[role]} ${index + 1}`;
}

/**
 * Get the previous phases for a given phase (phases that should be marked complete)
 */
export function getPreviousPhases(phase: WorkshopPhase): WorkshopPhase[] {
  const phaseOrder: WorkshopPhase[] = [
    'intake',
    'discovery',
    'rubric',
    'annotation',
    'results',
    'judge_tuning',
    'unity_volume',
  ];
  const index = phaseOrder.indexOf(phase);
  return phaseOrder.slice(0, index);
}

/**
 * Check if discovery should be started for a given phase
 */
export function shouldDiscoveryBeStarted(phase: WorkshopPhase): boolean {
  return ['discovery', 'rubric', 'annotation', 'results', 'judge_tuning', 'unity_volume'].includes(phase);
}

/**
 * Check if annotation should be started for a given phase
 */
export function shouldAnnotationBeStarted(phase: WorkshopPhase): boolean {
  return ['annotation', 'results', 'judge_tuning', 'unity_volume'].includes(phase);
}
