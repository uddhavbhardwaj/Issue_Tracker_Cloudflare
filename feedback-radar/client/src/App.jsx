import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Inbox,
  Send,
  Activity,
  CheckCircle2,
  Archive,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Upload,
  Clock,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar - Pro Dark */}
      <nav className="w-64 bg-cf-dark border-r border-cf-border fixed h-full z-10 flex flex-col pt-6 pb-4">
        <div className="flex items-center gap-3 mb-8 px-6">
          {/* Cloudflare-like Logo approximation */}
          <div className="text-cf-orange">
            <Activity size={28} />
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">
            Feedback Radar
          </span>
        </div>

        <div className="space-y-1 px-3">
          <NavButton
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            icon={<LayoutDashboard size={18} />}
            label="Dashboard"
          />
          <NavButton
            active={activeTab === 'inbox'}
            onClick={() => setActiveTab('inbox')}
            icon={<Inbox size={18} />}
            label="Inbox"
          />
          <NavButton
            active={activeTab === 'ingest'}
            onClick={() => setActiveTab('ingest')}
            icon={<Send size={18} />}
            label="Ingest"
          />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-10 bg-cf-gray min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-6xl mx-auto"
          >
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'inbox' && <InboxComp />}
            {activeTab === 'ingest' && <Ingest />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors duration-150 text-sm font-medium
        ${active
          ? 'bg-cf-surface text-cf-orange'
          : 'text-gray-400 hover:text-white hover:bg-[#252525]'
        }
`}
    >
      <span className={`${active ? 'text-cf-orange' : 'text-gray-400'} `}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState('7d');

  const fetchData = (period = timePeriod) => {
    setIsRefreshing(true);
    fetch(`${API_URL}/dashboard?period=${period}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLastUpdated(new Date());
        setIsRefreshing(false);
      })
      .catch(err => {
        console.error('Dashboard fetch error:', err);
        setData(null);
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [timePeriod]);

  if (!data) return <SkeletonLoader />;

  const getThemeIcon = (theme) => {
    const themeStr = theme.toLowerCase();
    if (themeStr.includes('bug') || themeStr.includes('error')) return '🐛';
    if (themeStr.includes('performance') || themeStr.includes('speed')) return '⚡';
    if (themeStr.includes('ui') || themeStr.includes('design')) return '🎨';
    if (themeStr.includes('billing') || themeStr.includes('payment')) return '💰';
    if (themeStr.includes('feature')) return '💡';
    if (themeStr.includes('security')) return '🔒';
    return '📌';
  };

  const getTrendIcon = (direction) => {
    if (direction === 'up') return '▲';
    if (direction === 'down') return '▼';
    return '━';
  };

  return (
    <div className="space-y-6">
      {/* Header with Time Filters */}
      <div className="border-b border-cf-border pb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Insights Dashboard</h2>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
              {isRefreshing && <span className="ml-2 text-cf-orange">● Syncing...</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Time Period Filters */}
          <div className="flex gap-1 bg-cf-surface border border-cf-border rounded-md p-1">
            {['24h', '7d', '30d', 'all'].map(period => (
              <button
                key={period}
                onClick={() => {
                  setTimePeriod(period);
                  fetchData(period);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${timePeriod === period
                    ? 'bg-cf-orange text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                  }`}
              >
                {period === 'all' ? 'All Time' : period.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData()}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-sm bg-cf-surface border border-cf-border rounded hover:border-cf-orange transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Primary KPI */}
      {data.primaryKPI && (
        <div className={`p-6 rounded-md border-2 ${data.primaryKPI.status === 'good' ? 'bg-emerald-500/10 border-emerald-500/30' :
            data.primaryKPI.status === 'warning' ? 'bg-orange-500/10 border-orange-500/30' :
              'bg-red-500/10 border-red-500/30'
          }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Primary KPI</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-4xl font-bold ${data.primaryKPI.status === 'good' ? 'text-emerald-400' :
                    data.primaryKPI.status === 'warning' ? 'text-orange-400' :
                      'text-red-400'
                  }`}>
                  {data.primaryKPI.value}%
                </span>
                <span className="text-sm text-gray-400">{data.primaryKPI.label}</span>
                {data.primaryKPI.trend && (
                  <span className={`text-sm ${data.primaryKPI.trend.direction === 'down' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {getTrendIcon(data.primaryKPI.trend.direction)} {Math.abs(data.primaryKPI.trend.change)}%
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                {data.primaryKPI.secondaryMetric.label}
              </p>
              <span className="text-3xl font-bold text-gray-200">
                {data.primaryKPI.secondaryMetric.value}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Insights Summary */}
      {data.insightsSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top Risk */}
          {data.insightsSummary.topRisk && (
            <div className="p-5 rounded-md bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={18} className="text-red-400" />
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">Top Risk</h3>
              </div>
              <p className="text-lg font-medium text-white mb-2">{data.insightsSummary.topRisk.theme}</p>
              <p className="text-xs text-gray-400 mb-3">
                {data.insightsSummary.topRisk.count} reports • {data.insightsSummary.topRisk.blockingCount} blocking
              </p>
              <p className="text-sm text-gray-300 italic line-clamp-2">
                "{data.insightsSummary.topRisk.sample}"
              </p>
            </div>
          )}

          {/* Emerging Issues */}
          <div className="p-5 rounded-md bg-orange-500/10 border border-orange-500/30">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide">Emerging Issues</h3>
            </div>
            {data.insightsSummary.emergingIssues.length > 0 ? (
              <div className="space-y-2">
                {data.insightsSummary.emergingIssues.slice(0, 2).map((issue, i) => (
                  <div key={i} className="border-l-2 border-orange-400 pl-2">
                    <p className="text-sm font-medium text-white">{issue.theme}</p>
                    <p className="text-xs text-gray-400">
                      {issue.isNew ? 'New theme' : `↑ ${issue.growthRate}% growth`} • {issue.currentCount} reports
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No emerging issues detected</p>
            )}
          </div>

          {/* Recent Wins */}
          <div className="p-5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Recent Wins</h3>
            </div>
            {data.insightsSummary.recentWins.length > 0 ? (
              <div className="space-y-2">
                {data.insightsSummary.recentWins.slice(0, 2).map((win, i) => (
                  <div key={i} className="border-l-2 border-emerald-400 pl-2">
                    <p className="text-sm font-medium text-white">{win.theme}</p>
                    <p className="text-xs text-gray-400">
                      {win.type === 'positive_trend' ? `${win.count} positive mentions` : win.improvement}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recent wins</p>
            )}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="p-5 rounded-md bg-cf-surface border border-cf-border">
          <h3 className="text-base font-medium text-white mb-4 flex items-center gap-2">
            <Info size={16} className="text-cf-orange" />
            Recommended Actions
          </h3>
          <div className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <div
                key={i}
                className={`p-3 rounded border-l-4 ${rec.priority === 'critical' ? 'bg-red-500/10 border-red-500' :
                    rec.priority === 'high' ? 'bg-orange-500/10 border-orange-500' :
                      'bg-emerald-500/10 border-emerald-500'
                  }`}
              >
                <p className="text-sm text-gray-200">{rec.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enhanced Sentiment Distribution */}
        <div className="p-6 rounded-md bg-cf-surface border border-cf-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              Sentiment Distribution
            </h3>
            <TrendingUp size={16} className="text-gray-400" />
          </div>
          <div className="space-y-5">
            {data.sentiment && data.sentiment.map((s) => (
              <div key={s.sentiment} className="space-y-1">
                <div className="flex justify-between text-xs uppercase tracking-wide font-semibold text-gray-400">
                  <span className="flex items-center gap-2">
                    {s.sentiment}
                    {s.trend && (
                      <span className={`text-xs ${s.trend.direction === 'up' ? 'text-emerald-400' : s.trend.direction === 'down' ? 'text-red-400' : 'text-gray-500'}`}>
                        {getTrendIcon(s.trend.direction)} {Math.abs(s.trend.percentChange)}%
                      </span>
                    )}
                  </span>
                  <span>{s.count} ({s.percentage}%)</span>
                </div>
                <div className="h-1.5 bg-[#404040] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.percentage}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full ${s.sentiment === 'Positive' ? 'bg-emerald-500' :
                        s.sentiment === 'Negative' ? 'bg-red-500' : 'bg-gray-400'
                      }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced Trending Themes */}
        <div className="p-6 rounded-md bg-cf-surface border border-cf-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              Trending Themes
            </h3>
            <MessageSquare size={16} className="text-gray-400" />
          </div>
          <div className="space-y-0 divide-y divide-cf-border">
            {data.themes && data.themes.map((theme, i) => (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getThemeIcon(theme.theme)}</span>
                    <span className="text-sm font-medium text-gray-200">{theme.theme}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${theme.dominantSentiment === 'Positive' ? 'bg-emerald-500/20 text-emerald-400' :
                        theme.dominantSentiment === 'Negative' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                      }`}>
                      {theme.dominantSentiment}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#404040] text-gray-300">
                      {theme.count}
                    </span>
                  </div>
                </div>
                {theme.samples && theme.samples[0] && (
                  <p className="text-xs text-gray-400 italic mb-2 line-clamp-1">
                    "{theme.samples[0].content}"
                  </p>
                )}
                {theme.sources && (
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(theme.sources).slice(0, 3).map(([source, count]) => (
                      <span key={source} className="px-1.5 py-0.5 rounded text-[10px] bg-[#333] text-gray-400">
                        {source}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(!data.themes || data.themes.length === 0) && (
              <p className="text-gray-500 text-sm">No themes found</p>
            )}
          </div>
        </div>
      </div>

      {/* Source Breakdown */}
      {data.sourceBreakdown && data.sourceBreakdown.length > 0 && (
        <div className="p-6 rounded-md bg-cf-surface border border-cf-border">
          <h3 className="text-base font-medium text-white mb-4">Sentiment by Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.sourceBreakdown.map((source, i) => (
              <div key={i} className="p-4 rounded bg-[#1e1e1e] border border-cf-border">
                <p className="text-sm font-medium text-white mb-3">{source.source}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-400">Positive</span>
                    <span className="text-gray-400">{source.positive} ({Math.round((source.positive / source.total) * 100)}%)</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Neutral</span>
                    <span className="text-gray-400">{source.neutral} ({Math.round((source.neutral / source.total) * 100)}%)</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-red-400">Negative</span>
                    <span className="text-gray-400">{source.negative} ({Math.round((source.negative / source.total) * 100)}%)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxComp() {
  const [items, setItems] = useState([]);

  const refresh = () => {
    fetch(`${API_URL}/inbox`).then(res => res.json()).then(setItems).catch(console.error);
  };

  useEffect(() => { refresh(); }, []);

  const handleAction = async (id, status) => {
    setItems(items.filter(i => i.id !== id));
    await fetch(`${API_URL}/inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-cf-border pb-5">
        <h2 className="text-2xl font-semibold text-white">Triage</h2>
        <button onClick={refresh} className="text-sm text-cf-orange hover:text-white transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid gap-3">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              layout
              className="group p-5 rounded-md bg-cf-surface border border-cf-border hover:border-gray-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${item.urgency_score >= 8 ? 'bg-red-500/20 text-red-500' :
                      item.urgency_score >= 5 ? 'bg-orange-500/20 text-orange-500' :
                        'bg-emerald-500/20 text-emerald-500'
                      }`}>
                      Priority {item.urgency_score}
                    </span>
                    <span className="text-xs text-gray-500">{item.source} • {new Date(item.created_at || Date.now()).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-200 text-sm mb-3">{item.content}</p>

                  {item.image_key && (
                    <div className="mb-3">
                      <img
                        src={`${API_URL}/images/${item.image_key}`}
                        alt="Attachment"
                        className="max-h-32 rounded border border-cf-border"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs font-mono text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cf-orange"></span>
                      {(Array.isArray(item.themes) ? item.themes : JSON.parse(item.themes || '[]')).join(', ')}
                    </span>
                  </div>

                  <SimilarFeedbackButton id={item.id} />
                </div>

                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAction(item.id, 'Acted On')}
                    className="p-1.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors"
                    title="Resolve"
                  >
                    <CheckCircle2 size={16} />
                  </button>
                  <button
                    onClick={() => handleAction(item.id, 'Archived')}
                    className="p-1.5 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
                    title="Archive"
                  >
                    <Archive size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="text-center py-12 border border-dashed border-cf-border rounded-md">
            <p className="text-gray-500">No pending items.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Ingest() {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // Validate input whenever content changes
  useEffect(() => {
    validateInput(content);
  }, [content]);

  const validateInput = (text) => {
    const errors = [];
    if (!text || !text.trim()) {
      errors.push('Content cannot be empty.');
    } else {
      // Check if it looks like JSON
      try {
        const parsed = JSON.parse(text);

        // Single Object Validation
        if (!Array.isArray(parsed) && !parsed.feedback && !parsed.mockData) {
          if (!parsed.content) errors.push('JSON object missing required "content" field.');
          if (!parsed.source) errors.push('JSON object missing required "source" field.');
          if (!parsed.timestamp) errors.push('JSON object missing required "timestamp" field.');
        }

        // Batch Validation (Simple check)
        if (parsed.feedback && Array.isArray(parsed.feedback)) {
          // We won't validate every item deeply here to avoid performance issues on large paste, 
          // but we can check if array is empty
          if (parsed.feedback.length === 0) errors.push('Batch "feedback" array is empty.');
        }

        if (parsed.mockData && Array.isArray(parsed.mockData)) {
          if (parsed.mockData.length === 0) errors.push('Batch "mockData" array is empty.');
        }

      } catch (e) {
        // Not JSON - treat as plain text. 
        // We will append source="Manual" and timestamp=now() automatically.
      }
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateInput(content)) return;

    setLoading(true);
    setStatus('Analyzing...');
    setValidationErrors([]);

    try {
      let response;
      let isJson = false;

      // Detect JSON vs Plain Text
      try {
        const parsed = JSON.parse(content);
        isJson = true;
        // It's JSON - send as application/json to unified endpoint
        response = await fetch(`${API_URL}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });
      } catch (e) {
        // Plain Text - send as multipart (or JSON with manual source construction)
        // Auto-inject timestamp for manual entry
        const formData = new FormData();
        formData.append('content', content);
        formData.append('source', 'Manual');
        formData.append('timestamp', new Date().toISOString());
        if (file) {
          formData.append('file', file);
        }

        response = await fetch(`${API_URL}/feedback`, {
          method: 'POST',
          body: formData,
        });
      }

      const result = await response.json();

      if (response.ok) {
        // Single response
        setStatus('Success: Signal ingested & Workflow triggered.');
        setContent('');
        setFile(null);
      } else {
        // Handle Error
        const errorMsg = result.error || 'Ingestion failed';
        let detailMsg = '';

        if (result.fieldErrors) {
          detailMsg = Object.values(result.fieldErrors).flat().join(', ');
        }

        setStatus(`Error: ${errorMsg} ${detailMsg ? `(${detailMsg})` : ''}`);
      }

    } catch (err) {
      console.error(err);
      setStatus('Error: Could not ingest signal.');
    }
    setLoading(false);
  };

  const isJSON = (text) => {
    try { JSON.parse(text); return true; } catch { return false; }
  };

  return (
    <div className="max-w-2xl mx-auto pt-10">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-white">Ingest Signal</h2>
        <span className="text-xs text-gray-500 bg-[#222] px-2 py-1 rounded border border-gray-800">
          Supports: Plain Text, JSON (Single/Batch)
        </span>
      </div>

      <div className="bg-cf-surface border border-cf-border p-6 rounded-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Feedback Content / JSON Payload
            </label>
            <textarea
              rows={8}
              className={`w-full bg-[#1e1e1e] border rounded-md p-3 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 transition-all font-mono text-sm ${validationErrors.length > 0 ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50' : 'border-cf-border focus:border-cf-orange focus:ring-cf-orange'
                }`}
              placeholder="Type raw feedback OR paste JSON object/batch..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />

            {/* Inline Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mt-2 text-xs text-red-400 space-y-1">
                {validationErrors.map((err, i) => (
                  <p key={i} className="flex items-center gap-1">
                    <AlertCircle size={10} /> {err}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2 items-center">
            <button
              type="submit"
              disabled={loading || validationErrors.length > 0 || !content.trim()}
              className="px-5 py-2 bg-cf-orange hover:bg-orange-600 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send size={16} />
              {loading ? 'Processing...' : 'Analyze Signal'}
            </button>

            {!isJSON(content) && (
              <div className="relative">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={e => setFile(e.target.files[0])}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer px-5 py-2 bg-[#333] hover:bg-[#444] rounded text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Upload size={16} />
                  {file ? 'File Attached' : 'Attach Screenshot'}
                </label>
              </div>
            )}

            {/* Helper for pasting mock data structure */}
            <button
              type="button"
              onClick={() => setContent(JSON.stringify({
                mockData: [
                  {
                    content: "CRITICAL: Database connection failing intermittently in production! Users getting 500 errors.",
                    source: "PagerDuty",
                    timestamp: new Date().toISOString()
                  },
                  {
                    content: "Can we add a dark mode toggle to the settings page?",
                    source: "User Request",
                    timestamp: new Date().toISOString()
                  }
                ]
              }, null, 2))}
              className="ml-auto text-xs text-gray-500 hover:text-cf-orange underline"
            >
              Load Example
            </button>
          </div>
        </form>

        {status && (
          <div className={`mt-6 p-3 rounded-md border text-sm flex items-center gap-2 ${status.includes('Error') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
            <AlertCircle size={14} />
            {status}
          </div>
        )}
      </div>

      {/* Field Guide */}
      <div className="mt-8 bg-[#1e1e1e] border border-cf-border p-5 rounded-md">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Info size={16} /> Supported Fields
        </h3>
        <div className="space-y-4 text-xs text-gray-400">
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start text-sm">
            <div className="font-mono text-cf-orange">content</div>
            <div>The main feedback text. Must be a string (min 5 chars).</div>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start text-sm">
            <div className="font-mono text-cf-orange">source</div>
            <div>Origin of the feedback (e.g., "Twitter", "Email", "Support Ticket").</div>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start text-sm">
            <div className="font-mono text-cf-orange">timestamp</div>
            <div>ISO 8601 Date string (e.g., <code>2023-10-27T10:00:00Z</code>). Required for priority sorting.</div>
          </div>
          <div className="pt-2 border-t border-gray-800 mt-2">
            <p className="italic opacity-75">
              Note: When using Plain Text input, source defaults to "Manual" and timestamp defaults to "Now".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-8 w-32 bg-cf-surface rounded"></div>
      <div className="grid grid-cols-2 gap-6">
        <div className="h-48 bg-cf-surface rounded-md border border-cf-border"></div>
        <div className="h-48 bg-cf-surface rounded-md border border-cf-border"></div>
      </div>
    </div>
  )
}

export default App

function SimilarFeedbackButton({ id }) {
  const [similar, setSimilar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const findSimilar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/feedback/${id}/similar`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSimilar(data);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to search");
    }
    setLoading(false);
  };

  return (
    <div className="mt-2">
      {!similar && (
        <button
          onClick={findSimilar}
          disabled={loading}
          className="text-xs text-cf-orange hover:underline flex items-center gap-1"
        >
          {loading ? 'Searching...' : 'Find Similar Feedback (AI)'}
        </button>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {similar && (
        <div className="mt-2 p-3 bg-[#111] rounded border border-gray-800">
          <p className="text-xs font-semibold text-gray-400 mb-2">Similar Reports:</p>
          {similar.length === 0 ? <p className="text-xs text-gray-500">No similar feedback found.</p> : (
            <div className="space-y-2">
              {similar.map(s => (
                <div key={s.id} className="text-xs text-gray-300 border-l-2 border-cf-orange pl-2">
                  <p className="truncate">{s.content}</p>
                  <span className="text-[10px] text-gray-500">{new Date(s.created_at || Date.now()).toLocaleDateString()} • {s.sentiment}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
