/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { DocumentWithEmbedding, SearchResult, RAGResponse, RepositoryStats } from './src/types';

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'documents.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure database file exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper: Cosine Similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Read documents from DB
function readDocs(): DocumentWithEmbedding[] {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as DocumentWithEmbedding[];
  } catch (error) {
    console.error('Error reading documents database:', error);
    return [];
  }
}

// Helper: Write documents to DB
function writeDocs(docs: DocumentWithEmbedding[]): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(docs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing documents database:', error);
  }
}

// Helper: Safe embedding generator
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not defined. Skipping embedding generation.');
    return null;
  }
  try {
    // Truncate text to a safe length (e.g., 8000 characters) to avoid exceeding model input token limits
    const safeText = text && text.length > 8000 ? text.substring(0, 8000) : text;
    const response = (await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: safeText,
    })) as any;

    let values: number[] = [];
    if (response.embedding && Array.isArray(response.embedding.values)) {
      values = response.embedding.values;
    } else if (Array.isArray(response.embeddings) && response.embeddings[0] && Array.isArray(response.embeddings[0].values)) {
      values = response.embeddings[0].values;
    } else if (response.embeddings && Array.isArray((response.embeddings as any).values)) {
      values = (response.embeddings as any).values;
    }

    if (values && values.length > 0) {
      return values;
    }
    console.warn('Empty or unexpected embedding structure returned:', JSON.stringify(response));
    return null;
  } catch (error) {
    console.error('Error generating embedding via Gemini:', error);
    return null;
  }
}

// Seed Initial Documents if Database is empty
async function seedInitialDocuments() {
  const docs = readDocs();
  if (docs.length > 0) {
    return;
  }

  console.log('Seeding initial documents into the repository...');
  const seedData = [
    {
      id: 'doc-1',
      title: 'Remote Work & Hybrid Office Collaboration Guidelines',
      category: 'HR & Operations',
      content: `This guide defines the hybrid work policy at our organization. All employees are allowed up to three days of remote work per week, with Tuesday and Thursday designated as core on-site collaboration days. 
      Our core hours are 10:00 AM to 3:00 PM EST, during which all team members should be available for synchronous discussions.
      We offer a home office hardware stipend of up to $500 for ergonomics (chairs, desks) and technology accessories (monitors, keyboards). 
      Communication defaults: use Slack for daily check-ins and quick queries, Zoom for team meetings, and Notion as our central source of truth for documented specifications and policy files.`,
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      wordCount: 125,
    },
    {
      id: 'doc-2',
      title: 'Production Cloud Ingress & Container Deployment Guide',
      category: 'Engineering',
      content: `This technical playbook details our deployment pipeline on Google Cloud Platform. We utilize Google Cloud Run for serving containerized full-stack Node.js and React web applications.
      All deployments are triggered automatically via GitHub Actions CI/CD workflows upon pushing to the "main" repository branch.
      API credentials, service keys, and database passwords must never be committed to source control; they must be fetched securely from GCP Secret Manager at runtime.
      To optimize static assets and web speeds, Cloud CDN caching is configured in front of our load balancers. Auto-scaling is set with a minimum instance count of 1 to bypass cold starts, and a maximum of 50 instances.`,
      createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      wordCount: 130,
    },
    {
      id: 'doc-3',
      title: 'Brand Visual Identity & Content Strategy Guidelines',
      category: 'Marketing',
      content: `Our brand style centers on professional minimalism, visual honesty, and elegant typography. We pair clean headers in "Space Grotesk" or "Outfit" with readable body text in "Inter" or "JetBrains Mono".
      The primary color palette relies heavily on high-contrast dark slates, deep charcoal greys, pure off-whites, and subtle electric green neon accents.
      Our content strategy targets a 25% organic traffic expansion quarter-over-quarter through structural Search Engine Optimization (SEO).
      When drafting user-facing copy or technical summaries, prioritize clear, direct, and human phrasing. Avoid flowery corporate jargon, marketing hype, sales-oriented adjectives, or excessive emojis.`,
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      wordCount: 114,
    },
    {
      id: 'doc-4',
      title: 'Information Security & Laptop Encryption Protocols',
      category: 'Security',
      content: `This standard operating procedure ensures corporate asset defense. All employee workstations must run full-disk encryption (FileVault for macOS, BitLocker for Windows).
      Multi-Factor Authentication (MFA) is strictly mandatory on all applications, email systems, and server terminals.
      Users are required to rotate high-privilege passwords every 90 days. We enforce standard AES-256 encryption for database tables at rest, and TLS 1.3 protocol encryption for all data in transit.
      Any suspected phishing, malware infections, or lost hardware must be instantly reported to our security team at security@company.com within 2 hours of detection.`,
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      wordCount: 116,
    }
  ];

  const seededDocs: DocumentWithEmbedding[] = [];
  for (const item of seedData) {
    const embedding = await generateEmbedding(`${item.title}\n\n${item.content}`);
    seededDocs.push({
      ...item,
      embedding: embedding || undefined
    });
  }

  writeDocs(seededDocs);
  console.log(`Successfully seeded ${seededDocs.length} initial documents.`);
}

