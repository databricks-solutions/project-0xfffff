import { describe, expect, it } from 'vitest';
import {
  formatRubricQuestions,
  parseRubricQuestions,
  QUESTION_DELIMITER,
  type RubricQuestion,
} from './rubricUtils';

// Judge type delimiter used internally
const JUDGE_TYPE_DELIMITER = '|||JUDGE_TYPE|||';

// @spec RUBRIC_SPEC
describe('rubricUtils', () => {
  it('parses rubric questions using delimiter and first-colon split', () => {
    const text = [
      'Clarity: The response is clear.\nAnd can include newlines.',
      'Tone: Friendly: but only first colon splits title from description',
      '',
    ].join(QUESTION_DELIMITER);

    const parsed = parseRubricQuestions(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('Clarity');
    expect(parsed[0].description).toContain('include newlines');
    expect(parsed[1].title).toBe('Tone');
    expect(parsed[1].description).toBe('Friendly: but only first colon splits title from description');
  });

  it('round-trips format -> parse', () => {
    const questions = [
      { id: 'q_1', title: 'A', description: 'B' },
      { id: 'q_2', title: 'C', description: 'D' },
    ];
    const formatted = formatRubricQuestions(questions);
    expect(formatted).toContain(QUESTION_DELIMITER);

    const parsed = parseRubricQuestions(formatted);
    expect(parsed.map((q) => ({ title: q.title, description: q.description }))).toEqual([
      { title: 'A', description: 'B' },
      { title: 'C', description: 'D' },
    ]);
  });
});

// @spec RUBRIC_SPEC - Per-question judge type (lines 71-91)
describe('rubricUtils - judge type parsing', () => {
  it('parses binary judge type from delimiter format', () => {
    // Spec: RUBRIC_SPEC lines 71-91
    // Format: "title: description|||JUDGE_TYPE|||binary"
    const text = `Accuracy: Is the response factually correct?${JUDGE_TYPE_DELIMITER}binary`;
    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Accuracy');
    expect(parsed[0].description).toBe('Is the response factually correct?');
    expect(parsed[0].judgeType).toBe('binary');
  });

  it('parses likert judge type from delimiter format', () => {
    // Spec: RUBRIC_SPEC lines 71-91
    const text = `Quality: Rate the response quality${JUDGE_TYPE_DELIMITER}likert`;
    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Quality');
    expect(parsed[0].judgeType).toBe('likert');
  });

  it('parses freeform judge type from delimiter format', () => {
    // Spec: RUBRIC_SPEC lines 71-91
    const text = `Feedback: Provide detailed feedback${JUDGE_TYPE_DELIMITER}freeform`;
    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].judgeType).toBe('freeform');
  });

  it('defaults to likert when no judge type specified', () => {
    // Spec: RUBRIC_SPEC lines 86-89
    // "Default to 'likert' if not specified"
    const text = 'Clarity: Is it clear?';
    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Clarity');
    expect(parsed[0].judgeType).toBe('likert');
  });

  it('handles mixed rubric with different judge types per question', () => {
    // Spec: RUBRIC_SPEC lines 71-91
    // "Mixed rubrics support different scales per question"
    const text = [
      `Accuracy: Pass/fail check${JUDGE_TYPE_DELIMITER}binary`,
      `Quality: Rate 1-5${JUDGE_TYPE_DELIMITER}likert`,
      'Completeness: Is it complete?', // No type = default to likert
    ].join(QUESTION_DELIMITER);

    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe('Accuracy');
    expect(parsed[0].judgeType).toBe('binary');
    expect(parsed[1].title).toBe('Quality');
    expect(parsed[1].judgeType).toBe('likert');
    expect(parsed[2].title).toBe('Completeness');
    expect(parsed[2].judgeType).toBe('likert'); // Default
  });

  it('format includes judge type in output', () => {
    // Spec: RUBRIC_SPEC lines 159-163
    const questions: RubricQuestion[] = [
      { id: 'q_1', title: 'Test', description: 'Description', judgeType: 'binary' },
    ];
    const formatted = formatRubricQuestions(questions);

    expect(formatted).toContain(JUDGE_TYPE_DELIMITER);
    expect(formatted).toContain('binary');
  });

  it('round-trips format -> parse preserving judge type', () => {
    // Spec: RUBRIC_SPEC - round-trip test with judge types
    const questions: RubricQuestion[] = [
      { id: 'q_1', title: 'Binary Q', description: 'Pass/fail', judgeType: 'binary' },
      { id: 'q_2', title: 'Likert Q', description: 'Rate 1-5', judgeType: 'likert' },
      { id: 'q_3', title: 'Freeform Q', description: 'Free text', judgeType: 'freeform' },
    ];

    const formatted = formatRubricQuestions(questions);
    const parsed = parseRubricQuestions(formatted);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].judgeType).toBe('binary');
    expect(parsed[1].judgeType).toBe('likert');
    expect(parsed[2].judgeType).toBe('freeform');
  });

  it('handles empty input gracefully', () => {
    // Spec: RUBRIC_SPEC lines 299
    // "Empty/whitespace-only parts filtered out"
    expect(parseRubricQuestions('')).toEqual([]);
    expect(parseRubricQuestions('   ')).toEqual([]);
    expect(parseRubricQuestions(null as unknown as string)).toEqual([]);
    expect(parseRubricQuestions(undefined as unknown as string)).toEqual([]);
  });

  it('ignores invalid judge type values', () => {
    // Should default to likert for invalid values
    const text = `Test: Description${JUDGE_TYPE_DELIMITER}invalid_type`;
    const parsed = parseRubricQuestions(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].judgeType).toBe('likert'); // Default for invalid
  });
});


