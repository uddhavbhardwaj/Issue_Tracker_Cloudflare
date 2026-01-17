import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FeedbackWorkflow } from './workflow';

const app = new Hono();

app.use('/api/*', cors());

app.get('/', (c) => {
    return c.text('Feedback Radar API');
});

// Mock Data Seeder
app.post('/api/seed', async (c) => {
    const { results } = await c.env.DB.prepare(`
    INSERT INTO feedback (content, source, sentiment, urgency_score, urgency_reason, themes, status) VALUES
    ('The login page is broken and I cannot access my account!', 'Support Ticket', 'Negative', 9, 'User cannot access account (critical blocker)', '["Login", "Bug"]', 'New'),
    ('I really like the new dashboard design, it is much cleaner.', 'Twitter', 'Positive', 2, 'Positive feedback, no action needed', '["UI/UX", "Dashboard"]', 'New'),
    ('Can you add a dark mode?', 'Feature Request', 'Neutral', 4, 'Feature request, not urgent', '["Feature Request", "UI/UX"]', 'New'),
    ('Billing is confusing. I do not know why I was charged this amount.', 'Email', 'Negative', 7, 'Billing confusion affects customer trust', '["Billing", "UX"]', 'New'),
    ('Everything is working great, thanks!', 'Chat', 'Positive', 1, 'General praise', '["General"]', 'Archived')
    RETURNING *
  `).all();

    // Trigger workflows to vectorise this data (if available)
    let workflowsTriggered = 0;
    for (const feedback of results) {
        try {
            if (c.env.FEEDBACK_WORKFLOW && typeof c.env.FEEDBACK_WORKFLOW.create === 'function') {
                await c.env.FEEDBACK_WORKFLOW.create({
                    id: `seed-${feedback.id}`,
                    params: {
                        feedbackId: feedback.id,
                        content: feedback.content,
                        source: feedback.source
                    }
                });
                workflowsTriggered++;
            }
        } catch (e) {
            console.warn('Workflow creation failed (may not be available in local dev):', e.message);
        }
    }

    return c.json({
        message: workflowsTriggered > 0
            ? 'Seeded successfully (Background processing started)'
            : 'Seeded successfully (Workflows not available in local dev)',
        results
    });
});

app.post('/api/feedback', async (c) => {
    let content, source, file;

    // Handle both JSON and Multipart (for file uploads)
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody();
        content = body['content'];
        source = body['source'];
        file = body['file']; // File object
    } else {
        const json = await c.req.json();
        content = json.content;
        source = json.source;
    }

    // 1. Upload to R2 if file exists
    let imageUrl = null;
    if (file && (file instanceof File || file instanceof Blob)) {
        const key = `${Date.now()}-${file.name || 'upload'}`;
        await c.env.FEEDBACK_BUCKET.put(key, file);
        imageUrl = key; // In a real app, you'd serve this via a worker or public bucket URL
    }

    // 2. Save initial "Pending" record to D1
    const { results } = await c.env.DB.prepare(`
    INSERT INTO feedback (content, source, sentiment, urgency_score, urgency_reason, themes, status, image_key)
    VALUES (?, ?, 'Pending', 0, 'Analyzing...', '[]', 'New', ?)
    RETURNING *
  `).bind(content, source || 'Unknown', imageUrl).all();

    const feedback = results[0];

    // 3. Trigger Workflow for async analysis (if available)
    try {
        if (c.env.FEEDBACK_WORKFLOW && typeof c.env.FEEDBACK_WORKFLOW.create === 'function') {
            await c.env.FEEDBACK_WORKFLOW.create({
                id: `feedback-${feedback.id}`, // specific ID or auto-generated
                params: {
                    feedbackId: feedback.id,
                    content: content,
                    source: source
                }
            });
        }
    } catch (e) {
        console.warn('Workflow creation failed (may not be available in local dev):', e.message);
    }

    return c.json({ ...feedback, message: "Feedback received. Analysis in progress." });
});

