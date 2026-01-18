/**
 * Insights Engine - Transforms raw feedback data into actionable PM insights
 */

/**
 * Calculate the top risk - highest impact negative theme
 */
export function calculateTopRisk(feedback) {
    const negativeItems = feedback.filter(f => f.sentiment === 'Negative');

    if (negativeItems.length === 0) return null;

    // Group by theme and calculate impact
    const themeRisks = {};
    negativeItems.forEach(item => {
        const themes = JSON.parse(item.themes || '[]');
        themes.forEach(theme => {
            if (!themeRisks[theme]) {
                themeRisks[theme] = {
                    theme,
                    count: 0,
                    totalImpact: 0,
                    blockingCount: 0,
                    samples: []
                };
            }
            themeRisks[theme].count++;
            themeRisks[theme].totalImpact += (item.impact_score || 5);
            if (item.severity === 'blocking') themeRisks[theme].blockingCount++;
            if (themeRisks[theme].samples.length < 3) {
                themeRisks[theme].samples.push(item.content);
            }
        });
    });

    // Find highest risk (blocking count * impact * count)
    const risks = Object.values(themeRisks);
    if (risks.length === 0) return null;

    risks.sort((a, b) => {
        const scoreA = (a.blockingCount * 10 + a.totalImpact) * a.count;
        const scoreB = (b.blockingCount * 10 + b.totalImpact) * b.count;
        return scoreB - scoreA;
    });

    return risks[0];
}

/**
 * Detect emerging issues - themes with significant WoW growth or post-release spikes
 */
export function detectEmergingIssues(currentPeriod, previousPeriod) {
    const currentThemes = aggregateThemes(currentPeriod);
    const previousThemes = aggregateThemes(previousPeriod);

    const emerging = [];

    Object.entries(currentThemes).forEach(([theme, currentData]) => {
        const previousData = previousThemes[theme];
        const currentCount = currentData.count;
        const previousCount = previousData ? previousData.count : 0;

        // Calculate growth rate
        const growthRate = previousCount > 0
            ? ((currentCount - previousCount) / previousCount) * 100
            : (currentCount > 0 ? 100 : 0);

        // Flag if >50% growth or new theme with high volume
        if (growthRate > 50 || (previousCount === 0 && currentCount >= 3)) {
            emerging.push({
                theme,
                currentCount,
                previousCount,
                growthRate: Math.round(growthRate),
                isNew: previousCount === 0,
                sample: currentData.samples[0]
            });
        }
    });

    // Sort by growth rate
    emerging.sort((a, b) => b.growthRate - a.growthRate);

    return emerging.slice(0, 3); // Top 3 emerging issues
}

/**
 * Identify recent wins - positive trends or shipped features with sentiment improvement
 */
export function identifyWins(feedback, shippedItems = []) {
    const wins = [];

    // Win Type 1: Positive sentiment trends
    const positiveItems = feedback.filter(f => f.sentiment === 'Positive');
    const positiveThemes = aggregateThemes(positiveItems);

    Object.entries(positiveThemes).forEach(([theme, data]) => {
        if (data.count >= 3) { // At least 3 positive mentions
            wins.push({
                type: 'positive_trend',
                theme,
                count: data.count,
                sample: data.samples[0]
            });
        }
    });

    // Win Type 2: Shipped features with sentiment improvement
    shippedItems.forEach(item => {
        const beforeSentiment = item.beforeSentiment || {};
        const afterSentiment = item.afterSentiment || {};

        const beforeNegative = beforeSentiment.negative || 0;
        const afterNegative = afterSentiment.negative || 0;

        if (beforeNegative > 0 && afterNegative < beforeNegative) {
            const improvement = Math.round(((beforeNegative - afterNegative) / beforeNegative) * 100);
            wins.push({
                type: 'shipped_improvement',
                theme: item.theme,
                improvement: `${improvement}% reduction in negative feedback`,
                roadmapLink: item.roadmap_link
            });
        }
    });

    return wins.slice(0, 3); // Top 3 wins
}

/**
 * Generate rule-based recommended actions
 */
