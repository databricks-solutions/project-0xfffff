"""
Service for AI-powered rubric generation using Databricks model serving endpoints.

This service analyzes discovery findings and participant notes to generate
rubric suggestions that facilitators can review and accept.
"""

import json
import logging
from typing import List, Dict, Any

from server.services.database_service import DatabaseService
from server.services.databricks_service import DatabricksService
from server.models import RubricSuggestion

logger = logging.getLogger(__name__)

# System prompt for rubric generation
RUBRIC_GENERATION_SYSTEM_PROMPT = """You are an expert evaluation rubric designer for AI systems.

Your task: Analyze human feedback about AI responses and suggest evaluation criteria that facilitators can use to create scoring rubrics.

CRITICAL: Return ONLY a valid JSON array. No markdown, no code blocks, no explanations outside the JSON.

Required JSON structure:
[
  {
    "title": "Short criterion name (2-4 words)",
    "description": "Clear, specific definition of what this measures (1-2 sentences)",
    "positive": "What excellent responses demonstrate for this criterion",
    "negative": "What poor responses demonstrate for this criterion",
    "examples": "Concrete examples: 'Good: X. Bad: Y.'",
    "judgeType": "likert" | "binary" | "freeform"
  }
]

Guidelines for judgeType selection:
- "binary": For pass/fail, yes/no, present/absent criteria (e.g., "Contains safety warning")
- "likert": For quality scales with gradations (e.g., "Clarity of explanation")
- "freeform": Only if qualitative feedback is more valuable than numerical scores

Quality criteria for suggestions:
1. SPECIFIC: Measurable, not vague (e.g., "Response Accuracy" not "Quality")
2. NON-OVERLAPPING: Each criterion measures a distinct aspect
3. ACTIONABLE: Clear what good vs. bad looks like
4. GROUNDED: Based on patterns in the provided feedback
5. COMPREHENSIVE: Cover key themes from feedback (aim for 3-5 criteria)

Output ONLY the JSON array. No other text."""


