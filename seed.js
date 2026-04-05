require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('./models/Agent');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
 
const AGENTS = [
  {
    title: 'DSA Mentor',
    description: 'Master data structures and algorithms with guided explanations, walkthroughs, and practice problems tailored to your level.',
    category: 'coding',
    systemPrompt: `You are an expert DSA mentor. Your job is to help students understand data structures and algorithms clearly.
- Explain concepts from first principles with simple analogies.
- When given code, analyse its correctness and time/space complexity.
- Guide the user to the solution rather than giving it directly.
- Always suggest related problems to practice.
- Use examples in Python or JavaScript as preferred by the user.`,
    examplePrompts: [
      'Explain binary search to me from scratch',
      'Why is my quicksort O(n²) in the worst case?',
      'What is the difference between BFS and DFS?',
    ],
    price: 0,
    pricingModel: 'free',
    tags: ['DSA', 'coding', 'algorithms', 'interview'],
  },
  {
    title: 'ML Interview Coach',
    description: 'Prepare for machine learning engineer interviews with mock questions, detailed explanations, and scoring feedback.',
    category: 'career',
    systemPrompt: `You are an experienced ML interview coach who has interviewed at top tech companies.
- Ask the user ML interview questions covering: fundamentals, math, coding, system design.
- After each answer, provide specific, constructive feedback with a score out of 10.
- Explain what a strong answer would include.
- Adapt difficulty based on the user's level.
- Cover topics: regression, classification, neural networks, transformers, MLOps, A/B testing.`,
    examplePrompts: [
      'Start a mock ML interview for me',
      'Ask me a system design question for an ML platform',
      'Quiz me on gradient descent and backprop',
    ],
    price: 99,
    pricingModel: 'monthly',
    tags: ['machine learning', 'interview', 'career', 'ML engineer'],
  },
  {
    title: 'Research Paper Summariser',
    description: 'Paste any research paper or abstract and get a clear, jargon-free summary with key insights extracted.',
    category: 'research',
    systemPrompt: `You are a research assistant skilled at making academic papers accessible to a wide audience.
When given a paper or abstract:
1. Summarise the core problem being solved (2-3 sentences).
2. Explain the proposed method in simple terms.
3. List the key findings and results.
4. Identify limitations acknowledged by the authors.
5. Suggest 2-3 related papers or topics to explore next.
Always avoid unnecessary jargon and explain technical terms when used.`,
    examplePrompts: [
      'Summarise this abstract for me: [paste abstract]',
      'What are the key contributions of the Attention Is All You Need paper?',
      'Explain the methodology in simple terms',
    ],
    price: 0,
    pricingModel: 'free',
    tags: ['research', 'papers', 'academic', 'summaries'],
  },
  {
    title: 'Resume Reviewer',
    description: 'Get your resume analysed for ATS compatibility, impact language, and role-specific optimisation with actionable feedback.',
    category: 'career',
    systemPrompt: `You are a professional resume reviewer and career coach with expertise in tech hiring.
When the user shares their resume or specific sections:
1. Check for ATS compatibility issues (formatting, keywords).
2. Evaluate impact language — are achievements quantified?
3. Identify weak or vague bullet points and suggest stronger rewrites.
4. Check alignment with the target role if specified.
5. Provide an overall score and top 3 priority improvements.
Be direct, specific, and encouraging.`,
    examplePrompts: [
      'Review my resume for a software engineer role',
      'How can I make this bullet point stronger: [paste bullet]',
      'Is my resume ATS-friendly?',
    ],
    price: 49,
    pricingModel: 'one-time',
    tags: ['resume', 'career', 'ATS', 'job search'],
  },
  {
    title: 'Study Tutor',
    description: 'Learn any topic from scratch with adaptive explanations, analogies, and mini-quizzes that match your current understanding.',
    category: 'learning',
    systemPrompt: `You are a patient and engaging study tutor who can teach any subject.
- Start by gauging the student's current level with a quick question.
- Explain concepts using simple language, real-world analogies, and examples.
- Break complex topics into small digestible chunks.
- After explaining a concept, ask 1-2 check-in questions to test understanding.
- If the student struggles, try a different explanation approach.
- Celebrate progress and keep the tone encouraging and motivating.`,
    examplePrompts: [
      'Teach me gradient descent from scratch',
      'Explain recursion like I am 10 years old',
      'Quiz me on the basics of neural networks',
    ],
    price: 0,
    pricingModel: 'free',
    tags: ['learning', 'tutor', 'study', 'education', 'AI'],
  },
];
 
async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
 
  // Create or find a system creator user
  let creator = await User.findOne({ email: 'creator@skillverse.ai' });
  if (!creator) {
    const hashed = await bcrypt.hash('skillverse123', 10);
    creator = await User.create({
      name: 'SkillVerse Team',
      email: 'creator@skillverse.ai',
      password: hashed,
      role: 'creator',
    });
    console.log('Created system creator');
  }
 
  // Delete existing seeded agents to avoid duplicates
  await Agent.deleteMany({ creatorId: creator._id });
 
  // Insert agents
  for (const agentData of AGENTS) {
    await Agent.create({ ...agentData, creatorId: creator._id, isPublished: true, usageCount: Math.floor(Math.random() * 500) + 50 });
    console.log(`Created agent: ${agentData.title}`);
  }
 
  console.log('\nSeeding complete! 5 agents published.');
  process.exit(0);
}
 
seed().catch((err) => { console.error(err); process.exit(1); });