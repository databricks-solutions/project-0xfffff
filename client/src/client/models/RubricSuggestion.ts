/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * AI-generated rubric suggestion.
 */
export type RubricSuggestion = {
    /**
     * Short criterion name
     */
    title: string;
    /**
     * Clear definition of what this measures
     */
    description: string;
    /**
     * What excellent responses demonstrate
     */
    positive?: (string | null);
    /**
     * What poor responses demonstrate
     */
    negative?: (string | null);
    /**
     * Concrete examples of good and bad
     */
    examples?: (string | null);
    /**
     * Judge type
     */
    judgeType?: string;
};

