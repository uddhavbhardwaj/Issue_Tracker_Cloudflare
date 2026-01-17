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
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:8787/api';

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
          : 'text-gray-400 hover:text-white hover:bg-[#252525]'}
      `}
    >
      <span className={`${active ? 'text-cf-orange' : 'text-gray-400'}`}>
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

  const fetchData = () => {
    setIsRefreshing(true);
    fetch(`${API_URL}/dashboard`)
      .then(res => res.json())
      .then(data => {
        // Ensure data has the expected structure
        setData({
          sentiment: data?.sentiment || [],
          top_themes: data?.top_themes || []
        });
        setLastUpdated(new Date());
        setIsRefreshing(false);
      })
      .catch(err => {
        console.error('Dashboard fetch error:', err);
        // Set empty data on error
        setData({
          sentiment: [],
          top_themes: []
        });
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, []);

  if (!data) return <SkeletonLoader />;

  return (
    <div className="space-y-8">
      <div className="border-b border-cf-border pb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Overview</h2>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
              {isRefreshing && <span className="ml-2 text-cf-orange">● Refreshing...</span>}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="px-3 py-1.5 text-sm bg-cf-surface border border-cf-border rounded hover:border-cf-orange transition-colors disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sentiment Card */}
        <div className="p-6 rounded-md bg-cf-surface border border-cf-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              Sentiment Distribution
            </h3>
            <TrendingUp size={16} className="text-gray-400" />
          </div>
          <div className="space-y-5">
            {data.sentiment.map((s) => (
              <div key={s.sentiment} className="space-y-1">
                <div className="flex justify-between text-xs uppercase tracking-wide font-semibold text-gray-400">
                  <span>{s.sentiment}</span>
                  <span>{s.count}</span>
                </div>
                <div className="h-1.5 bg-[#404040] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(s.count * 10, 100)}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full ${s.sentiment === 'Positive' ? 'bg-emerald-500' :
                      s.sentiment === 'Negative' ? 'bg-red-500' : 'bg-gray-400'
                      }`}
                  />
                </div>
              </div>
            ))}
            {data.sentiment.length === 0 && <p className="text-gray-500 text-sm">No data available</p>}
          </div>
        </div>

        {/* Top Themes Card */}
        <div className="p-6 rounded-md bg-cf-surface border border-cf-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              Trending Themes
            </h3>
            <MessageSquare size={16} className="text-gray-400" />
          </div>
          <div className="space-y-0 divide-y divide-cf-border">
            {data.top_themes.map((theme, i) => (
              <div key={theme.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-200">{theme.name}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#404040] text-gray-300">
                  {theme.count}
                </span>
              </div>
            ))}
            {data.top_themes.length === 0 && <p className="text-gray-500 text-sm">No themes found</p>}
          </div>
        </div>
      </div>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Uploading & Analyzing...');

    try {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('source', 'Manual');
      if (file) {
        formData.append('file', file);
      }

      await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        body: formData, // No JSON headers for multipart!
      });
      setStatus('Success: Signal ingested & Workflow triggered.');
      setContent('');
      setFile(null);
    } catch (err) {
      console.error(err);
      setStatus('Error: Could not ingest signal.');
    }
    setLoading(false);
  };

  const seed = async () => {
    setLoading(true);
    setStatus('Initializing simulation...');
    await fetch(`${API_URL}/seed`, { method: 'POST' });
    setStatus('Simulation active. Check Inbox.');
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto pt-10">
      <h2 className="text-2xl font-semibold text-white mb-6">Manual Ingest</h2>

      <div className="bg-cf-surface border border-cf-border p-6 rounded-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Raw Feedback Payload</label>
            <textarea
              rows={5}
              className="w-full bg-[#1e1e1e] border border-cf-border rounded-md p-3 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cf-orange focus:ring-1 focus:ring-cf-orange transition-all font-mono text-sm"
              placeholder="{ content: '...' }"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={loading || !content}
              className="px-5 py-2 bg-cf-orange hover:bg-orange-600 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Analyze Signal'}
            </button>
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
                {file ? 'File Attached' : 'Attach Screenshot'}
              </label>
            </div>
            <button
              type="button"
              onClick={seed}
              className="px-5 py-2 bg-transparent hover:bg-[#333] border border-gray-600 rounded text-gray-300 text-sm font-medium transition-colors"
            >
              Load Mock Data
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
