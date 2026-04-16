/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DiscoveryComment = {
    id: string;
    workshop_id: string;
    trace_id: string;
    milestone_ref?: (string | null);
    parent_comment_id?: (string | null);
    user_id: string;
    user_name: string;
    user_email: string;
    user_role: string;
    author_type?: string;
    body: string;
    upvotes?: number;
    downvotes?: number;
    score?: number;
    viewer_vote?: number;
    created_at: string;
    updated_at: string;
};

