#!/usr/bin/env python3
"""
Reproduce the discovery analysis JSON extraction error.

Simulates what DiscoveryAnalysisService.distill() does: builds a single prompt
from system + template instruction + formatted feedback + disagreements, then
sends it to Claude Opus 4.6 with max_tokens=4000.

With enough feedback entries, the prompt exceeds context limits and the
response is either truncated (malformed JSON) or the API rejects it outright.

Usage:
    # Uses ANTHROPIC_API_KEY from env
    python scripts/repro_discovery_context_overflow.py

    # Override trace/entry counts to find the threshold
    python scripts/repro_discovery_context_overflow.py --traces 20 --entries 10
"""

import argparse
import json
import os
import re
import sys
import uuid

from openai import OpenAI


# ---------------------------------------------------------------------------
# Prompts copied verbatim from discovery_analysis_service.py
# ---------------------------------------------------------------------------

ANALYSIS_SYSTEM_PROMPT = """You are an expert evaluation analyst reviewing participant feedback on AI/LLM responses.

Your job is to analyze aggregated feedback, detect patterns, and produce structured JSON output.

CRITICAL: Return ONLY valid JSON matching the schema below. No markdown, no code blocks, no commentary outside the JSON.

Required JSON structure:
{
  "findings": [
    {
      "text": "Description of the finding (criterion or theme)",
      "evidence_trace_ids": ["trace-id-1", "trace-id-2"],
      "priority": "high" | "medium" | "low"
    }
  ],
  "high_priority_disagreements": [
    {
      "trace_id": "trace-id",
      "summary": "What they disagreed about",
      "underlying_theme": "Quality dimension at play",
      "followup_questions": ["Question 1", "Question 2"],
      "facilitator_suggestions": ["Suggestion 1"]
    }
  ],
  "medium_priority_disagreements": [ ... same structure ... ],
  "lower_priority_disagreements": [ ... same structure ... ],
  "summary": "Brief overall summary of the analysis (1-3 sentences)"
}
"""

EVALUATION_CRITERIA_PROMPT = """Analyze the participant feedback below to extract evaluation criteria and
analyze disagreements between reviewers.

## Findings: Evaluation Criteria

Distill specific, actionable evaluation criteria from the feedback. Each
criterion should describe one quality dimension that could be used to assess
future responses. Focus on:
- User preferences and expectations for quality
- Specific aspects users care about (tone, accuracy, efficiency, empathy, etc.)
- Patterns in what makes responses "good" vs "needs improvement"

For each criterion, cite the trace IDs that provide evidence and assign a
priority (high/medium/low) based on how frequently or strongly it appears
in the feedback.

## Disagreement Analysis

For each detected disagreement, analyze:
- HIGH PRIORITY (rating disagreements — one GOOD, one BAD): What quality
  dimension is unclear? What follow-up questions would resolve it? What
  concrete calibration actions should the facilitator take?
- MEDIUM PRIORITY (both BAD, different issues): What different problems
  were identified? Are they independent or related? Which should be fixed
  first?
- LOWER PRIORITY (both GOOD, different strengths): What different aspects
  were valued? Do these reflect different user types or priorities?"""


# ---------------------------------------------------------------------------
# Synthetic data generators — realistic discovery feedback
# ---------------------------------------------------------------------------

SAMPLE_INPUTS = [
    "How do I reset my password for the enterprise dashboard?",
    "Can you explain the difference between batch processing and stream processing?",
    "Write a Python function to merge two sorted linked lists.",
    "What are the best practices for securing a REST API?",
    "Help me debug this SQL query that's returning duplicate rows.",
    "Summarize the key points from our Q3 earnings call.",
    "Draft an email to the engineering team about the upcoming migration.",
    "What's the recommended way to handle authentication in microservices?",
    "Explain how transformer attention mechanisms work to a junior engineer.",
    "Review this pull request description and suggest improvements.",
    "How should we structure our data pipeline for real-time analytics?",
    "What are the tradeoffs between using a monorepo vs polyrepo?",
    "Help me write unit tests for this authentication middleware.",
    "Explain the CAP theorem and how it applies to our distributed database.",
    "Draft a technical design doc for the new notification service.",
    "What's the best approach for migrating from REST to GraphQL incrementally?",
    "How do I optimize this slow database query that joins five tables?",
    "Explain Kubernetes pod scheduling to someone who only knows Docker.",
    "Write a retry mechanism with exponential backoff for our API client.",
    "What security considerations should we address before launching the public API?",
]

