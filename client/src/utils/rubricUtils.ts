/**
 * Shared utilities for parsing and formatting rubric questions.
 * This ensures consistent handling of newlines in question descriptions.
 */

// Delimiter used to separate questions in the rubric format
// This special delimiter allows newlines within question descriptions
export const QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||';

// Delimiter to separate judge type from content within a question
const JUDGE_TYPE_DELIMITER = '|||JUDGE_TYPE|||';

export type QuestionJudgeType = 'likert' | 'binary' | 'freeform';

export interface RubricQuestion {
  id: string;
  title: string;
  description: string;
  judgeType: QuestionJudgeType;
}

/**
 * Parse rubric question text into individual questions.
 * Supports newlines within descriptions by using a special delimiter.
 * Format: "title: description|||JUDGE_TYPE|||judgeType"
 */
export const parseRubricQuestions = (questionText: string): RubricQuestion[] => {
  if (!questionText) return [];
  
  const questionParts = questionText.split(QUESTION_DELIMITER);
  
  return questionParts
    .map((questionText, index) => {
      const trimmedText = questionText.trim();
      if (!trimmedText) return null;
      
      // Check if question has judge type embedded
      let content = trimmedText;
      let judgeType: QuestionJudgeType = 'likert'; // default
      
      if (trimmedText.includes(JUDGE_TYPE_DELIMITER)) {
        const [contentPart, typePart] = trimmedText.split(JUDGE_TYPE_DELIMITER);
        content = contentPart.trim();
        const parsedType = typePart?.trim() as QuestionJudgeType;
        if (parsedType === 'likert' || parsedType === 'binary' || parsedType === 'freeform') {
          judgeType = parsedType;
        }
      }
      
      // Split only at the first colon to separate title from description
      const colonIndex = content.indexOf(':');
      let title: string;
      let description: string;

      if (colonIndex === -1) {
        // No colon found - treat entire text as title with empty description
        title = content.trim();
        description = '';
      } else {
        title = content.substring(0, colonIndex).trim();
        description = content.substring(colonIndex + 1).trim();
      }
      
      return {
        id: `q_${index + 1}`,
        title,
        description,
        judgeType
      };
    })
    .filter((q): q is RubricQuestion => q !== null);
};

/**
 * Format rubric questions into a single string.
 * Supports newlines within descriptions by using a special delimiter.
 * Includes judge type for each question.
 */
export const formatRubricQuestions = (questions: RubricQuestion[]): string => {
  if (!questions || questions.length === 0) return '';
  
  return questions
    .map(q => `${q.title}: ${q.description}${JUDGE_TYPE_DELIMITER}${q.judgeType}`)
    .join(QUESTION_DELIMITER);
};

