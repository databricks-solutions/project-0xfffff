"""
DSPy signature for discovery findings distillation.

This is a placeholder for the full DSPy integration. The
DiscoveryAnalysisService currently uses DatabricksService.call_chat_completion()
directly. Once Step 1's DSPy infrastructure merges, swap the distill() call
to use dspy.Predict(DistillFindings).
"""

try:
    import dspy

    from server.models import DistillationOutput

    class DistillFindings(dspy.Signature):
        """Analyze participant feedback to extract findings and disagreement insights."""

        instruction: str = dspy.InputField(desc="Template-specific analysis instruction")
        feedback_data: str = dspy.InputField(desc="Aggregated feedback with trace context")
        detected_disagreements: str = dspy.InputField(desc="Pre-detected disagreement tiers")
        output: DistillationOutput = dspy.OutputField()

except ImportError:
    # DSPy is optional; the service falls back to direct LLM calls.
    DistillFindings = None  # type: ignore[assignment,misc]