SAMPLE_OUTPUTS = [
    "To reset your password, navigate to Settings > Security > Change Password. You'll need your current password or you can use the 'Forgot Password' link which will send a reset email to your registered address. For enterprise accounts, your IT administrator may need to approve the reset if SSO is enabled. The new password must meet complexity requirements: at least 12 characters, one uppercase, one lowercase, one number, and one special character.",
    "Batch processing handles data in large chunks at scheduled intervals — think nightly ETL jobs. Stream processing handles data continuously as it arrives — think real-time dashboards. Batch is simpler, cheaper for large volumes, and easier to debug. Streaming gives lower latency but is more complex to operate. Many modern architectures use both: streaming for real-time needs, batch for historical analysis and corrections.",
    "Here's a Python function to merge two sorted linked lists using an iterative approach with a dummy head node. The function compares nodes from both lists and appends the smaller one to the result. Time complexity is O(n+m) where n and m are the lengths of the two lists. Space complexity is O(1) since we only rearrange existing nodes.",
    "Key REST API security best practices: 1) Always use HTTPS/TLS. 2) Implement OAuth 2.0 or JWT for authentication. 3) Rate limit all endpoints. 4) Validate and sanitize all inputs. 5) Use parameterized queries to prevent SQL injection. 6) Implement proper CORS policies. 7) Log all access attempts. 8) Use API versioning. 9) Implement request size limits. 10) Regular security audits and penetration testing.",
    "The duplicate rows are likely caused by the JOIN on the orders table creating a cartesian product when there are multiple matching rows in the line_items table. Try adding a DISTINCT clause or restructuring with a subquery that aggregates line_items first before joining. Also check if the created_at filter is inclusive on both ends, which could pull in edge-case duplicates at midnight boundaries.",
]

SAMPLE_COMMENTS_GOOD = [
    "The response was thorough and well-structured. It covered all the edge cases I was thinking about and even mentioned some I hadn't considered. The step-by-step format made it easy to follow.",
    "Excellent explanation that balances technical depth with accessibility. The analogies used were particularly helpful for understanding complex concepts. Would be great for onboarding new team members.",
    "Very practical advice with concrete examples. I appreciated that it didn't just list best practices but explained why each one matters and when you might prioritize one over another.",
    "Clear, concise, and actionable. The response got straight to the point without unnecessary preamble. The code example was correct and followed our team's style conventions.",
    "Good job anticipating follow-up questions. The response proactively addressed common gotchas and provided links to relevant documentation. This saves significant back-and-forth.",
    "The response demonstrated strong understanding of the domain context. It correctly identified the root cause and suggested a fix that aligns with our existing architecture patterns.",
    "Impressive level of detail without being overwhelming. The response used progressive disclosure well — started with the simple answer, then dove deeper for those who need it.",
    "The tone was professional and empathetic. It acknowledged the complexity of the problem before diving into solutions, which makes the user feel heard rather than lectured at.",
]

SAMPLE_COMMENTS_BAD = [
    "The response was too generic and didn't account for our specific tech stack. We're using Kubernetes with Istio service mesh, and the advice given would actually conflict with our existing mTLS setup.",
    "Missed critical security implications. The suggested approach would expose internal service endpoints to the public internet. This could have been a serious vulnerability if deployed as-is.",
    "The code example had a subtle bug — it doesn't handle the case where the input list is empty, which would cause a NullPointerException in production. Should have included edge case handling.",
    "Way too verbose. The user asked a simple yes/no question and got a 500-word essay. For experienced engineers, this level of hand-holding is patronizing and wastes time.",
    "The response confidently stated incorrect information about the API rate limits. The actual limits are documented differently, and following this advice would lead to throttling issues.",
    "Failed to consider the performance implications. The suggested query would do a full table scan on a 100M row table. Should have recommended adding an index or using a materialized view.",
    "The explanation was technically correct but completely missed the user's actual intent. They were asking about a workaround for a known bug, not about the general concept.",
    "Inconsistent recommendations — the first paragraph says to use approach A, then later switches to approach B without explaining why. This would confuse anyone trying to follow the advice.",
]

