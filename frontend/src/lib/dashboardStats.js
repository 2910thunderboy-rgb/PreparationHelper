export const DASHBOARD_STATS_KEY = "careerAi.dashboardStats";

const JOB_CACHE_KEY = "careerAi.jobRecommendations.v1|Software Engineer|India";

export const DASHBOARD_REFRESH_EVENT = "career-ai-dashboard-refresh";

function notifyDashboardRefresh() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}

export function readDashboardStats() {
  try {
    const raw = localStorage.getItem(DASHBOARD_STATS_KEY);
    if (!raw) return { interview: {}, resume: {} };
    const parsed = JSON.parse(raw);
    return {
      interview: parsed.interview || {},
      resume: parsed.resume || {},
    };
  } catch {
    return { interview: {}, resume: {} };
  }
}

export function saveInterviewCompletion(finalScore, topic, questionCount = 10) {
  try {
    const s = readDashboardStats();
    const i = s.interview || {};
    const history = Array.isArray(i.history) ? i.history : [];
    history.push({ score: finalScore, at: new Date().toISOString(), topic });
    const trimmed = history.slice(-12);

    const next = {
      ...s,
      interview: {
        sessions: (i.sessions || 0) + 1,
        lastScore: finalScore,
        lastCompletedAt: new Date().toISOString(),
        lastTopic: topic,
        bestScore: Math.max(i.bestScore ?? 0, finalScore),
        totalQuestionsAnswered: (i.totalQuestionsAnswered || 0) + questionCount,
        history: trimmed,
      },
    };
    localStorage.setItem(DASHBOARD_STATS_KEY, JSON.stringify(next));
    notifyDashboardRefresh();
  } catch (e) {
    console.warn("saveInterviewCompletion", e);
  }
}

export function recordResumeAnalysis() {
  try {
    const s = readDashboardStats();
    const r = s.resume || {};
    const next = {
      ...s,
      resume: {
        analysesCount: (r.analysesCount || 0) + 1,
        lastAnalyzedAt: new Date().toISOString(),
      },
    };
    localStorage.setItem(DASHBOARD_STATS_KEY, JSON.stringify(next));
    notifyDashboardRefresh();
  } catch (e) {
    console.warn("recordResumeAnalysis", e);
  }
}

export function getCachedJobCount() {
  try {
    const raw = localStorage.getItem(JOB_CACHE_KEY);
    if (!raw) return 0;
    const p = JSON.parse(raw);
    return Array.isArray(p.jobs) ? p.jobs.length : 0;
  } catch {
    return 0;
  }
}
