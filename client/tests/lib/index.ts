/**
 * E2E Test Infrastructure
 *
 * Provides a fluent builder API for creating e2e test scenarios.
 *
 * @example
 * ```typescript
 * import { TestScenario } from './lib';
 *
 * test('facilitator creates rubric', async ({ page }) => {
 *   const scenario = await TestScenario.create(page)
 *     .withWorkshop()
 *     .withFacilitator()
 *     .withParticipants(2)
 *     .withTraces(5)
 *     .inPhase('rubric')
 *     .build();
 *
 *   await scenario.loginAs(scenario.facilitator);
 *   await scenario.createRubricQuestion({ question: 'How helpful?' });
 * });
 * ```
 */

// Main builder
export { TestScenario } from './scenario-builder';

// Types
export type {
  // Model types (re-exported from client)
  User,
  UserRole,
  UserStatus,
  Workshop,
  WorkshopPhase,
  WorkshopStatus,
  Trace,
  Rubric,
  Annotation,
  DiscoveryFinding,
  UserPermissions,
  AuthResponse,
  // Builder types
  WorkshopConfig,
  UserConfig,
  TraceConfig,
  RubricConfig,
  FindingConfig,
  AnnotationConfig,
  BuiltScenario,
  PageActions,
  ScenarioApi,
  UsersByRole,
} from './types';

// Actions (for direct use if needed)
export * as actions from './actions';

// Mock utilities (for advanced use cases)
export {
  ApiMocker,
  UserBuilder,
  WorkshopBuilder,
  TraceBuilder,
  RubricBuilder,
  FindingBuilder,
  AnnotationBuilder,
  buildPermissions,
  buildAuthResponse,
  generateId,
  resetIdCounter,
} from './mocks';

// Data defaults
export {
  DEFAULT_FACILITATOR,
  DEFAULT_API_URL,
  DEFAULT_BASE_URL,
  SAMPLE_TRACE_INPUTS,
  SAMPLE_TRACE_OUTPUTS,
  SAMPLE_INSIGHTS,
  generateRunId,
  generateTestEmail,
  generateTestName,
} from './data';
