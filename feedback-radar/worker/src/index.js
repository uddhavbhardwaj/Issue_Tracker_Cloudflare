import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FeedbackWorkflow } from './workflow';
import { processSingleFeedback, validateFeedbackData } from './feedback-processor';
import {
    processFeedbackBatch,
    formatBatchResponse,
    formatBatchResponseWithStatus,
    validateFeedbackBatch,
    formatValidationErrors,
    determineHttpStatusCode,
    createErrorResponse
} from './batch-processor';

const app = new Hono();

app.use('/api/*', cors());

app.get('/', (c) => {
    return c.text('Feedback Radar API');
});



app.post('/api/feedback', async (c) => {
    try {
        const contentType = c.req.header('content-type') || '';
        let feedbackData = null;
        let isBatch = false;
        let batchData = [];

        // 1. Parse Input
        if (contentType.includes('application/json')) {
            const tempBody = await c.req.json();

            // Check if it's a batch payload (mockData or feedback array)
            if (tempBody.mockData && Array.isArray(tempBody.mockData)) {
                isBatch = true;
                batchData = tempBody.mockData;
            } else if (tempBody.feedback && Array.isArray(tempBody.feedback)) {
                isBatch = true;
                batchData = tempBody.feedback;
            } else {
                // Assume Single Feedback JSON
                feedbackData = {
                    content: tempBody.content,
                    source: tempBody.source,
                    timestamp: tempBody.timestamp
                };
            }

        } else if (contentType.includes('multipart/form-data')) {
            const body = await c.req.parseBody();
            feedbackData = {
                content: body['content'],
                source: body['source'],
                timestamp: body['timestamp'],
                file: body['file'] // File object
            };
        } else {
            return c.json({ error: 'Unsupported Content-Type. Use application/json or multipart/form-data' }, 400);
        }

        // 2. Process Based on Type
        if (isBatch) {
            // --- BATCH PROCESSING ---
            // Validate the feedback array structure
            const validation = validateFeedbackBatch(batchData);

            if (!validation.success) {
                const errorResponse = formatValidationErrors(validation);
                return c.json(errorResponse, 400);
            }

            // Process the batch
            const batchResult = await processFeedbackBatch(batchData, c.env);
            const response = formatBatchResponseWithStatus(batchResult);
            const statusCode = determineHttpStatusCode(batchResult);

            return c.json(response, statusCode);

        } else {
            // --- SINGLE PROCESSING ---
            // Normalize undefined to null or empty string if needed, but validation will catch it.
            // Explicitly force mandatory fields check here (though validateFeedbackData does it, we double check context)
            if (!feedbackData.content || !feedbackData.source || !feedbackData.timestamp) {
                return c.json({
                    error: 'Invalid feedback data',
                    fieldErrors: {
                        content: !feedbackData.content ? ['Content is required'] : undefined,
                        source: !feedbackData.source ? ['Source is required'] : undefined,
                        timestamp: !feedbackData.timestamp ? ['Timestamp is required'] : undefined
                    }
                }, 400);
            }

            const validation = validateFeedbackData(feedbackData);

            if (!validation.isValid) {
                const errorResponse = {
                    error: 'Invalid feedback data',
                    summary: validation.summary,
                    fieldErrors: validation.fieldErrors,
                    generalErrors: validation.generalErrors,
                    warnings: validation.warnings,
                    details: validation.errors // Legacy
                };
                return c.json(errorResponse, 400);
            }

            const result = await processSingleFeedback(feedbackData, c.env);

            // Include validation warnings in successful response if present
            if (validation.warnings && validation.warnings.length > 0) {
                result.warnings = validation.warnings;
            }

            return c.json(result);
        }

    } catch (error) {
        console.error('Feedback processing failed:', error);
        const errorResponse = createErrorResponse(
            'processing_error',
            'Failed to process feedback',
            { message: error.message },
            500
        );
        return c.json(errorResponse, 500);
    }
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

    // Debug info if empty
    if (similarFeedback.results.length === 0) {
        console.log("No DB matches found for similar IDs:", similarIds, "Vector matches were:", matches.matches);
        return c.json({ info: "No DB matches, but Vector matches were:", raw: matches.matches });
    }

    return c.json(similarFeedback.results);
});

