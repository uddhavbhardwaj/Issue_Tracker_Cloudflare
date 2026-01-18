
import { WorkflowEntrypoint } from 'cloudflare:workers';

export class FeedbackWorkflow extends WorkflowEntrypoint {
    async run(event) {
        const { feedbackId, content, source } = event.payload;

        // Step 1: AI Analysis
        const analysis = await this.step.do('analyze-feedback', async () => {
            const systemPrompt = `You are a helpful assistant that analyzes product feedback. 
Analyze the following feedback and extract:
- sentiment: "Positive", "Neutral", "Negative"
- urgency_score: Integer 1-10 (10=Critical/Security, 7=Major Bug, 5=Feature Request, 1=Minor/Cosmetic)
- urgency_reason: Short explanation (max 10 words)
- themes: Array of 1-3 key strings (e.g., ["UI", "Performance", "Billing"])
- severity: MUST be one of these exact strings:
  * "blocking" - Users CANNOT proceed at all (crashes, complete failures, production down)
  * "major" - Broken functionality but workarounds exist
  * "minor" - Cosmetic issues, typos, polish
  * "enhancement" - Feature requests, improvements
- impact_score: Integer 1-10 estimating how many users are affected (10=all users, 5=significant subset, 1=edge case)

IMPORTANT: For severity, look for keywords:
- "blocking": "can't", "cannot", "unable to", "completely broken", "not working at all", "crashes", "production down", "all users affected"
- "major": "bug", "error", "broken", "not working", "fails"
- "minor": "typo", "cosmetic", "polish", "alignment", "spacing"
- "enhancement": "would be nice", "feature request", "suggestion", "could we"

Return ONLY valid JSON with ALL fields. Do not output markdown code blocks.`;

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Feedback: "${content}"\n\nReturn JSON with all required fields.` }
            ];

            const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages
            });

            // Parse JSON with Markdown cleanup
            let result = {
                sentiment: 'Neutral',
                urgency_score: 5,
                urgency_reason: 'AI parsing failed',
                themes: [],
                severity: 'minor',
                impact_score: 5
            };
            try {
                let text = response.response || '';
                // Strip markdown code blocks if present
                text = text.replace(/```json\n?|\n?```/g, '').trim();

                // Find JSON object if surrounded by other text
                const match = text.match(/\{[\s\S]*\}/);
                if (match) {
                    result = JSON.parse(match[0]);
                } else {
                    // Fallback attempt to parse raw text if no brackets found (rare)
                    result = JSON.parse(text);
                }
            } catch (e) {
                console.error("AI Parse Error", e);
                console.log("Raw AI Response:", response.response);
            }

            // Ensure strict types for DB
            result.themes = Array.isArray(result.themes) ? result.themes : [];
            result.urgency_score = typeof result.urgency_score === 'number' ? result.urgency_score : 5;
            result.impact_score = typeof result.impact_score === 'number' ? result.impact_score : 5;

            console.log("AI returned severity:", result.severity, "urgency:", result.urgency_score, "sentiment:", result.sentiment);

            // ALWAYS infer severity from urgency_score for high-urgency items
            // This overrides AI's classification which often gets it wrong
            if (result.urgency_score >= 9 && result.sentiment === 'Negative') {
                console.log("Overriding severity to 'blocking' due to urgency >= 9");
                result.severity = 'blocking';
            } else if (result.urgency_score >= 7 && result.sentiment === 'Negative') {
                console.log("Overriding severity to 'major' due to urgency >= 7");
                result.severity = 'major';
            } else {
                // For lower urgency, use AI's classification or fallback
                const validSeverities = ['blocking', 'major', 'minor', 'enhancement'];
                if (!result.severity || !validSeverities.includes(result.severity)) {
                    if (result.sentiment === 'Positive') {
                        result.severity = 'enhancement';
                    } else {
                        result.severity = 'minor';
                    }
                    console.log("Using fallback severity:", result.severity);
                }
            }

            console.log("Final severity:", result.severity);

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
          SET sentiment = ?, urgency_score = ?, urgency_reason = ?, themes = ?, status = 'New',
              severity = ?, impact_score = ?
          WHERE id = ?
        `).bind(
                analysis.sentiment,
                analysis.urgency_score,
                analysis.urgency_reason,
                themesStr,
                analysis.severity || 'minor',
                analysis.impact_score || 5,
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