SAMPLE_QUESTIONS = [
    "What specific aspect of the response quality stood out to you most?",
    "How well did the response address the user's underlying intent vs. their literal question?",
    "Would this response be appropriate for users with different experience levels?",
    "Did the response handle edge cases and error scenarios adequately?",
    "How would you rate the response's technical accuracy on a scale of 1-5?",
    "Was the level of detail appropriate for the context, or was it over/under-explained?",
    "Did the response follow a logical structure that would be easy to act on?",
    "Were there any safety or security concerns with the suggested approach?",
    "How well did the response balance completeness with conciseness?",
    "Would you trust this response enough to implement it without further verification?",
]

SAMPLE_ANSWERS_GOOD = [
    "The structured approach really stood out. Breaking down the problem into clear steps makes it much easier to follow and implement. I've seen many responses that just dump information without organization.",
    "It addressed both the literal question and the underlying intent very well. The user clearly wanted a practical solution, not just theory, and the response delivered exactly that with working code examples.",
    "Yes, I think it works for multiple levels. The progressive disclosure approach means beginners get the simple answer first, while experts can read deeper into the nuances without feeling patronized.",
    "Edge cases were handled well — particularly the null input case and the concurrent access scenario. These are the kinds of things that cause production issues and they were proactively addressed.",
    "I'd rate it a 4/5 on accuracy. Everything stated was correct, but it missed mentioning the deprecation of the old API endpoint which could be important for teams on older versions.",
    "The detail level was just right for someone who has basic familiarity with the concept but needs guidance on the specific implementation. Not too basic, not too advanced.",
    "The logical structure was excellent — problem identification, root cause analysis, solution options with tradeoffs, and recommended approach. This is exactly how technical guidance should be organized.",
    "No major security concerns. The response correctly recommended using environment variables for secrets and mentioned the importance of input validation. Good security awareness throughout.",
]

SAMPLE_ANSWERS_BAD = [
    "The response felt like it was generated from a template without considering our specific context. Generic advice that doesn't account for our infrastructure constraints isn't helpful.",
    "It addressed the literal question but completely missed the underlying intent. The user was clearly frustrated with a recurring issue, and the response didn't acknowledge that or suggest a permanent fix.",
    "No, this would confuse junior developers. The response uses advanced terminology without explanation and assumes familiarity with concepts that aren't covered in our onboarding docs.",
    "Edge cases were barely mentioned. The happy path was well-explained, but real-world usage involves error handling, timeouts, retries, and concurrent access — none of which were addressed.",
    "I'd rate it 2/5 on accuracy. The core concept was right, but the specific implementation details were wrong for our version of the framework. Following this would lead to runtime errors.",
    "Way too much detail for a simple question. Three paragraphs of background context before getting to the one-line answer is frustrating. Experienced engineers need direct answers.",
    "The structure was confusing — it jumped between different solutions without clearly comparing them or recommending one. I finished reading and still didn't know what to do.",
    "There's a significant security concern: the suggested approach stores tokens in localStorage, which is vulnerable to XSS attacks. Should have recommended httpOnly cookies or a backend session.",
]


def generate_trace_id() -> str:
    return str(uuid.uuid4())[:12]


def generate_feedback_entries(num_entries: int, trace_idx: int) -> list[dict]:
    """Generate realistic feedback entries for a trace."""
    entries = []
    for i in range(num_entries):
        is_good = (i + trace_idx) % 3 != 0  # ~2/3 good, ~1/3 bad
        label = "good" if is_good else "bad"
        comments = SAMPLE_COMMENTS_GOOD if is_good else SAMPLE_COMMENTS_BAD
        answers = SAMPLE_ANSWERS_GOOD if is_good else SAMPLE_ANSWERS_BAD

        # Build follow-up QA pairs — these are unbounded in the real code
        followup_qna = []
        for q_idx in range(3):
            followup_qna.append({
                "question": SAMPLE_QUESTIONS[(i + q_idx + trace_idx) % len(SAMPLE_QUESTIONS)],
                "answer": answers[(i + q_idx + trace_idx) % len(answers)],
            })

        entries.append({
            "user": f"participant_{i + 1}@databricks.com",
            "label": label,
            "comment": comments[(i + trace_idx) % len(comments)],
            "followup_qna": followup_qna,
        })
    return entries


