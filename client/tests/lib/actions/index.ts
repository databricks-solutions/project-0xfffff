/**
 * Action exports
 */

// Auth actions
export {
  loginAs,
  loginAsFacilitator,
  logout,
  setMockUser,
  clearSession,
} from './auth';

// Workshop actions
export {
  goToPhase,
  goToTab,
  goToFacilitatorDashboard,
  goToTraceCoverage,
  expandTraceRow,
  advanceToPhase,
  startWorkshop,
  beginDiscovery,
  beginAnnotation,
  reloadWorkshop,
  configureDiscoveryLLM,
  configureMLflow,
} from './workshop';

// Discovery actions
export {
  submitFinding,
  submitFindingViaApi,
  completeDiscovery,
  markDiscoveryCompleteViaApi,
  isDiscoveryComplete,
  getDiscoveryCompletionStatus,
  waitForDiscoveryPhase,
  // Facilitator panel actions
  DISCOVERY_CATEGORIES,
  waitForTraceDiscoveryPanel,
  getCategoryCount,
  getCategoryFindings,
  promoteFindingInUI,
  isFindingPromoted,
  updateCategoryThreshold,
  clickGenerateQuestion,
  getDisagreementsCount,
  getDisagreementSummary,
} from './discovery';
export type { DiscoveryCategory } from './discovery';

// Rubric actions
export {
  createRubricQuestion,
  createRubricViaApi,
  getRubric,
  waitForRubricSummary,
  verifyRubricQuestionInUI,
} from './rubric';

// Annotation actions
export {
  submitAnnotation,
  submitAnnotationViaApi,
  getAnnotations,
  goToNextTrace,
  goToPreviousTrace,
  waitForAnnotationInterface,
  completeAllAnnotations,
} from './annotation';
