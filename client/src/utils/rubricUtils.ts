/**
 * Shared utilities for parsing and formatting rubric questions.
 * This ensures consistent handling of newlines in question descriptions.
 */

// Delimiter used to separate questions in the rubric format
// This special delimiter allows newlines within question descriptions
export const QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||';

export interface RubricQuestion {
  id: string;
  title: string;
  description: string;
}

/**
 * Parse rubric question text into individual questions.
 * Supports newlines within descriptions by using a special delimiter.
 */
export const parseRubricQuestions = (questionText: string): RubricQuestion[] => {
  if (!questionText) return [];
  
  const questionParts = questionText.split(QUESTION_DELIMITER);
  
  return questionParts
    .map((questionText, index) => {
      const trimmedText = questionText.trim();
      if (!trimmedText) return null;
      
      // Split only at the first colon to separate title from description
      const colonIndex = trimmedText.indexOf(':');
      if (colonIndex === -1) return null;
      
      const title = trimmedText.substring(0, colonIndex).trim();
      const description = trimmedText.substring(colonIndex + 1).trim();
      
      return {
        id: `q_${index + 1}`,
        title,
        description
      };
    })
    .filter((q): q is RubricQuestion => q !== null);
};

/**
 * Format rubric questions into a single string.
 * Supports newlines within descriptions by using a special delimiter.
 */
export const formatRubricQuestions = (questions: RubricQuestion[]): string => {
  if (!questions || questions.length === 0) return '';
  
  return questions
    .map(q => `${q.title}: ${q.description}`)
    .join(QUESTION_DELIMITER);
};

