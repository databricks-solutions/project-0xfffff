import { describe, expect, it } from 'vitest';
import { JudgeType } from '@/client';
import { formatRubricQuestions, parseRubricQuestions, QUESTION_DELIMITER } from './rubricUtils';

// @spec RUBRIC_SPEC
// @req Questions with multi-line descriptions parse correctly
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

  // @req Frontend and backend use same delimiter constant
  it('round-trips format -> parse', () => {
    const questions = [
      { id: 'q_1', title: 'A', description: 'B', judgeType: JudgeType.LIKERT },
      { id: 'q_2', title: 'C', description: 'D', judgeType: JudgeType.BINARY },
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


