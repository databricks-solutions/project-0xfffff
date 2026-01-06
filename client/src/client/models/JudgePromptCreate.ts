/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JudgeType } from './JudgePrompt';

/**
 * Request model for creating a judge prompt.
 */
export type JudgePromptCreate = {
    /**
     * The judge prompt text
     */
    prompt_text: string;
    /**
     * Type of judge: rubric, binary, or freeform
     */
    judge_type?: JudgeType;
    /**
     * Selected few-shot example trace IDs
     */
    few_shot_examples?: (Array<string> | null);
    /**
     * Model to use: demo, databricks-dbrx-instruct, openai-gpt-4, etc.
     */
    model_name?: (string | null);
    /**
     * Model parameters like temperature
     */
    model_parameters?: (Record<string, any> | null);
    /**
     * Custom labels for binary judge
     */
    binary_labels?: (Record<string, string> | null);
    /**
     * Rating scale for rubric judge (default 5-point)
     */
    rating_scale?: number;
};