class RubricGenerationService:
    """Service for generating rubric suggestions using AI analysis of discovery feedback."""

    def __init__(self, db_service: DatabaseService, databricks_service: DatabricksService):
        """Initialize the service with database and Databricks service dependencies."""
        self.db_service = db_service
        self.databricks_service = databricks_service

    async def generate_rubric_suggestions(
        self,
        workshop_id: str,
        endpoint_name: str = "databricks-claude-sonnet-4-5",
        temperature: float = 0.3,
        include_notes: bool = True
    ) -> List[RubricSuggestion]:
        """
        Generate rubric suggestions from discovery feedback.

        Args:
            workshop_id: Workshop ID to generate suggestions for
            endpoint_name: Databricks model serving endpoint name
            temperature: Model temperature (0.0-2.0, lower is more focused)
            include_notes: Whether to include participant notes in prompt

        Returns:
            List of validated rubric suggestions

        Raises:
            ValueError: If no discovery feedback is available
            Exception: If API call or parsing fails
        """
        logger.info(f"Generating rubric suggestions for workshop {workshop_id}")

        # 1. Fetch findings and notes
        findings = self.db_service.get_findings_with_user_details(workshop_id)
        notes = []
        if include_notes:
            notes = self.db_service.get_participant_notes(workshop_id, phase="discovery")

        if not findings and not notes:
            raise ValueError("No discovery feedback available for generation")

        logger.info(f"Found {len(findings)} findings and {len(notes)} notes")

        # 2. Build prompt
        prompt = self._build_generation_prompt(findings, notes, workshop_id)

        # 3. Call Databricks endpoint
        try:
            response = self.databricks_service.call_chat_completion(
                endpoint_name=endpoint_name,
                messages=[
                    {"role": "system", "content": RUBRIC_GENERATION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=2000
            )
        except Exception as e:
            logger.error(f"Failed to call Databricks endpoint: {e}")
            raise Exception(f"Failed to generate suggestions: {str(e)}")

        # 4. Parse and validate response
        suggestions = self._parse_suggestions(response)
        validated_suggestions = self._validate_suggestions(suggestions)

        logger.info(f"Generated {len(validated_suggestions)} validated suggestions")
        return validated_suggestions

    def _build_generation_prompt(
        self,
        findings: List[Dict[str, Any]],
        notes: List[Dict[str, Any]],
        workshop_id: str
    ) -> str:
        """
        Build the user prompt for rubric generation.

        Args:
            findings: Discovery findings with user details
            notes: Participant notes
            workshop_id: Workshop ID for context

        Returns:
            Formatted prompt string
        """
        formatted_findings = self._format_findings(findings)
        formatted_notes = self._format_notes(notes)

        # Get context information
        trace_count = len(set(f.get('trace_id') for f in findings if f.get('trace_id')))
        participant_count = len(set(f.get('user_id') for f in findings if f.get('user_id')))

        # Get workshop use case description
        use_case_section = ""
        try:
            workshop = self.db_service.get_workshop(workshop_id)
            if workshop and workshop.description:
                use_case_section = f"""## Use Case
{workshop.description}

"""
        except Exception as e:
            logger.warning(f"Could not fetch workshop description: {e}")

        prompt = f"""Analyze the following participant feedback from a discovery phase and suggest evaluation criteria.

{use_case_section}## Discovery Findings
These are participant assessments of AI response quality:

{formatted_findings}

## Participant Notes
These are freeform observations shared by participants:

{formatted_notes}

## Context
- Traces analyzed: {trace_count}
- Participants: {participant_count}

Task: Generate 3-5 evaluation criteria as a JSON array. Focus on the use case context above, recurring themes, quality concerns, and actionable distinctions between good and bad responses."""

        return prompt

    def _format_findings(self, findings: List[Dict[str, Any]]) -> str:
        """
        Format findings grouped by trace for the prompt.

        Args:
            findings: List of findings with trace_id, insight, user details

        Returns:
            Formatted findings string
        """
        if not findings:
            return "(No findings available)"

        # Group by trace
        by_trace = {}
        for finding in findings:
            # Handle both dict and object access
            trace_id = finding.get('trace_id', 'unknown') if isinstance(finding, dict) else getattr(finding, 'trace_id', 'unknown')
            if trace_id not in by_trace:
                by_trace[trace_id] = []
            insight = finding.get('insight', '') if isinstance(finding, dict) else getattr(finding, 'insight', '')
            if insight:
                by_trace[trace_id].append(insight)

        # Format with trace grouping (limit to avoid token overflow)
        formatted = []
        for i, (trace_id, insights) in enumerate(list(by_trace.items())[:15], 1):  # Max 15 traces
            if insights:
                formatted.append(f"### Trace {i}")
                for insight in insights[:5]:  # Max 5 insights per trace
                    formatted.append(f"- {insight}")
                formatted.append("")  # Blank line

        return "\n".join(formatted) if formatted else "(No findings available)"

    def _format_notes(self, notes: List[Dict[str, Any]]) -> str:
        """
        Format participant notes for the prompt.

        Args:
            notes: List of participant notes with content, user details

        Returns:
            Formatted notes string
        """
        if not notes:
            return "(No participant notes available)"

        # Format notes with user context (limit to avoid token overflow)
        formatted = []
        for note in notes[:15]:  # Max 15 notes
            # Handle both dict and object access
            if isinstance(note, dict):
                user_name = note.get('user_name', note.get('user_id', 'Unknown'))
                content = note.get('content', '')
            else:
                user_name = getattr(note, 'user_name', None) or getattr(note, 'user_id', 'Unknown')
                content = getattr(note, 'content', '')

            if content:
                formatted.append(f"[{user_name}]: {content}")

        return "\n".join(formatted) if formatted else "(No participant notes available)"

    def _parse_suggestions(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse AI response to extract rubric suggestions.

        Args:
            response: Response from Databricks endpoint

        Returns:
            List of parsed suggestion dictionaries

        Raises:
            Exception: If parsing fails
        """
        try:
            # Extract content from response
            # Response format: {"choices": [{"message": {"content": "..."}}]}
            content = response.get('choices', [{}])[0].get('message', {}).get('content', '')

            if not content:
                logger.error("Empty response content")
                raise Exception("Empty response from AI model")

            # Try to parse as JSON
            # First, try direct JSON parsing
            try:
                suggestions = json.loads(content)
            except json.JSONDecodeError:
                # Fallback: try to extract JSON from markdown code blocks
                logger.warning("Direct JSON parsing failed, trying fallback extraction")
                suggestions = self._extract_json_from_markdown(content)

            if not isinstance(suggestions, list):
                logger.error(f"Parsed content is not a list: {type(suggestions)}")
                raise Exception("AI response is not a JSON array")

            logger.info(f"Parsed {len(suggestions)} suggestions from response")
            return suggestions

        except Exception as e:
            logger.error(f"Failed to parse AI response: {e}")
            logger.error(f"Response content: {response}")
            raise Exception(f"Failed to parse suggestions: {str(e)}")

    def _extract_json_from_markdown(self, content: str) -> List[Dict[str, Any]]:
        """
        Extract JSON from markdown code blocks.

        Args:
            content: Content that may contain JSON in markdown code blocks

        Returns:
            Parsed JSON list

        Raises:
            Exception: If extraction fails
        """
        # Try to find JSON between ```json and ``` or ``` and ```
        import re

        # Pattern 1: ```json ... ```
        pattern1 = r'```json\s*([\s\S]*?)\s*```'
        match = re.search(pattern1, content)

        if not match:
            # Pattern 2: ``` ... ```
            pattern2 = r'```\s*([\s\S]*?)\s*```'
            match = re.search(pattern2, content)

        if match:
            json_str = match.group(1).strip()
            return json.loads(json_str)

        # If no code blocks found, try to parse the content as-is
        raise Exception("Could not extract JSON from markdown")

    def _validate_suggestions(self, suggestions: List[Dict[str, Any]]) -> List[RubricSuggestion]:
        """
        Validate and sanitize AI-generated suggestions.

        Args:
            suggestions: List of raw suggestion dictionaries

        Returns:
            List of validated RubricSuggestion objects
        """
        validated = []

        for i, suggestion in enumerate(suggestions):
            try:
                # Required fields
                title = suggestion.get('title', '').strip()
                description = suggestion.get('description', '').strip()

                if not title or len(title) < 3:
                    logger.warning(f"Suggestion {i} has invalid title, skipping")
                    continue

                if not description or len(description) < 10:
                    logger.warning(f"Suggestion {i} has invalid description, skipping")
                    continue

                # Sanitize lengths
                if len(title) > 100:
                    title = title[:97] + '...'

                if len(description) > 1000:
                    description = description[:997] + '...'

                # Optional fields with length limits
                positive = suggestion.get('positive', '')
                if positive and len(positive) > 500:
                    positive = positive[:497] + '...'

                negative = suggestion.get('negative', '')
                if negative and len(negative) > 500:
                    negative = negative[:497] + '...'

                examples = suggestion.get('examples', '')
                if examples and len(examples) > 500:
                    examples = examples[:497] + '...'

                # Validate and sanitize judge type
                judge_type = suggestion.get('judgeType', 'likert').lower()
                if judge_type not in ['likert', 'binary', 'freeform']:
                    logger.warning(f"Invalid judgeType '{judge_type}', defaulting to 'likert'")
                    judge_type = 'likert'

                # Create validated suggestion
                validated_suggestion = RubricSuggestion(
                    title=title,
                    description=description,
                    positive=positive if positive else None,
                    negative=negative if negative else None,
                    examples=examples if examples else None,
                    judgeType=judge_type
                )

                validated.append(validated_suggestion)

            except Exception as e:
                logger.warning(f"Failed to validate suggestion {i}: {e}")
                continue

        if not validated:
            logger.error("No valid suggestions could be generated")
            raise Exception("Failed to generate valid suggestions")

        return validated