app.get('/api/dashboard', async (c) => {
    try {
        const timeFilter = c.req.query('period') || '7d'; // 24h, 7d, 30d, all

        // Calculate time boundaries
        const now = new Date();
        let currentPeriodStart = new Date(now);
        let previousPeriodStart = new Date(now);

        switch (timeFilter) {
            case '24h':
                currentPeriodStart.setHours(now.getHours() - 24);
                previousPeriodStart.setHours(now.getHours() - 48);
                break;
            case '7d':
                currentPeriodStart.setDate(now.getDate() - 7);
                previousPeriodStart.setDate(now.getDate() - 14);
                break;
            case '30d':
                currentPeriodStart.setDate(now.getDate() - 30);
                previousPeriodStart.setDate(now.getDate() - 60);
                break;
            default: // 'all'
                currentPeriodStart = new Date(0);
                previousPeriodStart = new Date(0);
        }

        // Fetch current period feedback
        const currentFeedback = await c.env.DB.prepare(`
            SELECT * FROM feedback 
            WHERE status IN ('New', 'Pending')
            AND created_at >= ?
        `).bind(currentPeriodStart.toISOString()).all();

        // Fetch previous period for trend comparison
        const previousFeedback = await c.env.DB.prepare(`
            SELECT * FROM feedback 
            WHERE status IN ('New', 'Pending')
            AND created_at >= ? AND created_at < ?
        `).bind(previousPeriodStart.toISOString(), currentPeriodStart.toISOString()).all();

        // Import insights engine functions
        const {
            calculateTopRisk,
            detectEmergingIssues,
            identifyWins,
            generateRecommendations,
            calculateTrends,
            getSourceBreakdown,
            getEnhancedThemes
        } = await import('./insights-engine.js');

        const current = currentFeedback.results || [];
        const previous = previousFeedback.results || [];

        // Calculate insights
        const topRisk = calculateTopRisk(current);
        const emergingIssues = detectEmergingIssues(current, previous);
        const wins = identifyWins(current);
        const recommendations = generateRecommendations(current, topRisk, emergingIssues);
        const trends = calculateTrends(current, previous);
        const sourceBreakdown = getSourceBreakdown(current);
        const enhancedThemes = getEnhancedThemes(current, 5);

        // Calculate sentiment with percentages
        const totalCount = current.length;
        const sentimentWithPercentages = ['Positive', 'Neutral', 'Negative'].map(sentiment => {
            const count = current.filter(f => f.sentiment === sentiment).length;
            const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            const trend = trends[sentiment];

            return {
                sentiment,
                count,
                percentage,
                trend: trend ? {
                    direction: trend.direction,
                    change: trend.change,
                    percentChange: trend.percentChange
                } : null
            };
        });

        // Calculate primary KPI
        const negativeCount = current.filter(f => f.sentiment === 'Negative').length;
        const criticalIssues = current.filter(f => f.severity === 'blocking').length;
        const negativePercentage = totalCount > 0 ? Math.round((negativeCount / totalCount) * 100) : 0;

        const primaryKPI = {
            metric: 'negative_percentage',
            value: negativePercentage,
            label: '% Negative Feedback',
            secondaryMetric: {
                value: criticalIssues,
                label: 'Critical Issues'
            },
            status: negativePercentage < 10 ? 'good' : negativePercentage < 25 ? 'warning' : 'critical',
            trend: trends.Negative ? {
                direction: trends.Negative.direction,
                change: trends.Negative.percentChange
            } : null
        };

        // Insights summary
        const insightsSummary = {
            topRisk: topRisk ? {
                theme: topRisk.theme,
                count: topRisk.count,
                blockingCount: topRisk.blockingCount,
                sample: topRisk.samples[0]
            } : null,
            emergingIssues: emergingIssues.map(issue => ({
                theme: issue.theme,
                growthRate: issue.growthRate,
                currentCount: issue.currentCount,
                isNew: issue.isNew,
                sample: issue.sample
            })),
            recentWins: wins
        };

        return c.json({
            period: timeFilter,
            totalFeedback: totalCount,
            primaryKPI,
            insightsSummary,
            sentiment: sentimentWithPercentages,
            themes: enhancedThemes,
            recommendations,
            sourceBreakdown,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        return c.json({
            error: 'Failed to load dashboard data',
            message: error.message,
            sentiment: [],
            themes: []
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

// Roadmap API endpoints
app.post('/api/roadmap/link', async (c) => {
    try {
        const { feedbackId, roadmapStatus, roadmapLink } = await c.req.json();

        await c.env.DB.prepare(`
            UPDATE feedback 
            SET roadmap_status = ?, roadmap_link = ?
            WHERE id = ?
        `).bind(roadmapStatus, roadmapLink || null, feedbackId).run();

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Failed to link roadmap item', message: error.message }, 500);
    }
});

app.get('/api/roadmap/items', async (c) => {
    try {
        const status = c.req.query('status') || 'all'; // planned, in_progress, shipped, all

        let query = 'SELECT * FROM feedback WHERE roadmap_status != ?';
        const params = ['none'];

        if (status !== 'all') {
            query = 'SELECT * FROM feedback WHERE roadmap_status = ?';
            params[0] = status;
        }

        const { results } = await c.env.DB.prepare(query).bind(...params).all();

        return c.json(results);
    } catch (error) {
        return c.json({ error: 'Failed to fetch roadmap items', message: error.message }, 500);
    }
});

app.get('/api/roadmap/:id/sentiment', async (c) => {
    try {
        const id = c.req.param('id');

        // Get the feedback item
        const { results } = await c.env.DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).all();
        if (!results.length) return c.json({ error: 'Feedback not found' }, 404);

        const item = results[0];
        const themes = JSON.parse(item.themes || '[]');

        // Get sentiment before shipping (feedback created before this item was shipped)
        const beforeSentiment = await c.env.DB.prepare(`
            SELECT sentiment, COUNT(*) as count
            FROM feedback
            WHERE themes LIKE ? AND created_at < ?
            GROUP BY sentiment
        `).bind(`%${themes[0]}%`, item.created_at).all();

        // Get sentiment after shipping (feedback created after)
        const afterSentiment = await c.env.DB.prepare(`
            SELECT sentiment, COUNT(*) as count
            FROM feedback
            WHERE themes LIKE ? AND created_at >= ?
            GROUP BY sentiment
        `).bind(`%${themes[0]}%`, item.created_at).all();

        const formatSentiment = (results) => {
            const sentiment = { positive: 0, neutral: 0, negative: 0 };
            results.forEach(r => {
                sentiment[r.sentiment.toLowerCase()] = r.count;
            });
            return sentiment;
        };

        return c.json({
            theme: themes[0],
            before: formatSentiment(beforeSentiment.results || []),
            after: formatSentiment(afterSentiment.results || []),
            roadmapLink: item.roadmap_link
        });
    } catch (error) {
        return c.json({ error: 'Failed to calculate sentiment', message: error.message }, 500);
    }
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
