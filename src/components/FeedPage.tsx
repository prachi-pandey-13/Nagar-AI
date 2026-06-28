import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, doc, query, orderBy, onSnapshot, runTransaction, getDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Issue } from "../types";
import { 
  ThumbsUp, Search, SlidersHorizontal, MapPin, Clock, ShieldCheck, 
  AlertTriangle, Users, CheckCircle2, Activity, FileText, Share2, 
  MessageCircle, Twitter, Link as LinkIcon, X 
} from "lucide-react";
import { getPendingDaysInfo } from "../utils";
import { motion, AnimatePresence } from "motion/react";

interface FeedPageProps {
  user: User | null;
  onNavigateToReport: () => void;
}

function CountUp({ end, duration = 1000 }: { end: number; duration?: number }) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [end, duration]);

  return <span>{count}</span>;
}

// Search term highlighting component
function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !highlight.trim()) {
    return <span>{text}</span>;
  }
  try {
    const escapedHighlight = highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`(${escapedHighlight})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-100 text-slate-950 dark:bg-yellow-400 dark:text-slate-950 px-0.5 rounded font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  } catch (err) {
    return <span>{text}</span>;
  }
}

// Visual loading skeleton component for cards
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full animate-pulse">
      {/* Photo Header Placeholder */}
      <div className="h-48 bg-slate-200 dark:bg-slate-800" />
      
      {/* Content Placeholder */}
      <div className="p-5 flex-1 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
        <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded animate-shimmer" />
        <div className="space-y-2 mt-2">
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
        </div>
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center mt-auto">
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
      </div>
      <div className="px-5 py-3 bg-slate-50 dark:bg-[#1a1a2e]/60 border-t border-slate-150 dark:border-slate-800 flex justify-between items-center">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
      </div>
    </div>
  );
}

export default function FeedPage({ user, onNavigateToReport }: FeedPageProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "upvotes">("newest");
  const [userUpvotedIssues, setUserUpvotedIssues] = useState<{ [issueId: string]: boolean }>({});
  const [upvotingStates, setUpvotingStates] = useState<{ [issueId: string]: boolean }>({});
  const [activeShareDropdown, setActiveShareDropdown] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Debounce search by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle outside click to close active share dropdowns
  useEffect(() => {
    if (!activeShareDropdown) return;
    const handleOutsideClick = () => {
      setActiveShareDropdown(null);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [activeShareDropdown]);

  // Real-time Firestore sync
  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const issuesData: Issue[] = [];
        snapshot.forEach((doc) => {
          issuesData.push(doc.data() as Issue);
        });
        setIssues(issuesData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "issues");
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch upvote status for each issue when logged-in user changes or issues change
  useEffect(() => {
    if (!user || issues.length === 0) return;

    // Direct check of upvotes
    const checkUpvotes = async () => {
      const upvotesMap: { [issueId: string]: boolean } = {};
      
      const promises = issues.map(async (issue) => {
        try {
          const upvoteRef = doc(db, "issues", issue.id, "upvotes", user.uid);
          const upvoteSnap = await getDoc(upvoteRef);
          if (upvoteSnap.exists()) {
            upvotesMap[issue.id] = true;
          }
        } catch (error) {
          console.error("Error checking upvote for issue:", issue.id, error);
        }
      });

      await Promise.all(promises);
      setUserUpvotedIssues(upvotesMap);
    };

    checkUpvotes();
  }, [user, issues]);

  const handleUpvote = async (issueId: string) => {
    if (!user) {
      alert("Please sign in with Google to upvote issues.");
      return;
    }

    if (upvotingStates[issueId]) return; // Prevent double taps during operation

    setUpvotingStates(prev => ({ ...prev, [issueId]: true }));

    const issueRef = doc(db, "issues", issueId);
    const upvoteRef = doc(db, "issues", issueId, "upvotes", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const issueDoc = await transaction.get(issueRef);
        if (!issueDoc.exists()) {
          throw new Error("Issue does not exist!");
        }

        const upvoteDoc = await transaction.get(upvoteRef);
        const currentUpvotes = issueDoc.data().upvotesCount || 0;

        if (upvoteDoc.exists()) {
          // Remove upvote
          transaction.delete(upvoteRef);
          transaction.update(issueRef, { upvotesCount: Math.max(0, currentUpvotes - 1) });
          setUserUpvotedIssues(prev => ({ ...prev, [issueId]: false }));
        } else {
          // Add upvote
          transaction.set(upvoteRef, { voterId: user.uid, createdAt: serverTimestamp() });
          transaction.update(issueRef, { upvotesCount: currentUpvotes + 1 });
          setUserUpvotedIssues(prev => ({ ...prev, [issueId]: true }));
        }
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `issues/${issueId}`);
    } finally {
      setUpvotingStates(prev => ({ ...prev, [issueId]: false }));
    }
  };

  // Deep linking scroll-to handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const issueId = params.get("issueId");
    if (issueId && issues.length > 0) {
      const element = document.getElementById(`issue-card-${issueId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("ring-4", "ring-green-500", "scale-[1.01]");
          setTimeout(() => {
            element.classList.remove("ring-4", "ring-green-500", "scale-[1.01]");
          }, 3000);
        }, 500);
      }
    }
  }, [issues]);

  const handleShareWhatsApp = (issue: Issue) => {
    const appLink = window.location.origin + "/?issueId=" + issue.id;
    const text = `📢 Civic Issue Alert on NagarAI!\n\n📌 Title: ${issue.title}\n⚠️ Severity: ${issue.severity.toUpperCase()}\n📍 Location: https://maps.google.com/?q=${issue.latitude},${issue.longitude}\n🏢 Routed: ${issue.department}\n\nTrack progress here: ${appLink}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  const handleShareTwitter = (issue: Issue) => {
    const appLink = window.location.origin + "/?issueId=" + issue.id;
    const text = `I reported a ${issue.category} in my neighbourhood on NagarAI! Track it here: ${appLink} #NagarAI #CivicIssue`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, "_blank");
  };

  const handleCopyLink = (issue: Issue) => {
    const appLink = window.location.origin + "/?issueId=" + issue.id;
    navigator.clipboard.writeText(appLink).then(() => {
      setToastMessage("Link Copied!");
      setTimeout(() => {
        setToastMessage(null);
      }, 2000);
    }).catch((err) => {
      console.error("Failed to copy link:", err);
    });
  };

  // Filter & Sort Logic
  const filteredIssues = issues
    .filter((issue) => {
      const matchesSearch =
        issue.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        issue.description.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        issue.category.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        issue.department.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        issue.latitude.toString().includes(debouncedSearch) ||
        issue.longitude.toString().includes(debouncedSearch);

      const matchesCategory = categoryFilter === "all" || issue.category === categoryFilter;
      const matchesSeverity = severityFilter === "all" || issue.severity === severityFilter;
      const matchesStatus = statusFilter === "all" || issue.status === statusFilter;

      return matchesSearch && matchesCategory && matchesSeverity && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "upvotes") {
        return (b.upvotesCount || 0) - (a.upvotesCount || 0);
      }
      // "newest" sorting
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case "high":
        return "bg-red-50 text-red-700 border-red-100";
      case "medium":
        return "bg-yellow-50 text-yellow-700 border-yellow-100";
      case "low":
        return "bg-green-50 text-green-700 border-green-100";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Resolved":
        return "bg-green-600 text-white";
      case "In Review":
        return "bg-yellow-500 text-white";
      case "Reported":
      default:
        return "bg-slate-500 text-white";
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Just now";
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const totalIssuesCount = issues.length;
  const issuesResolvedCount = issues.filter(issue => issue.status === "Resolved").length;
  const underReviewCount = issues.filter(issue => issue.status === "In Review").length;
  const activeCitizensCount = new Set(issues.filter(issue => issue.reporterId).map(issue => issue.reporterId)).size;

  return (
    <div id="feed-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Intro section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-800 dark:text-slate-100 tracking-tight">Community Issues</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Real-time reports filed by residents to keep our city clean and safe.</p>
        </div>
        <button
          id="btn-report-redirect"
          onClick={onNavigateToReport}
          className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-2 self-start md:self-auto"
        >
          <span>+ Report New Issue</span>
        </button>
      </div>

      {/* Live Statistics Banner */}
      <div id="city-stats-banner" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Total Issues */}
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 rounded-xl">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Reported</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
              {loading ? "..." : <CountUp end={totalIssuesCount} />}
            </p>
          </div>
        </div>

        {/* Card 2: Issues Resolved */}
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Resolved</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
              {loading ? "..." : <CountUp end={issuesResolvedCount} />}
            </p>
          </div>
        </div>

        {/* Card 3: Under Review */}
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 rounded-xl">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Under Review</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
              {loading ? "..." : <CountUp end={underReviewCount} />}
            </p>
          </div>
        </div>

        {/* Card 4: Active Citizens */}
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 rounded-xl">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Citizens</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
              {loading ? "..." : <CountUp end={activeCitizensCount} />}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Sidebar/Header panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 mb-8 shadow-sm dark:bg-[#1f1f3a] dark:border-slate-800/80">
        <div className="flex flex-col gap-4">
          {/* Search bar */}
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
              <input
                id="input-search"
                type="text"
                placeholder="Search reports by title, description, category, department, or coordinates..."
                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-green-500 focus:outline-none text-sm bg-slate-50/50 dark:bg-[#1a1a2e]/50 dark:border-slate-800 dark:text-white dark:placeholder-slate-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  id="btn-clear-search"
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Results count indicator */}
            {debouncedSearch && (
              <div id="search-results-count" className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-semibold flex items-center space-x-1.5 animate-fadeIn">
                <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>{filteredIssues.length} {filteredIssues.length === 1 ? "result" : "results"} found for "{debouncedSearch}"</span>
              </div>
            )}
          </div>

          {/* Dropdowns for classification filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
            </div>

            {/* Category selection */}
            <select
              id="filter-category"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-medium text-slate-700 dark:bg-[#1a1a2e] dark:border-slate-800 dark:text-slate-200"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="pothole">Potholes</option>
              <option value="broken streetlight">Streetlights</option>
              <option value="waste">Waste & Sanitation</option>
              <option value="water leakage">Water Leakages</option>
              <option value="public infrastructure">Public Infrastructure</option>
              <option value="other">Other Issues</option>
            </select>

            {/* Severity selection */}
            <select
              id="filter-severity"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-medium text-slate-700 dark:bg-[#1a1a2e] dark:border-slate-800 dark:text-slate-200"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="high">High Severity</option>
              <option value="medium">Medium Severity</option>
              <option value="low">Low Severity</option>
            </select>

            {/* Status selection */}
            <select
              id="filter-status"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 font-medium text-slate-700 dark:bg-[#1a1a2e] dark:border-slate-800 dark:text-slate-200"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="Reported">Reported</option>
              <option value="In Review">In Review</option>
              <option value="Resolved">Resolved</option>
            </select>

            {/* Sorting */}
            <div className="ml-auto flex items-center space-x-1.5">
              <button
                id="sort-newest"
                onClick={() => setSortBy("newest")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  sortBy === "newest" ? "bg-green-600 text-white shadow-sm" : "hover:bg-slate-100 text-slate-600 dark:hover:bg-[#1a1a2e] dark:text-slate-300"
                }`}
              >
                Newest
              </button>
              <button
                id="sort-upvotes"
                onClick={() => setSortBy("upvotes")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  sortBy === "upvotes" ? "bg-green-600 text-white shadow-sm" : "hover:bg-slate-100 text-slate-600 dark:hover:bg-[#1a1a2e] dark:text-slate-300"
                }`}
              >
                Most Upvotes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed Contents */}
      {loading ? (
        <div id="loading-skeletons" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filteredIssues.length === 0 ? (
        <div id="empty-feed-state" className="text-center py-20 bg-white dark:bg-[#1f1f3a] rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg mx-auto shadow-sm">
          <div className="bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 p-4 rounded-full inline-block mb-4">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <p className="text-slate-800 dark:text-slate-200 font-bold mb-1">
            {debouncedSearch ? `No issues found for "${debouncedSearch}"` : "No reported issues found"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 px-4">
            {debouncedSearch ? "Try a different keyword or check your spelling." : "Try refining your filter criteria or be the first to report an issue in your area."}
          </p>
          <button
            id="btn-empty-report"
            onClick={debouncedSearch ? () => setSearch("") : onNavigateToReport}
            className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            {debouncedSearch ? "Clear Search Query" : "Report Issue"}
          </button>
        </div>
      ) : (
        <motion.div 
          id="issue-grid" 
          layout 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {filteredIssues.map((issue) => {
              const hasUpvoted = !!userUpvotedIssues[issue.id];
              const isUpvoting = !!upvotingStates[issue.id];
              const pendingInfo = getPendingDaysInfo(issue.createdAt);

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  key={issue.id}
                  id={`issue-card-${issue.id}`}
                  className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md dark:hover:shadow-[#1a1a2e] transition-all flex flex-col h-full"
                >
                  {/* Photo Header */}
                  <div className="relative h-48 bg-slate-100 overflow-hidden">
                    <img
                      src={issue.imageUrl}
                      alt={issue.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Status badge */}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold uppercase rounded shadow-sm ${getStatusStyle(issue.status)}`}>
                      {issue.status}
                    </span>
                    {/* Severity badge */}
                    <span className={`absolute top-3 right-3 px-2.5 py-1 text-[10px] border font-bold uppercase rounded shadow-sm ${getSeverityStyle(issue.severity)}`}>
                      {issue.severity}
                    </span>
                  </div>

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col">
                    {/* Category and Date */}
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                      <span className={`uppercase tracking-wider font-mono font-bold px-2 py-0.5 rounded ${
                        issue.category === "public infrastructure"
                          ? "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/30"
                          : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      }`}>
                        {issue.category}
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        <span>{formatDate(issue.createdAt)}</span>
                      </span>
                    </div>

                    {/* Pending/Overdue Resolution Timer Badge */}
                    <div className="mb-3 flex">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${pendingInfo.className}`}>
                        ⏱️ {pendingInfo.text}
                      </span>
                    </div>

                    <h3 className="font-display font-bold text-slate-800 dark:text-slate-100 text-base leading-snug mb-2 line-clamp-1">
                      <HighlightText text={issue.title} highlight={debouncedSearch} />
                    </h3>

                    <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed mb-4 line-clamp-3 font-medium">
                      <HighlightText text={issue.description} highlight={debouncedSearch} />
                    </p>

                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      {/* Location detail */}
                      <div className="flex items-center space-x-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <MapPin className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        <span className="truncate max-w-[120px]">
                          {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}
                        </span>
                      </div>

                      {/* Action controllers: Share and Upvote */}
                      <div className="flex items-center space-x-2">
                        {/* Share dropdown button */}
                        <div className="relative">
                          <button
                            id={`btn-share-${issue.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveShareDropdown(activeShareDropdown === issue.id ? null : issue.id);
                            }}
                            className="flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#1a1a2e] transition-all border border-slate-200 dark:border-slate-800"
                            title="Share Issue"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>

                          <AnimatePresence>
                            {activeShareDropdown === issue.id && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-30"
                              >
                                {/* WhatsApp Share */}
                                <button
                                  id={`btn-share-wa-${issue.id}`}
                                  type="button"
                                  onClick={() => {
                                    handleShareWhatsApp(issue);
                                    setActiveShareDropdown(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center space-x-2 transition-colors"
                                >
                                  <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                                  <span>Share to WhatsApp</span>
                                </button>

                                {/* Twitter/X Share */}
                                <button
                                  id={`btn-share-twitter-${issue.id}`}
                                  type="button"
                                  onClick={() => {
                                    handleShareTwitter(issue);
                                    setActiveShareDropdown(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center space-x-2 transition-colors"
                                >
                                  <Twitter className="h-3.5 w-3.5 text-sky-500" />
                                  <span>Share to Twitter/X</span>
                                </button>

                                {/* Copy Link */}
                                <button
                                  id={`btn-share-copy-${issue.id}`}
                                  type="button"
                                  onClick={() => {
                                    handleCopyLink(issue);
                                    setActiveShareDropdown(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center space-x-2 transition-colors"
                                >
                                  <LinkIcon className="h-3.5 w-3.5 text-indigo-500" />
                                  <span>Copy Link</span>
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Upvote controller */}
                        <button
                          id={`btn-upvote-${issue.id}`}
                          onClick={() => handleUpvote(issue.id)}
                          disabled={isUpvoting}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                            hasUpvoted
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-[#1a1a2e] dark:hover:bg-[#252547] dark:text-slate-300 dark:border-slate-800"
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${hasUpvoted ? "fill-white" : ""}`} />
                          <span>{issue.upvotesCount || 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Footer agency info */}
                  <div className="px-5 py-3 bg-slate-50 dark:bg-[#1a1a2e]/60 border-t border-slate-150 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400">
                    <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400 dark:text-slate-500">Routed Dept:</span>
                    <span className="font-semibold text-green-700 dark:text-green-400 truncate max-w-[160px]">
                      <HighlightText text={issue.department} highlight={debouncedSearch} />
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-950 px-4 py-3 rounded-xl shadow-lg flex items-center space-x-2 border border-slate-800 dark:border-slate-200 font-medium text-xs"
          >
            <CheckCircle2 className="h-4 w-4 text-green-500 fill-green-500/10" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
