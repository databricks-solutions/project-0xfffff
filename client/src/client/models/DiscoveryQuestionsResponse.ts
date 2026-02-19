/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscoveryCoverage } from './DiscoveryCoverage';
import type { DiscoveryQuestion } from './DiscoveryQuestion';
/**
 * Response model for discovery questions with coverage metadata.
 */
export type DiscoveryQuestionsResponse = {
    questions: Array<DiscoveryQuestion>;
    can_generate_more?: boolean;
    stop_reason?: (string | null);
    coverage: DiscoveryCoverage;
};