// Run seeding asynchronously
seedInitialDocuments().catch(err => {
  console.error('Failed to seed initial documents:', err);
});

// API Routes

// 1. Get List of all Documents (exclude embeddings from output to save bandwidth)
app.get('/api/documents', (req, res) => {
  try {
    const docs = readDocs();
    const sanitizedDocs = docs.map(({ embedding, ...doc }) => doc);
    res.json(sanitizedDocs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve documents', details: error.message });
  }
});

// 2. Add a new Document
app.post('/api/documents', async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const docs = readDocs();
    const id = `doc-${Date.now()}`;
    
    // Limit maximum content size to prevent performance and file storage bloat
    const maxChars = 50000;
    const cleanContent = content.length > maxChars
      ? content.substring(0, maxChars) + "\n\n[Content truncated for storage and performance limits]"
      : content;

    const wordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    const embeddingText = `${title}\n\n${cleanContent}`;
    const embedding = await generateEmbedding(embeddingText);

    const newDoc: DocumentWithEmbedding = {
      id,
      title,
      content: cleanContent,
      category: category || 'Uncategorized',
      createdAt: now,
      updatedAt: now,
      wordCount,
      embedding: embedding || undefined
    };

    docs.unshift(newDoc);
    writeDocs(docs);

    const { embedding: _, ...clientDoc } = newDoc;
    res.status(201).json({
      document: clientDoc,
      indexed: !!embedding,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add document', details: error.message });
  }
});

// 3. Update an existing Document
app.put('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;

    const docs = readDocs();
    const index = docs.findIndex(d => d.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const currentDoc = docs[index];
    const maxChars = 50000;
    const cleanContent = content
      ? (content.length > maxChars ? content.substring(0, maxChars) + "\n\n[Content truncated]" : content)
      : currentDoc.content;

    const wordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    let embedding = currentDoc.embedding;
    // Regenerate embedding if content or title changed
    if (title !== currentDoc.title || content !== currentDoc.content) {
      const embeddingText = `${title || currentDoc.title}\n\n${cleanContent}`;
      const newEmbedding = await generateEmbedding(embeddingText);
      if (newEmbedding) {
        embedding = newEmbedding;
      }
    }

    const updatedDoc: DocumentWithEmbedding = {
      ...currentDoc,
      title: title || currentDoc.title,
      content: cleanContent,
      category: category || currentDoc.category,
      wordCount,
      updatedAt: now,
      embedding
    };

    docs[index] = updatedDoc;
    writeDocs(docs);

    const { embedding: _, ...clientDoc } = updatedDoc;
    res.json({
      document: clientDoc,
      indexed: !!embedding,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update document', details: error.message });
  }
});

// 4. Delete a Document
app.delete('/api/documents/:id', (req, res) => {
  try {
    const { id } = req.params;
    const docs = readDocs();
    const filtered = docs.filter(d => d.id !== id);

    if (docs.length === filtered.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    writeDocs(filtered);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
});

// 5. Reindex all documents missing embeddings
app.post('/api/documents/reindex', async (req, res) => {
  try {
    const docs = readDocs();
    let updatedCount = 0;

    for (let i = 0; i < docs.length; i++) {
      if (!docs[i].embedding) {
        const text = `${docs[i].title}\n\n${docs[i].content}`;
        const embedding = await generateEmbedding(text);
        if (embedding) {
          docs[i].embedding = embedding;
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      writeDocs(docs);
    }

    res.json({ success: true, reindexedCount: updatedCount, totalDocuments: docs.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reindex documents', details: error.message });
  }
});

// 6. Comparative Search: Semantic + Keyword Comparison
app.post('/api/search', async (req, res) => {
  try {
    const { query, threshold = 0.3, limit = 5 } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const docs = readDocs();
    const results: { semantic: SearchResult[]; keyword: SearchResult[] } = {
      semantic: [],
      keyword: []
    };

    // Keyword Search
    const lowerQuery = query.toLowerCase();
    const keywordMatches = docs.filter(doc => 
      doc.title.toLowerCase().includes(lowerQuery) || 
      doc.content.toLowerCase().includes(lowerQuery) ||
      doc.category.toLowerCase().includes(lowerQuery)
    );

    results.keyword = keywordMatches.map(doc => {
      // Basic scoring based on occurences
      let score = 0.5; // default base match score
      const titleHits = (doc.title.toLowerCase().match(new RegExp(lowerQuery, 'g')) || []).length;
      const contentHits = (doc.content.toLowerCase().match(new RegExp(lowerQuery, 'g')) || []).length;
      score += (titleHits * 0.2) + (contentHits * 0.05);
      score = Math.min(score, 1.0); // cap at 1

      // Find passage snippet
      const content = doc.content;
      const queryIdx = content.toLowerCase().indexOf(lowerQuery);
      let snippet = content.substring(0, 160) + (content.length > 160 ? '...' : '');
      if (queryIdx !== -1) {
        const start = Math.max(0, queryIdx - 60);
        const end = Math.min(content.length, queryIdx + lowerQuery.length + 100);
        snippet = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
      }

      const { embedding, ...sanitized } = doc;
      return {
        document: sanitized,
        similarityScore: score,
        matchType: 'keyword' as const,
        matchedPassages: [snippet]
      };
    }).sort((a, b) => b.similarityScore - a.similarityScore).slice(0, limit);

    // Semantic Search
    const queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding) {
      const semanticMatches = docs
        .filter(doc => !!doc.embedding)
        .map(doc => {
          const similarity = cosineSimilarity(queryEmbedding, doc.embedding!);
          
          // Find the most relevant matching sentence/passage in the content
          const sentences = doc.content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
          let bestPassage = doc.content.substring(0, 160) + (doc.content.length > 160 ? '...' : '');
          
          const { embedding, ...sanitized } = doc;
          return {
            document: sanitized,
            similarityScore: similarity,
            matchType: 'semantic' as const,
            matchedPassages: [bestPassage]
          };
        })
        .filter(match => match.similarityScore >= threshold)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, limit);

      results.semantic = semanticMatches;
    } else {
      console.warn('Embedding generation failed for search query; semantic results are empty.');
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// 7. RAG Endpoint: AI Synthesis of Semantic Matches
app.post('/api/rag', async (req, res) => {
  try {
    const { query, results } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    if (!Array.isArray(results) || results.length === 0) {
      return res.json({ 
        answer: "I couldn't find any relevant documents to answer your question. Please try adding some documents or rephrase your search query.", 
        sourcesUsed: [] 
      });
    }

    const docs = readDocs();
    const docMap = new Map(docs.map(d => [d.id, d]));

    // Build the grounding context from the documents with safe length limits
    const context = results.map((res: SearchResult, idx: number) => {
      const dbDoc = docMap.get(res.document.id);
      let content = dbDoc ? dbDoc.content : (res.document.content || '');
      
      // Safe truncation for prompt context (e.g., 6000 characters per source document)
      if (content.length > 6000) {
        content = content.substring(0, 6000) + '... [truncated]';
      }
      
      return `[Source ${idx + 1}] Title: ${res.document.title}\nCategory: ${res.document.category}\nContent: ${content}`;
    }).join('\n\n---\n\n');

    const systemInstruction = `You are an expert repository researcher. 
    You must answer the user's questions based ONLY on the provided document sources. 
    Be direct, objective, and accurate. 
    Do not mention information that is not supported by the sources. 
    If the sources do not contain enough details to answer, state that clearly.
    For each major point or fact, cite the sources using bracketed numbers corresponding to the sources provided (e.g. [Source 1], [Source 2]).`;

    const prompt = `DOCUMENT SOURCES:
${context}

USER QUERY:
${query}

Please write a highly polished, concise synthesis answer citing the relevant Sources:`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const answer = response.text || "No response generated from the model.";
    const sourcesUsed = results.map((r: SearchResult) => r.document.title);

    res.json({ answer, sourcesUsed });
  } catch (error: any) {
    res.status(500).json({ error: 'RAG Synthesis failed', details: error.message });
  }
});

// 8. Dashboard Statistics
app.get('/api/stats', (req, res) => {
  try {
    const docs = readDocs();
    const totalDocuments = docs.length;
    const totalWords = docs.reduce((acc, d) => acc + d.wordCount, 0);

    const categoryMap: { [key: string]: number } = {};
    docs.forEach(d => {
      const cat = d.category || 'Uncategorized';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categories = Object.entries(categoryMap).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);

    const stats: RepositoryStats = {
      totalDocuments,
      totalWords,
      categories
    };

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve stats', details: error.message });
  }
});

// Integration of Vite as middleware for development / serving build output in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
