
import { WorkflowEntrypoint } from 'cloudflare:workers';

export class FeedbackWorkflow extends WorkflowEntrypoint {
    async run(event) {
        const { feedbackId, content, source } = event.payload;

        // Step 1: AI Analysis
        const analysis = await this.step.do('analyze-feedback', async () => {
            const messages = [
                { role: "system", content: "You are a helpful assistant that analyzes product feedback. Analyze the following feedback and extract: sentiment (Positive, Neural, Negative), urgency_score (1-10 integer), urgency_reason (short string), and themes (array of strings, e.g. ['UI', 'Bug']). Return ONLY valid JSON." },
                { role: "user", content: `Feedback: "${content}"\n\nReturn JSON in this format: { "sentiment": "String", "urgency_score": Int, "urgency_reason": "String", "themes": ["String"] }` }
            ];
            const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', { messages });

            // Parse JSON
            let result = { sentiment: 'Neutral', urgency_score: 5, urgency_reason: 'AI parsing failed', themes: [] };
            try {
                const text = response.response;
                // Simple JSON extraction
                const match = text.match(/\{[\s\S]*\}/);
                if (match) result = JSON.parse(match[0]);
            } catch (e) {
                console.error("AI Parse Error", e);
            }
            return result;
        });

        // Step 2: Generate Embeddings
        const embeddings = await this.step.do('generate-embeddings', async () => {
            const response = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: [content]
            });
            return response.data[0];
        });

        // Step 3: Update D1
        await this.step.do('save-analysis', async () => {
            const themesStr = JSON.stringify(analysis.themes || []);
            await this.env.DB.prepare(`
          UPDATE feedback 
          SET sentiment = ?, urgency_score = ?, urgency_reason = ?, themes = ?, status = 'New'
          WHERE id = ?
        `).bind(
                analysis.sentiment,
                analysis.urgency_score,
                analysis.urgency_reason,
                themesStr,
                feedbackId
            ).run();
        });

        // Step 4: Index in Vectorize
        await this.step.do('index-vector', async () => {
            await this.env.VECTORIZE_INDEX.upsert([
                {
                    id: feedbackId.toString(),
                    values: embeddings,
                    metadata: {
                        source: source,
                        sentiment: analysis.sentiment
                    }
                }
            ]);
        });

        return { success: true, analysis };
    }
}