def build_aggregated_data(num_traces: int, entries_per_trace: int) -> dict:
    """Build the same aggregated structure that DiscoveryAnalysisService produces."""
    aggregated = {}
    for t in range(num_traces):
        trace_id = generate_trace_id()
        aggregated[trace_id] = {
            "input": SAMPLE_INPUTS[t % len(SAMPLE_INPUTS)],
            "output": SAMPLE_OUTPUTS[t % len(SAMPLE_OUTPUTS)],
            "feedback_entries": generate_feedback_entries(entries_per_trace, t),
        }
    return aggregated


def detect_disagreements(aggregated: dict) -> dict:
    """Same logic as DiscoveryAnalysisService.detect_disagreements."""
    result = {"high": [], "medium": [], "lower": []}
    for trace_id, data in aggregated.items():
        entries = data["feedback_entries"]
        if len(entries) < 2:
            continue
        labels = {e["label"].lower() for e in entries}
        if "good" in labels and "bad" in labels:
            result["high"].append(trace_id)
        elif labels == {"bad"}:
            result["medium"].append(trace_id)
        elif labels == {"good"}:
            result["lower"].append(trace_id)
    return result


# ---------------------------------------------------------------------------
# Prompt formatting — copied from discovery_analysis_service.py
# ---------------------------------------------------------------------------

def format_feedback_for_prompt(aggregated: dict) -> str:
    """Exact same logic as DiscoveryAnalysisService._format_feedback_for_prompt."""
    parts = []
    for trace_id, data in list(aggregated.items())[:20]:
        parts.append(f"### Trace {trace_id}")
        parts.append(f"**Input:** {data['input'][:500]}")
        parts.append(f"**Output:** {data['output'][:500]}")
        for entry in data["feedback_entries"][:10]:
            label = entry["label"].upper()
            parts.append(f"- [{label}] {entry['comment']}")  # NO TRUNCATION
            for qna in entry.get("followup_qna", [])[:3]:
                parts.append(f"  Q: {qna.get('question', '')}")  # NO TRUNCATION
                parts.append(f"  A: {qna.get('answer', '')}")    # NO TRUNCATION
        parts.append("")
    return "\n".join(parts)


def format_disagreements_for_prompt(disagreements: dict, aggregated: dict) -> str:
    """Exact same logic as DiscoveryAnalysisService._format_disagreements_for_prompt."""
    parts = []
    for tier, label in [("high", "HIGH"), ("medium", "MEDIUM"), ("lower", "LOWER")]:
        trace_ids = disagreements.get(tier, [])
        if trace_ids:
            parts.append(f"**{label} PRIORITY** ({len(trace_ids)} traces): {', '.join(trace_ids)}")
        else:
            parts.append(f"**{label} PRIORITY**: None detected")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# JSON parsing — copied from discovery_analysis_service.py
# ---------------------------------------------------------------------------