export function generateRecommendations(feedback, topRisk, emergingIssues) {
    const recommendations = [];

    // Recommendation 1: Address top risk
    if (topRisk && topRisk.blockingCount > 0) {
        recommendations.push({
            priority: 'critical',
            action: `🚨 Investigate ${topRisk.theme}: ${topRisk.blockingCount} blocking issue${topRisk.blockingCount > 1 ? 's' : ''} reported`,
            theme: topRisk.theme,
            type: 'blocking_issue'
        });
    }

    // Recommendation 2: Review emerging issues
    emergingIssues.forEach(issue => {
        if (issue.growthRate > 100) {
            recommendations.push({
                priority: 'high',
                action: `📈 ${issue.theme} spiked ${issue.growthRate}% - review recent changes`,
                theme: issue.theme,
                type: 'spike'
            });
        }
    });

    // Recommendation 3: Consider closing resolved themes
    const positiveThemes = feedback.filter(f => f.sentiment === 'Positive');
    const positiveAgg = aggregateThemes(positiveThemes);

    Object.entries(positiveAgg).forEach(([theme, data]) => {
        const totalForTheme = feedback.filter(f => {
            const themes = JSON.parse(f.themes || '[]');
            return themes.includes(theme);
        });

        const positiveRatio = data.count / totalForTheme.length;

        if (positiveRatio > 0.8 && totalForTheme.length >= 5) {
            recommendations.push({
                priority: 'low',
                action: `✅ Consider closing ${theme}: ${Math.round(positiveRatio * 100)}% positive sentiment`,
                theme,
                type: 'resolved'
            });
        }
    });

    return recommendations.slice(0, 5); // Top 5 recommendations
}

/**
 * Calculate trend indicators (WoW comparison)
 */
export function calculateTrends(currentPeriod, previousPeriod) {
    const current = aggregateSentiment(currentPeriod);
    const previous = aggregateSentiment(previousPeriod);

    const trends = {};

    ['Positive', 'Neutral', 'Negative'].forEach(sentiment => {
        const currentCount = current[sentiment] || 0;
        const previousCount = previous[sentiment] || 0;
        const change = currentCount - previousCount;
        const percentChange = previousCount > 0
            ? Math.round((change / previousCount) * 100)
            : (currentCount > 0 ? 100 : 0);

        trends[sentiment] = {
            current: currentCount,
            previous: previousCount,
            change,
            percentChange,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
        };
    });

    return trends;
}

/**
 * Get source-level sentiment breakdown
 */
export function getSourceBreakdown(feedback) {
    const sources = {};

    feedback.forEach(item => {
        const source = item.source || 'Unknown';
        if (!sources[source]) {
            sources[source] = {
                source,
                positive: 0,
                neutral: 0,
                negative: 0,
                total: 0
            };
        }

        sources[source].total++;
        const sentiment = item.sentiment?.toLowerCase() || 'neutral';
        sources[source][sentiment]++;
    });

    return Object.values(sources);
}

/**
 * Get enhanced theme data with sentiment, quotes, and sources
 */
export function getEnhancedThemes(feedback, limit = 5) {
    const themeData = {};

    feedback.forEach(item => {
        const themes = JSON.parse(item.themes || '[]');
        themes.forEach(theme => {
            if (!themeData[theme]) {
                themeData[theme] = {
                    theme,
                    count: 0,
                    positive: 0,
                    neutral: 0,
                    negative: 0,
                    samples: [],
                    sources: {}
                };
            }

            themeData[theme].count++;
            const sentiment = item.sentiment?.toLowerCase() || 'neutral';
            themeData[theme][sentiment]++;

            // Add sample quote
            if (themeData[theme].samples.length < 3) {
                themeData[theme].samples.push({
                    content: item.content,
                    sentiment: item.sentiment,
                    source: item.source
                });
            }

            // Track sources
            const source = item.source || 'Unknown';
            themeData[theme].sources[source] = (themeData[theme].sources[source] || 0) + 1;
        });
    });

    // Convert to array and add dominant sentiment
    const themes = Object.values(themeData).map(theme => {
        const total = theme.count;
        const dominantSentiment = theme.negative > theme.positive
            ? 'Negative'
            : theme.positive > theme.neutral
                ? 'Positive'
                : 'Neutral';

        return {
            ...theme,
            dominantSentiment,
            sentimentBreakdown: {
                positive: Math.round((theme.positive / total) * 100),
                neutral: Math.round((theme.neutral / total) * 100),
                negative: Math.round((theme.negative / total) * 100)
            }
        };
    });

    // Sort by count
    themes.sort((a, b) => b.count - a.count);

    return themes.slice(0, limit);
}

/**
 * Helper: Aggregate themes from feedback items
 */
function aggregateThemes(feedback) {
    const themes = {};

    feedback.forEach(item => {
        const itemThemes = JSON.parse(item.themes || '[]');
        itemThemes.forEach(theme => {
            if (!themes[theme]) {
                themes[theme] = { count: 0, samples: [] };
            }
            themes[theme].count++;
            if (themes[theme].samples.length < 3) {
                themes[theme].samples.push(item.content);
            }
        });
    });

    return themes;
}

/**
 * Helper: Aggregate sentiment counts
 */
function aggregateSentiment(feedback) {
    const sentiment = { Positive: 0, Neutral: 0, Negative: 0 };

    feedback.forEach(item => {
        const s = item.sentiment || 'Neutral';
        sentiment[s] = (sentiment[s] || 0) + 1;
    });

    return sentiment;
}
