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
  advanceToPhase,
  startWorkshop,
  beginDiscovery,
  beginAnnotation,
  reloadWorkshop,
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
} from './discovery';

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
