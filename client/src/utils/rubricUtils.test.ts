import { describe, expect, it } from 'vitest';
import { formatRubricQuestions, parseRubricQuestions, QUESTION_DELIMITER, type RubricQuestion } from './rubricUtils';

// @spec RUBRIC_SPEC
describe('@spec:RUBRIC_SPEC rubricUtils', () => {
  describe('parseRubricQuestions', () => {
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

    it('returns empty array for empty input', () => {
      expect(parseRubricQuestions('')).toEqual([]);
      expect(parseRubricQuestions(null as unknown as string)).toEqual([]);
      expect(parseRubricQuestions(undefined as unknown as string)).toEqual([]);
    });

    it('filters out empty question parts', () => {
      const text = `Question 1: Description${QUESTION_DELIMITER}${QUESTION_DELIMITER}Question 2: Description`;
      const parsed = parseRubricQuestions(text);
      expect(parsed).toHaveLength(2);
    });

    it('handles questions without colons', () => {
      const text = 'Just a title without description';
      const parsed = parseRubricQuestions(text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Just a title without description');
      expect(parsed[0].description).toBe('');
    });

    it('generates sequential IDs', () => {
      const text = `Q1: D1${QUESTION_DELIMITER}Q2: D2${QUESTION_DELIMITER}Q3: D3`;
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].id).toBe('q_1');
      expect(parsed[1].id).toBe('q_2');
      expect(parsed[2].id).toBe('q_3');
    });
  });

  describe('Judge type parsing', () => {
    it('defaults to likert when no judge type specified', () => {
      const text = 'Quality: Is the response high quality?';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('likert');
    });

    it('parses likert judge type', () => {
      const text = 'Quality: Is the response high quality?|||JUDGE_TYPE|||likert';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('likert');
    });

    it('parses binary judge type', () => {
      const text = 'Safety: Is the response safe?|||JUDGE_TYPE|||binary';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('binary');
    });

    it('parses freeform judge type', () => {
      const text = 'Feedback: Provide detailed feedback|||JUDGE_TYPE|||freeform';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('freeform');
    });

    it('ignores invalid judge type and defaults to likert', () => {
      const text = 'Question: Description|||JUDGE_TYPE|||invalid_type';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('likert');
    });

    it('handles whitespace around judge type', () => {
      const text = 'Question: Description|||JUDGE_TYPE|||  binary  ';
      const parsed = parseRubricQuestions(text);
      expect(parsed[0].judgeType).toBe('binary');
    });
  });

  describe('Multiple questions with different judge types', () => {
    it('parses multiple questions with mixed judge types', () => {
      const text = [
        'Accuracy: Is the response factually accurate?|||JUDGE_TYPE|||likert',
        'Safety Check: Is the response safe for all audiences?|||JUDGE_TYPE|||binary',
        'Improvement Suggestions: What could be improved?|||JUDGE_TYPE|||freeform',
      ].join(QUESTION_DELIMITER);

      const parsed = parseRubricQuestions(text);

      expect(parsed).toHaveLength(3);

      expect(parsed[0].title).toBe('Accuracy');
      expect(parsed[0].judgeType).toBe('likert');

      expect(parsed[1].title).toBe('Safety Check');
      expect(parsed[1].judgeType).toBe('binary');

      expect(parsed[2].title).toBe('Improvement Suggestions');
      expect(parsed[2].judgeType).toBe('freeform');
    });

    it('preserves descriptions with judge type metadata', () => {
      const text = 'Helpfulness: Rate from 1-5 how helpful the response is.\nConsider completeness.|||JUDGE_TYPE|||likert';
      const parsed = parseRubricQuestions(text);

      expect(parsed[0].title).toBe('Helpfulness');
      expect(parsed[0].description).toBe('Rate from 1-5 how helpful the response is.\nConsider completeness.');
      expect(parsed[0].judgeType).toBe('likert');
    });

    it('handles complex multi-line descriptions with judge types', () => {
      const text = [
        'Completeness: Does the response fully answer the question?\n\nLook for:\n- All parts addressed\n- No missing information|||JUDGE_TYPE|||likert',
        'Hallucination: Does the response contain made-up information?|||JUDGE_TYPE|||binary',
      ].join(QUESTION_DELIMITER);

      const parsed = parseRubricQuestions(text);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].description).toContain('Look for:');
      expect(parsed[0].description).toContain('All parts addressed');
      expect(parsed[1].judgeType).toBe('binary');
    });
  });

  describe('formatRubricQuestions', () => {
    it('returns empty string for empty array', () => {
      expect(formatRubricQuestions([])).toBe('');
      expect(formatRubricQuestions(null as unknown as RubricQuestion[])).toBe('');
    });

    it('formats single question with judge type', () => {
      const questions: RubricQuestion[] = [
        { id: 'q_1', title: 'Quality', description: 'Rate quality', judgeType: 'likert' }
      ];
      const formatted = formatRubricQuestions(questions);

      expect(formatted).toContain('Quality: Rate quality');
      expect(formatted).toContain('|||JUDGE_TYPE|||likert');
    });

    it('formats multiple questions with delimiters', () => {
      const questions: RubricQuestion[] = [
        { id: 'q_1', title: 'A', description: 'B', judgeType: 'likert' },
        { id: 'q_2', title: 'C', description: 'D', judgeType: 'binary' },
      ];
      const formatted = formatRubricQuestions(questions);

      expect(formatted).toContain(QUESTION_DELIMITER);
      expect(formatted).toContain('|||JUDGE_TYPE|||likert');
      expect(formatted).toContain('|||JUDGE_TYPE|||binary');
    });
  });

  describe('Round-trip consistency', () => {
    it('round-trips format -> parse with judge types preserved', () => {
      const questions: RubricQuestion[] = [
        { id: 'q_1', title: 'Accuracy', description: 'Check accuracy', judgeType: 'likert' },
        { id: 'q_2', title: 'Safety', description: 'Check safety', judgeType: 'binary' },
        { id: 'q_3', title: 'Feedback', description: 'Provide feedback', judgeType: 'freeform' },
      ];

      const formatted = formatRubricQuestions(questions);
      const parsed = parseRubricQuestions(formatted);

      expect(parsed).toHaveLength(3);

      // Check content is preserved
      expect(parsed[0].title).toBe('Accuracy');
      expect(parsed[0].description).toBe('Check accuracy');
      expect(parsed[0].judgeType).toBe('likert');

      expect(parsed[1].title).toBe('Safety');
      expect(parsed[1].description).toBe('Check safety');
      expect(parsed[1].judgeType).toBe('binary');

      expect(parsed[2].title).toBe('Feedback');
      expect(parsed[2].description).toBe('Provide feedback');
      expect(parsed[2].judgeType).toBe('freeform');
    });

    it('round-trips with multi-line descriptions', () => {
      const questions: RubricQuestion[] = [
        {
          id: 'q_1',
          title: 'Completeness',
          description: 'Check if response is complete.\n\nConsider:\n- All parts\n- No gaps',
          judgeType: 'likert'
        },
      ];

      const formatted = formatRubricQuestions(questions);
      const parsed = parseRubricQuestions(formatted);

      expect(parsed[0].description).toContain('Check if response is complete.');
      expect(parsed[0].description).toContain('Consider:');
      expect(parsed[0].description).toContain('All parts');
    });

    it('round-trips empty descriptions', () => {
      const questions: RubricQuestion[] = [
        { id: 'q_1', title: 'Simple Check', description: '', judgeType: 'binary' },
      ];

      const formatted = formatRubricQuestions(questions);
      const parsed = parseRubricQuestions(formatted);

      expect(parsed[0].title).toBe('Simple Check');
      expect(parsed[0].description).toBe('');
      expect(parsed[0].judgeType).toBe('binary');
    });
  });

  describe('QUESTION_DELIMITER constant', () => {
    // @req Frontend and backend use same delimiter constant
    it('exports the correct delimiter', () => {
      expect(QUESTION_DELIMITER).toBe('|||QUESTION_SEPARATOR|||');
    });

    // @req Delimiter never appears in user input (by design)
    it('delimiter is unique and unlikely in user input', () => {
      // Verify the delimiter contains special characters that are unlikely in natural text
      expect(QUESTION_DELIMITER).toContain('|||');
      expect(QUESTION_DELIMITER.length).toBeGreaterThan(10);
    });
  });
});
