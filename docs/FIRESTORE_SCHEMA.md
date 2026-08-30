# **Firestore Database Schema & Vector Search Technical Specification**

This document details the data architecture for the AI Enablement Platform using Google Cloud Firestore, including the collections structure, TypeScript data models, vector index configuration, and Node.js RAG integration.

## **1\. High-Level Data Architecture**

The platform uses Firestore for three main operational requirements:

1. **User Management:** Storing user preferences, roles, and company metadata.  
2. **Session & State Management:** Storing real-time state for multi-agent interactions, chat history, and generated outputs.  
3. **Vector Database (Knowledge Base):** Storing vector embeddings of industry case studies, tools, and regulatory guidelines to enable Retrieval-Augmented Generation (RAG)

\+-----------------------+ | Users Collection | \+-----------------------+ | v 1:N \+-----------------------+ | Sessions Collection | (Stores Agent State & Workspace) \+-----------------------+ ^ | RAG Vector Query \+-----------------------+ | Knowledge Base (Vec) | (Stores Embeddings for RAG) \+-----------------------+ 

\#\# 2\. Document Schemas & TypeScript Definitions \#\#\# 2.1 Collection: \`users\` \*\*Path:\*\* \`users/{userId}\` \`\`\`typescript export interface UserProfile { uid: string; email: string; displayName: string; role: 'CEO/Founder' | 'CTO/CIO' | 'Department Head' | 'Developer'; industry: 'Healthcare' | 'Finance' | 'Manufacturing' | 'Retail' | 'SaaS'; companySize?: '1-50' | '51-200' | '201-1000' | '1000+'; createdAt: FirebaseFirestore.Timestamp; lastLoginAt: FirebaseFirestore.Timestamp; } 

export interface ChatMessage {

  id: string;

  sender: 'user' | 'agent';

  agentName?: 'Discovery Consultant' | 'Industry Analyst' | 'Technical Architect' | 'Project Manager' | 'Change Coach';

  text: string;

  timestamp: string;

}

export interface UseCase {

  id: string;

  title: string;

  description: string;

  impact: 'High' | 'Medium' | 'Low';

  complexity: 'High' | 'Medium' | 'Low';

  businessValue: string;

  status: 'suggested' | 'approved' | 'rejected';

}

export interface ArchitectureStack {

  models: string\[\];

  infrastructure: string\[\];

  frameworks: string\[\];

  securityConsiderations: string;

}

export interface RoadmapPhase {

  phaseName: string;

  duration: string;

  keyDeliverables: string\[\];

  resourcesRequired: string\[\];

}

export interface UpskillingPath {

  role: string;

  skillsRequired: string\[\];

  recommendedTraining: string;

  timeCommitment: string;

}

export interface ChangeManagementPlan {

  upskillingPaths: UpskillingPath\[\];

  communicationStrategy: {

    leadershipNarrative: string;

    mitigatingConcerns: string\[\];

  };

  adoptionKpis: string\[\];

}

export interface AgentState {

  currentStage: 'discovery' | 'research' | 'architecture' | 'roadmap' | 'training' | 'complete';

  needsAssessment: {

    primaryObjective?: string;

    dataReadiness?: 'Low' | 'Medium' | 'High';

    identifiedBottleneck?: string;

  };

  useCases: UseCase\[\];

  architectureStack?: ArchitectureStack;

  roadmapPhases?: RoadmapPhase\[\];

  changeManagementPlan?: ChangeManagementPlan;

}

export interface SessionDocument {

  sessionId: string;

  userId: string;

  createdAt: FirebaseFirestore.Timestamp;

  updatedAt: FirebaseFirestore.Timestamp;

  messages: ChatMessage\[\];

  state: AgentState;

}

## **3\. Vector Database Setup: `knowledge_base`**

To give the **Industry Research Agent** and **Technical Architect Agent** domain-specific context, we store embeddings directly in Firestore using native Vector Search capabilities.