def parse_distillation_response(response) -> dict:
    """Same logic as DiscoveryAnalysisService._parse_distillation_response."""
    content = response.choices[0].message.content or ""
    finish_reason = response.choices[0].finish_reason

    if not content:
        raise Exception("Empty response from AI model")

    # Try direct JSON parse
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Fallback: extract JSON from markdown code blocks
        pattern1 = r"```json\s*([\s\S]*?)\s*```"
        match = re.search(pattern1, content)
        if not match:
            pattern2 = r"```\s*([\s\S]*?)\s*```"
            match = re.search(pattern2, content)
        if match:
            data = json.loads(match.group(1).strip())
        else:
            raise Exception("Could not extract JSON from response")

    if not isinstance(data, dict):
        raise Exception("AI response is not a JSON object")

    return data


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Reproduce discovery analysis context overflow")
    parser.add_argument("--traces", type=int, default=20, help="Number of traces (default: 20, max in real code)")
    parser.add_argument("--entries", type=int, default=10, help="Feedback entries per trace (default: 10, max in real code)")
    parser.add_argument("--max-tokens", type=int, default=4000, help="Max output tokens (default: 4000, same as real code)")
    parser.add_argument("--dry-run", action="store_true", help="Just print prompt stats, don't call API")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable", file=sys.stderr)
        sys.exit(1)

    # Build data
    print(f"Generating synthetic data: {args.traces} traces x {args.entries} entries/trace...")
    aggregated = build_aggregated_data(args.traces, args.entries)
    disagreements = detect_disagreements(aggregated)

    print(f"  Disagreements — high: {len(disagreements['high'])}, "
          f"medium: {len(disagreements['medium'])}, lower: {len(disagreements['lower'])}")

    # Build prompt exactly as the service does
    feedback_text = format_feedback_for_prompt(aggregated)
    disagreement_text = format_disagreements_for_prompt(disagreements, aggregated)

    user_message = f"""{EVALUATION_CRITERIA_PROMPT}

## Feedback Data

{feedback_text}

## Detected Disagreements

{disagreement_text}"""

    # Stats
    system_chars = len(ANALYSIS_SYSTEM_PROMPT)
    user_chars = len(user_message)
    total_chars = system_chars + user_chars
    est_tokens = total_chars // 4  # rough estimate

    print(f"\n--- Prompt stats ---")
    print(f"  System message:  {system_chars:>8,} chars")
    print(f"  User message:    {user_chars:>8,} chars")
    print(f"  Total:           {total_chars:>8,} chars")
    print(f"  Est. tokens:     {est_tokens:>8,} (~chars/4)")
    print(f"  Max output:      {args.max_tokens:>8,} tokens")
    print(f"  Est. total:      {est_tokens + args.max_tokens:>8,} tokens (prompt + output)")
    print()

    if args.dry_run:
        print("--- Dry run, not calling API ---")
        print(f"\nFirst 500 chars of user message:\n{user_message[:500]}...")
        print(f"\nLast 500 chars of user message:\n...{user_message[-500:]}")
        return

    # Call Claude Opus 4.6 via OpenAI-compatible API
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.anthropic.com/v1/",
    )

    print("Calling Claude Opus 4.6 with max_tokens={args.max_tokens}...")
    try:
        response = client.chat.completions.create(
            model="claude-opus-4-6",
            messages=[
                {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=args.max_tokens,
        )
    except Exception as e:
        print(f"\n!!! API call failed: {type(e).__name__}: {e}")
        sys.exit(1)

    # Check finish_reason — this is what the real code DOESN'T do
    finish_reason = response.choices[0].finish_reason
    content = response.choices[0].message.content or ""
    usage = response.usage

    print(f"\n--- Response stats ---")
    print(f"  finish_reason:      {finish_reason}")
    print(f"  Response length:    {len(content):,} chars")
    if usage:
        print(f"  Prompt tokens:      {usage.prompt_tokens:,}")
        print(f"  Completion tokens:  {usage.completion_tokens:,}")
        print(f"  Total tokens:       {usage.total_tokens:,}")

    if finish_reason == "length":
        print(f"\n!!! Response was TRUNCATED (finish_reason='length')")
        print(f"    The model hit max_tokens={args.max_tokens} before finishing the JSON.")
        print(f"    This is the bug — truncated JSON can't be parsed.")

    # Try parsing exactly as the service does
    print(f"\nAttempting JSON parse (same as _parse_distillation_response)...")
    try:
        data = parse_distillation_response(response)
        print(f"  SUCCESS — parsed {len(data.get('findings', []))} findings")
        print(f"  Summary: {data.get('summary', '(none)')[:200]}")
    except Exception as e:
        print(f"\n!!! JSON parse FAILED: {e}")
        print(f"\n--- Last 300 chars of response (likely truncated JSON): ---")
        print(content[-300:])


if __name__ == "__main__":
    main()
