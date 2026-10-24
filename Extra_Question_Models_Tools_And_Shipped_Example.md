# Extra question — models/tools + shipped example

**Q: Which models or tools do you predominantly work with, and can you provide an example of something you shipped and what it did for users?**

My daily stack is the Anthropic and OpenAI model APIs (Claude and GPT families), served via GCP Vertex AI and orchestrated with LangChain/LangGraph for agentic workflows and LlamaIndex for retrieval — with Ragas and LangSmith for evaluation and observability, and pgvector for vector search. I'm also a daily practitioner of AI-assisted development with Claude Code, Cursor and Codex, and I established those practices across my last engineering team.

The example I'd pick is **AVA**, the enterprise AI assistant I architected and owned end to end as Product Owner at Cubewise. Finance teams in large enterprises live inside TM1 planning data, and getting answers used to mean building reports or waiting on an analyst. AVA let them ask in plain English — "what changed in our cost-centre forecast?" — and get grounded, cited answers from the live planning data, with human-in-the-loop gates and responsible-AI controls that passed the governance reviews of Amazon, AWS and ZKB. It launched in September 2025 and runs in production at those clients today: budget and forecast queries that took hours of analyst time became seconds of self-service.

I run the same playbook in my own products — seven live AI-native apps (tokenizmyapp.vercel.app) with conversational interfaces, streaming responses and RAG.