### **3.1 Collection Schema: `knowledge_base`**

**Path:** `knowledge_base/{docId}`

import { VectorValue } from '@google-cloud/firestore';

export interface KnowledgeDocument {

  id: string;

  industry: 'Healthcare' | 'Finance' | 'Manufacturing' | 'Retail' | 'SaaS';

  category: 'case\_study' | 'tool\_spec' | 'compliance\_rule';

  title: string;

  content: string;

  sourceUrl?: string;

  embedding: VectorValue; // 768-dimensional vector from Gemini text-embedding-004 model

  metadata: {

    targetRoles: string\[\];

    impactScore: number;

    tags: string\[\];

  };

}

## **4\. Configuring Vector Search Index**

Firestore native Vector Search uses Single-Field Vector Indexes to perform Approximate Nearest Neighbor (ANN) searches using K-Nearest Neighbors (KNN).

### **4.1 Index Creation Command (`gcloud` CLI)**

Run this command via Google Cloud SDK to create the vector index on the `knowledge_base` collection:

gcloud alpha firestore indexes composite create \\

  \--collection-group=knowledge\_base \\

  \--query-scope=COLLECTION \\

  \--field-config field-path=industry,order=ASCENDING \\

  \--field-config field-path=embedding,vector-config='{"dimension":"768","flat":{}}'

## **5\. Node.js RAG Integration & Querying**

Below is the utility code for generating embeddings with Google Gen AI SDK and querying Firestore Vector Search from the backend API.

import { Firestore, VectorValue } from '@google-cloud/firestore';

import { GoogleGenerativeAI } from '@google/generative-ai';

const firestore \= new Firestore();

const genAI \= new GoogleGenerativeAI(process.env.GEMINI\_API\_KEY || '');

const embeddingModel \= genAI.getGenerativeModel({ model: 'text-embedding-004' });

/\*\*

 \* Generates vector embedding from text string using Gemini

 \*/

export async function generateEmbedding(text: string): Promise\<number\[\]\> {

  const result \= await embeddingModel.embedContent(text);

  return result.embedding.values;

}

/\*\*

 \* Ingests a new Knowledge Base Document into Firestore with Vector Embedding

 \*/