app.get('/api/feedback/:id/similar', async (c) => {
    const id = c.req.param('id');

    // 1. Get the vector for the requested feedback
    // Note: Vectorize doesn't support "get by ID" directly easily without storing the metadata or separate query.
    // Ideally we queried the vector from D1 if we stored it, or we re-generate it. 
    // For this prototype, we'll re-generate the embedding for the *content* of the feedback from D1.

    const { results } = await c.env.DB.prepare('SELECT content FROM feedback WHERE id = ?').bind(id).all();
    if (!results.length) return c.json({ error: 'Feedback not found' }, 404);

    const content = results[0].content;

    // 2. Generate embedding
    const embeddingResp = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [content] });
    const vector = embeddingResp.data[0];

    // 3. Query Vectorize
    if (!c.env.VECTORIZE_INDEX) {
        console.error("VECTORIZE_INDEX binding is missing. Ensure you are running with --experimental-vectorize-bind-to-prod");
        return c.json({ error: "Search index not configured" }, 503);
    }

    let matches;
    try {
        matches = await c.env.VECTORIZE_INDEX.query(vector, { topK: 5, returnMetadata: true });
    } catch (e) {
        console.error("Vectorize query failed:", e);
        return c.json({ error: "Search failed: " + e.message }, 500);
    }

    // Filter out self
    const similarIds = matches.matches
        .filter(m => m.id !== id.toString())
        .map(m => parseInt(m.id));

    if (similarIds.length === 0) return c.json([]);

    // 4. Fetch details from D1
    // "SELECT * FROM feedback WHERE id IN (...)"
    const placeholders = similarIds.map(() => '?').join(',');
    const similarFeedback = await c.env.DB.prepare(
        `SELECT * FROM feedback WHERE id IN (${placeholders})`
    ).bind(...similarIds).all();

    return c.json(similarFeedback.results);
});

app.get('/api/dashboard', async (c) => {
    try {
        // Aggregate stats via SQL - only for active feedback (New and Pending)
        // Sentiment breakdown (exclude 'Pending' as it's not a valid sentiment)
        const sentimentStats = await c.env.DB.prepare(`
        SELECT sentiment, COUNT(*) as count 
        FROM feedback 
        WHERE status IN ('New', 'Pending')
        AND sentiment IN ('Positive', 'Neutral', 'Negative')
        GROUP BY sentiment
      `).all();

        // Fetch themes only from active feedback (not Acted On or Archived)
        const allThemes = await c.env.DB.prepare(`
        SELECT themes 
        FROM feedback 
        WHERE status IN ('New', 'Pending')
      `).all();

        const themeCounts = {};
        allThemes.results.forEach(row => {
            try {
                const themes = JSON.parse(row.themes);
                if (Array.isArray(themes)) {
                    themes.forEach(t => {
                        themeCounts[t] = (themeCounts[t] || 0) + 1;
                    });
                }
            } catch (e) { }
        });

        // Sort themes
        const topThemes = Object.entries(themeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return c.json({
            sentiment: sentimentStats.results || [],
            top_themes: topThemes
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        return c.json({
            error: 'Failed to load dashboard data',
            sentiment: [],
            top_themes: []
        }, 500);
    }
}); // End of dashboard endpoint

app.get('/api/inbox', async (c) => {
    const { results } = await c.env.DB.prepare(`
    SELECT * FROM feedback WHERE status = 'New' OR status = 'Pending' ORDER BY urgency_score DESC, created_at DESC
  `).all();

    // Parse themes for the client
    const parsed = results.map(r => ({
        ...r,
        themes: JSON.parse(r.themes)
    }));

    return c.json(parsed);
});

app.post('/api/inbox/:id', async (c) => {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    await c.env.DB.prepare(`
    UPDATE feedback SET status = ? WHERE id = ?
  `).bind(status, id).run();

    return c.json({ success: true });
});

app.get('/api/images/:key', async (c) => {
    const key = c.req.param('key');
    const object = await c.env.FEEDBACK_BUCKET.get(key);

    if (object === null) {
        return c.text('Object Not Found', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, {
        headers,
    });
});

export default app;
export { FeedbackWorkflow };
