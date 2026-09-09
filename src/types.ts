/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DocumentItem {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
}

export interface DocumentWithEmbedding extends DocumentItem {
  embedding?: number[];
}

export interface SearchResult {
  document: DocumentItem;
  similarityScore: number;
  matchType: 'semantic' | 'keyword' | 'both';
  matchedPassages?: string[];
}

export interface RAGResponse {
  answer: string;
  sourcesUsed: string[];
}

export interface CategoryStats {
  name: string;
  count: number;
}

export interface RepositoryStats {
  totalDocuments: number;
  totalWords: number;
  categories: CategoryStats[];
}