export async function addKnowledgeDocument(doc: Omit\<KnowledgeDocument, 'embedding' 'id' |\> & { id: string }) {

  const embeddingValues \= await generateEmbedding(\`${doc.title} ${doc.content}\`);


  const payload \= {

    ...doc,

    embedding: VectorValue.create(embeddingValues)

  };

  await firestore.collection('knowledge\_base').doc(doc.id).set(payload);

  console.log(\`Ingested knowledge document: ${doc.id}\`);

}

/\*\*

 \* Vector Search: Query Industry Case Studies using Vector Nearest Neighbor search

 \*/

export async function findRelevantCaseStudies(

  userQuery: string, 

  industry: string, 

  limit: number \= 3

) {

  // 1\. Generate query vector

  const queryVector \= await generateEmbedding(userQuery);

  // 2\. Query Firestore using Vector Find Nearest

  const collectionRef \= firestore.collection('knowledge\_base');

  const vectorQuery \= collectionRef

    .where('industry', '==', industry)

    .findNearest({

      vectorField: 'embedding',

      queryVector: VectorValue.create(queryVector),

      limit: limit,

      distanceMeasure: 'COSINE' // Supported: COSINE, EUCLIDEAN, DOT\_PRODUCT

    });

  const snapshot \= await vectorQuery.get();


  const results \= snapshot.docs.map(doc \=\> ({

    id: doc.id,

    ...doc.data()

  }));

  return results;

}

import express, { Request, Response } from 'express';

import cors from 'cors';

import { Firestore, VectorValue } from '@google-cloud/firestore';

import { GoogleGenerativeAI } from '@google/generative-ai';

// \==========================================================

// 1\. CONFIGURATION & INITIALIZATION

// \==========================================================

const app \= express();

app.use(cors({ origin: true }));

app.use(express.json());

const PORT \= process.env.PORT || 8080;

const API\_KEY \= process.env.GEMINI\_API\_KEY || '';

// Initialize Google Cloud Services

const firestore \= new Firestore();

const genAI \= new GoogleGenerativeAI(API\_KEY);

// Models

const TEXT\_MODEL\_NAME \= 'gemini-2.5-flash-preview-09-2025';

const EMBEDDING\_MODEL\_NAME \= 'text-embedding-004';

const generativeModel \= genAI.getGenerativeModel({ model: TEXT\_MODEL\_NAME });

const embeddingModel \= genAI.getGenerativeModel({ model: EMBEDDING\_MODEL\_NAME });

// \==========================================================

// 2\. HELPER UTILITIES & EXPONENTIAL BACKOFF

// \==========================================================

/\*\*

 \* Executes a Gemini API call with exponential backoff retries.

 \*/

async function callGeminiWithRetry(fn: () \=\> Promise\<any\>, maxRetries \= 5): Promise\<any\> {

  let delay \= 1000;

  for (let i \= 0; i \< maxRetries; i++) {

    try {

      return await fn();

    } catch (error) {

      if (i \=== maxRetries \- 1\) throw error;

      await new Promise((res) \=\> setTimeout(res, delay));

      delay \*= 2;

    }

  }

}

/\*\*

 \* Generates vector embeddings for a given text query.

 \*/

async function generateEmbedding(text: string): Promise\<number\[\]\> {

  const result \= await callGeminiWithRetry(() \=\> embeddingModel.embedContent(text));

  return result.embedding.values;

}

/\*\*

 \* Searches Firestore knowledge\_base using native Vector Nearest Neighbor search.

 \*/

async function queryKnowledgeBase(query: string, industry: string, limit \= 3\) {

  try {

    const queryVector \= await generateEmbedding(query);

    const collectionRef \= firestore.collection('knowledge\_base');

    const vectorQuery \= collectionRef

      .where('industry', '==', industry)

      .findNearest({

        vectorField: 'embedding',

        queryVector: VectorValue.create(queryVector),

        limit: limit,

        distanceMeasure: 'COSINE',

      });

    const snapshot \= await vectorQuery.get();

    return snapshot.docs.map((doc) \=\> ({

      id: doc.id,

      ...doc.data(),

    }));

  } catch (err) {

    console.error('Vector search warning (falling back to empty RAG context):', err);

    return \[\];

  }

}

// \==========================================================

// 3\. AGENT PROMPTS & INSTRUCTIONS

// \==========================================================

const AGENT\_PROMPTS \= {

  discovery: \`You are the Needs Assessment Agent (Discovery Consultant) for an AI consulting platform.

Your goal is to interview the user (C-suite executive or Department Head) to uncover business bottlenecks and AI readiness.

Instructions:

\- Greet the user with their Name, Role, and Industry.

\- Ask ONE clear, probing question at a time.

\- Identify primary business objectives and bottlenecks.

\- Once you have gathered sufficient context, output a JSON block with:

{"status": "complete", "summary": "...", "primary\_objective": "...", "data\_readiness": "Low|Medium|High", "identified\_bottleneck": "..."}\`,

  research: \`You are the Industry Research Agent (The Analyst).

Take the user profile and identified bottleneck, and generate 3 actionable AI use cases based on provided RAG context.

Format output strictly as JSON:

{

  "use\_cases": \[

    {

      "id": "uc-1",

      "title": "...",

      "description": "...",

      "impact": "High|Medium|Low",

      "complexity": "High|Medium|Low",

      "business\_value": "..."

    }

  \]

}\`,

  architecture: \`You are the Technical Architecture Agent (The Architect).

Review approved AI use cases and recommend a complete tech stack (Models, Cloud Infrastructure, Frameworks) and security considerations.

Format output strictly as JSON:

{

  "architecture\_stack": {

    "models": \["..."\],

    "infrastructure": \["..."\],

    "frameworks": \["..."\]

  },

  "security\_considerations": "..."

}\`,

  roadmap: \`You are the Implementation Agent (The Project Manager).

Create a 3-phase rollout plan (Pilot, Integration, Scaling) with timeline, deliverables, and required internal/external talent.

Format output strictly as JSON:

{

  "phases": \[

    {

      "phase\_name": "...",

      "duration": "...",

      "key\_deliverables": \["..."\],

      "resources\_required": \["..."\]

    }

  \]

}\`,

  training: \`You are the Training & Change Management Agent (The Coach).

Generate upskilling paths, leadership communication narratives, employee concern mitigations, and adoption KPIs.

Format output strictly as JSON:

{

  "change\_management\_plan": {

    "upskilling\_paths": \[

      {

        "role": "...",

        "skills\_required": \["..."\],

        "recommended\_training": "...",

        "time\_commitment": "..."

      }

    \],

    "communication\_strategy": {

      "leadership\_narrative": "...",

      "mitigating\_concerns": \["..."\]

    },

    "adoption\_kpis": \["..."\]

  }

}\`,

};

// \==========================================================

// 4\. API ENDPOINTS & ORCHESTRATION ROUTING

// \==========================================================

/\*\*

 \* Health check endpoint for Cloud Run readiness probes

 \*/

app.get('/health', (\_req: Request, res: Response) \=\> {

  res.status(200).send({ status: 'ok', service: 'ai-enablement-orchestrator' });

});

/\*\*

 \* POST /api/session/start

 \* Initializes a new workspace consultation session.

 \*/

app.post('/api/session/start', async (req: Request, res: Response) \=\> {

  try {

    const { userId, name, role, industry } \= req.body;

    if (\!userId || \!name || \!role || \!industry) {

      return res.status(400).json({ error: 'Missing required fields: userId, name, role, industry' });

    }

    const sessionId \= \`session\_${Date.now()}\_${Math.random().toString(36).substring(2, 7)}\`;

    const sessionRef \= firestore.collection('sessions').doc(sessionId);

    const initialMessage \= {

      id: \`msg\_1\`,

      sender: 'agent',

      agentName: 'Discovery Consultant',

      text: \`Welcome ${name}\! I am your Discovery Consultant. As a ${role} in ${industry}, what is the primary business bottleneck or operational delay you are hoping AI can solve?\`,

      timestamp: new Date().toISOString(),

    };

    const initialSession \= {

      sessionId,

      userId,

      userProfile: { name, role, industry },

      createdAt: new Date(),

      updatedAt: new Date(),

      messages: \[initialMessage\],

      state: {

        currentStage: 'discovery',

        needsAssessment: {},

        useCases: \[\],

      },

    };

    await sessionRef.set(initialSession);

    return res.status(201).json({

      sessionId,

      message: initialMessage,

      state: initialSession.state,

    });

  } catch (error: any) {

    console.error('Error starting session:', error);

    return res.status(500).json({ error: 'Internal server error starting consultation session.' });

  }

});

/\*\*

 \* POST /api/chat

 \* Primary conversation endpoint. Manages multi-agent execution & state transitions.

 \*/

app.post('/api/chat', async (req: Request, res: Response) \=\> {

  try {

    const { sessionId, userMessage } \= req.body;

    if (\!sessionId || \!userMessage) {

      return res.status(400).json({ error: 'sessionId and userMessage are required.' });

    }

    const sessionRef \= firestore.collection('sessions').doc(sessionId);

    const sessionDoc \= await sessionRef.get();

    if (\!sessionDoc.exists) {

      return res.status(404).json({ error: 'Session not found.' });

    }

    const sessionData \= sessionDoc.data()\!;

    const { userProfile, state, messages } \= sessionData;

    // 1\. Append User Message

    const userMsgObj \= {

      id: \`msg\_${Date.now()}\`,

      sender: 'user',

      text: userMessage,

      timestamp: new Date().toISOString(),

    };

    messages.push(userMsgObj);

    // 2\. Determine Agent Execution based on Current State Stage

    let replyText \= '';

    let updatedState \= { ...state };

    let agentName \= 'Discovery Consultant';

    switch (state.currentStage) {

      case 'discovery': {

        agentName \= 'Discovery Consultant';

        const prompt \= \`${AGENT\_PROMPTS.discovery}

User Profile: ${JSON.stringify(userProfile)}

Conversation History: ${JSON.stringify(messages.slice(-6))}

User's Latest Input: "${userMessage}"\`;

        const response \= await callGeminiWithRetry(() \=\>

          generativeModel.generateContent({

            contents: \[{ parts: \[{ text: prompt }\] }\],

          })

        );

        replyText \= response.response.text();

        // Check if discovery completed

        if (replyText.includes('"status": "complete"') || replyText.includes('identified\_bottleneck')) {

          try {

            const jsonMatch \= replyText.match(/\\{\[\\s\\S\]\*\\}/);

            if (jsonMatch) {

              const discoveryData \= JSON.parse(jsonMatch\[0\]);

              updatedState.needsAssessment \= discoveryData;

              updatedState.currentStage \= 'research'; // Trigger transition to Research Agent

              replyText \= \`Thank you. I have summarized your core bottleneck: "${discoveryData.identified\_bottleneck}". Handing off to our Industry Research Agent now to query matching case studies...\`;

            }

          } catch (e) {

            console.warn('Could not parse discovery completion JSON:', e);

          }

        }

        break;

      }

      case 'research': {

        agentName \= 'Industry Analyst';

        const bottleneck \= updatedState.needsAssessment?.identified\_bottleneck || userMessage;

        // RAG Query

        const ragDocs \= await queryKnowledgeBase(bottleneck, userProfile.industry, 3);

        const ragContext \= ragDocs.map((d) \=\> \`${d.title}: ${d.content}\`).join('\\n\\n');

        const prompt \= \`${AGENT\_PROMPTS.research}

Industry: ${userProfile.industry}

Bottleneck: ${bottleneck}

Relevant Case Studies & Context:

${ragContext}

Generate 3 actionable use cases. Return strictly valid JSON.\`;

        const response \= await callGeminiWithRetry(() \=\>

          generativeModel.generateContent({

            contents: \[{ parts: \[{ text: prompt }\] }\],

            generationConfig: { responseMimeType: 'application/json' },

          })

        );

        const rawJson \= response.response.text();

        const parsed \= JSON.parse(rawJson);

        updatedState.useCases \= parsed.use\_cases || \[\];

        updatedState.currentStage \= 'architecture';

        replyText \= \`I have generated 3 customized AI use cases based on ${userProfile.industry} benchmarks. You can review them on your Strategy Canvas\! Next, let us construct your technical architecture.\`;

        break;

      }

      case 'architecture': {

        agentName \= 'Technical Architect';

        const prompt \= \`${AGENT\_PROMPTS.architecture}

Approved Use Cases: ${JSON.stringify(updatedState.useCases)}

User Role: ${userProfile.role}

Recommend the technology stack and security measures. Return strictly valid JSON.\`;

        const response \= await callGeminiWithRetry(() \=\>

          generativeModel.generateContent({

            contents: \[{ parts: \[{ text: prompt }\] }\],

            generationConfig: { responseMimeType: 'application/json' },

          })

        );

        const parsed \= JSON.parse(response.response.text());

        updatedState.architectureStack \= parsed.architecture\_stack;

        updatedState.currentStage \= 'roadmap';

        replyText \= \`Your recommended tech stack (Models, Cloud Infrastructure, and Compliance rules) has been generated and updated on your Strategy Canvas. Proceeding to build your implementation roadmap...\`;

        break;

      }

      case 'roadmap': {

        agentName \= 'Project Manager';

        const prompt \= \`${AGENT\_PROMPTS.roadmap}

Approved Use Cases: ${JSON.stringify(updatedState.useCases)}

Architecture: ${JSON.stringify(updatedState.architectureStack)}

Generate a 3-phase rollout plan. Return strictly valid JSON.\`;

        const response \= await callGeminiWithRetry(() \=\>

          generativeModel.generateContent({

            contents: \[{ parts: \[{ text: prompt }\] }\],

            generationConfig: { responseMimeType: 'application/json' },

          })

        );

        const parsed \= JSON.parse(response.response.text());

        updatedState.roadmapPhases \= parsed.phases;

        updatedState.currentStage \= 'training';

        replyText \= \`Your 3-phase execution roadmap is ready\! Now initializing our Change Management Coach to map out your team's training requirements.\`;

        break;

      }

      case 'training': {

        agentName \= 'Change Coach';

        const prompt \= \`${AGENT\_PROMPTS.training}

Use Cases: ${JSON.stringify(updatedState.useCases)}

Architecture: ${JSON.stringify(updatedState.architectureStack)}

Generate the Change Management and Upskilling Plan. Return strictly valid JSON.\`;

        const response \= await callGeminiWithRetry(() \=\>

          generativeModel.generateContent({

            contents: \[{ parts: \[{ text: prompt }\] }\],

            generationConfig: { responseMimeType: 'application/json' },

          })

        );

        const parsed \= JSON.parse(response.response.text());

        updatedState.changeManagementPlan \= parsed.change\_management\_plan;

        updatedState.currentStage \= 'complete';

        replyText \= \`Congratulations\! Your end-to-end AI Enablement Strategy is fully generated. You can now view and export the complete plan from your dashboard.\`;

        break;

      }

      default: {

        agentName \= 'AI Enabler';

        replyText \= \`Your strategy plan is complete\! You can download your report or ask me any specific questions about implementation details.\`;

      }

    }

    // 3\. Append Agent Reply Message

    const agentMsgObj \= {

      id: \`msg\_${Date.now() \+ 1}\`,

      sender: 'agent',

      agentName,

      text: replyText,

      timestamp: new Date().toISOString(),

    };

    messages.push(agentMsgObj);

    // 4\. Save back to Firestore

    await sessionRef.update({

      messages,

      state: updatedState,

      updatedAt: new Date(),

    });

    return res.status(200).json({

      reply: agentMsgObj,

      state: updatedState,

    });

  } catch (error: any) {

    console.error('Error in /api/chat orchestration:', error);

    return res.status(500).json({ error: 'Failed to process agent orchestration task.' });

  }

});

/\*\*

 \* POST /api/knowledge/ingest

 \* Ingests industry case studies and embeds them into Firestore for RAG.

 \*/

app.post('/api/knowledge/ingest', async (req: Request, res: Response) \=\> {

  try {

    const { id, industry, category, title, content, metadata } \= req.body;

    if (\!id || \!industry || \!title || \!content) {

      return res.status(400).json({ error: 'Missing required fields for knowledge ingestion.' });

    }

    const embeddingValues \= await generateEmbedding(\`${title}\\n${content}\`);

    const docPayload \= {

      id,

      industry,

      category: category || 'case\_study',

      title,

      content,

      embedding: VectorValue.create(embeddingValues),

      metadata: metadata || {},

      createdAt: new Date(),

    };

    await firestore.collection('knowledge\_base').doc(id).set(docPayload);

    return res.status(201).json({ success: true, ingestedId: id });

  } catch (error: any) {

    console.error('Ingestion error:', error);

    return res.status(500).json({ error: 'Failed to ingest document into knowledge base.' });

  }

});

// \==========================================================

// 5\. SERVER START

// \==========================================================

app.listen(PORT, () \=\> {

  console.log(\`AI Enablement Orchestrator Backend running on port ${PORT}\`);

});

