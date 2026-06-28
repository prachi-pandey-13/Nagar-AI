import { useState, useEffect } from "react";
import { query, collection, onSnapshot, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Reporter, Issue } from "../types";
import { Award, Trophy, Users, CheckCircle2, AlertTriangle, Medal } from "lucide-react";

export default function LeaderboardPage() {
  const [reporters, setReporters] = useState<Reporter[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Fetch reporters ordered by issueCount
    const reporterQuery = query(collection(db, "reporters"), orderBy("issueCount", "desc"));
    const unsubReporters = onSnapshot(
      reporterQuery,
      (snapshot) => {
        const reportersData: Reporter[] = [];
        snapshot.forEach((doc) => {
          reportersData.push(doc.data() as Reporter);
        });
        setReporters(reportersData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "reporters");
      }
    );

    // 2. Fetch issues to compute dynamic municipal stats
    const issuesQuery = query(collection(db, "issues"));
    const unsubIssues = onSnapshot(
      issuesQuery,
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

    return () => {
      unsubReporters();
      unsubIssues();
    };
  }, []);

  // Compute stats
  const totalIssues = issues.length;
  const resolvedIssues = issues.filter((i) => i.status === "Resolved").length;
  const inReviewIssues = issues.filter((i) => i.status === "In Review").length;
  const totalReporters = reporters.length;

  const getRankStyle = (index: number) => {
    switch (index) {
      case 0:
        return "bg-amber-50 text-amber-700 border-amber-200 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30 dark:ring-amber-950/50";
      case 1:
        return "bg-slate-50 text-slate-700 border-slate-200 ring-slate-100 dark:bg-[#1a1a2e] dark:text-slate-300 dark:border-slate-800 dark:ring-slate-900/50";
      case 2:
        return "bg-orange-50 text-orange-700 border-orange-200 ring-orange-100 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/30 dark:ring-orange-950/50";
      default:
        return "bg-green-50 text-green-700 border-green-100 ring-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/20 dark:ring-green-950/50";
    }
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-4 w-4 text-amber-600" />;
      case 1:
        return <Medal className="h-4 w-4 text-slate-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-orange-600" />;
      default:
        return <span className="font-mono text-xs font-bold">{index + 1}</span>;
    }
  };

  return (
    <div id="leaderboard-view-container" className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl text-slate-800 dark:text-slate-100 tracking-tight">Reporter Leaderboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Celebrating our active civic guardians helping to clean and secure our streets.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin text-green-600 dark:text-green-400 h-8 w-8 mb-4 border-2 border-green-600 dark:border-green-400 border-t-transparent rounded-full" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Synchronizing Civic Leadership...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Municipal Stats Cards (Bento style) */}
          <div id="stats-summary" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
              <div className="bg-slate-50 dark:bg-[#1a1a2e] text-slate-700 dark:text-slate-300 p-3 rounded-xl">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">Total Reporters</p>
                <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mt-0.5">{totalReporters}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
              <div className="bg-slate-50 dark:bg-[#1a1a2e] text-slate-700 dark:text-slate-300 p-3 rounded-xl">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">Total Reports</p>
                <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mt-0.5">{totalIssues}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
              <div className="bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400 p-3 rounded-xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">In Review</p>
                <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mt-0.5">{inReviewIssues}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center space-x-4">
              <div className="bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 p-3 rounded-xl">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">Resolved Issues</p>
                <p className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mt-0.5">{resolvedIssues}</p>
              </div>
            </div>
          </div>

          {/* Leaderboard list */}
          <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-[#1a1a2e] border-b border-slate-200 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Active Guardian Standings</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Ranked by submissions</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {reporters.length === 0 ? (
                <div id="empty-leaderboard" className="text-center py-16 text-sm text-slate-400 dark:text-slate-500">
                  Be the first to report an issue and top the standings!
                </div>
              ) : (
                reporters.map((reporter, index) => (
                  <div
                    key={reporter.uid}
                    id={`leaderboard-item-${index}`}
                    className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-[#1a1a2e]/30 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      {/* Rank Indicator */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border ring-4 ring-offset-1 ${getRankStyle(index)}`}>
                        {getRankIcon(index)}
                      </div>

                      {/* Profile Photo */}
                      <img
                        referrerPolicy="no-referrer"
                        src={reporter.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${reporter.name}`}
                        alt={reporter.name}
                        className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 object-cover"
                      />

                      {/* Name details */}
                      <div>
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{reporter.name}</h3>
                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{reporter.email}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="text-right">
                      <p className="text-lg font-display font-black text-slate-800 dark:text-slate-100">{reporter.issueCount}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-semibold">Issues Submitted</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
