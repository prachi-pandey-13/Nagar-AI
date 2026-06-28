import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { query, collection, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Issue } from "../types";
import { Settings, Lock, Eye, CheckCircle2, ChevronRight, Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import { getPendingDaysInfo } from "../utils";

interface AdminPanelProps {
  user: User | null;
  isAdminUser: boolean;
}

export default function AdminPanel({ user, isAdminUser }: AdminPanelProps) {
  const [password, setPassword] = useState<string>("");
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Retrieve password protection state from sessionStorage to keep unlocked state on tab changes
  useEffect(() => {
    const unlocked = sessionStorage.getItem("admin_unlocked") === "true";
    if (unlocked) {
      setIsUnlocked(true);
    }
  }, []);

  // Sync Issues real-time
  useEffect(() => {
    if (!isUnlocked) return;

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
  }, [isUnlocked]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "publicutility2026") {
      setIsUnlocked(true);
      sessionStorage.setItem("admin_unlocked", "true");
      setError(null);
    } else {
      setError("Incorrect administrator passcode. Please try again.");
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: "Reported" | "In Review" | "Resolved") => {
    setUpdatingId(issueId);
    setError(null);
    setSuccessMsg(null);

    const issuePath = `issues/${issueId}`;
    try {
      const issueRef = doc(db, "issues", issueId);
      await updateDoc(issueRef, { status: newStatus });
      setSuccessMsg(`Successfully updated issue status to '${newStatus}'`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Status update failed:", err);
      if (err.message.includes("permission-denied") || err.message.includes("permissions")) {
        setError(
          `Unauthorized Write: Firestore Security Rules rejected this update. To change statuses, you must be signed in with the bootstrapped admin Google account: prachipandey24975@gmail.com.`
        );
      } else {
        setError("Failed to update status. Please try again.");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "Resolved":
        return "bg-green-50 text-green-700 border-green-100";
      case "In Review":
        return "bg-yellow-50 text-yellow-700 border-yellow-100";
      case "Reported":
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  if (!isUnlocked) {
    return (
      <div id="admin-lock-screen" className="max-w-md mx-auto py-20 px-4">
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm text-center">
          <div className="bg-slate-50 dark:bg-[#1a1a2e] text-slate-600 dark:text-slate-400 p-4 rounded-2xl inline-block mb-6 border border-slate-100 dark:border-slate-800">
            <Lock className="h-8 w-8 animate-pulse text-green-600" />
          </div>
          <h2 className="font-display font-bold text-2xl text-slate-800 dark:text-slate-100 mb-2">Admin Panel Access</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 font-medium">
            Enter the preconfigured master passcode to unlock the administrative console.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                id="admin-passcode-input"
                type="password"
                placeholder="Enter master passcode"
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-center focus:ring-1 focus:ring-green-500 focus:outline-none text-sm font-mono tracking-widest bg-slate-50 dark:bg-[#1a1a2e] dark:text-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-lg text-xs font-semibold">
                {error}
              </div>
            )}

            <button
              id="btn-unlock-admin"
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-2.5 rounded-lg transition-all shadow-sm"
            >
              Unlock Console
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            Default Passcode: <span className="font-bold font-sans text-xs bg-slate-100 dark:bg-[#1a1a2e] px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">publicutility2026</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="admin-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
          <Settings className="h-8 w-8 text-green-600 dark:text-green-400" />
          <span>Municipal Control Panel</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Review active municipal reports and manage status life-cycles.</p>
      </div>

      {/* Admin Authorization Notice */}
      <div id="admin-auth-notice" className={`border p-4 rounded-2xl flex items-start space-x-3 mb-6 ${
        isAdminUser 
          ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-900/30 dark:text-green-300" 
          : "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/30 dark:text-yellow-300"
      }`}>
        {isAdminUser ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold">Authorized Administrator Status Active</p>
              <p className="text-[10px] opacity-90 mt-0.5 font-medium">
                You are authenticated as prachipandey24975@gmail.com. You have write clearances on live databases.
              </p>
            </div>
          </>
        ) : (
          <>
            <ShieldAlert className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold">ReadOnly Active: Authentication Clearances Required</p>
              <p className="text-[10px] opacity-90 mt-0.5 font-medium">
                You are viewing the dashboard under passcode privileges. To update statuses, you must also sign in to your Google Account as the bootstrapped administrator: <span className="font-bold text-slate-800 dark:text-slate-100">prachipandey24975@gmail.com</span>.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold p-4 rounded-xl flex items-start space-x-2.5 mb-6">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-xs font-semibold p-4 rounded-xl flex items-start space-x-2.5 mb-6">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin text-green-600 dark:text-green-400 h-8 w-8 mb-4 border-2 border-green-600 dark:border-green-400 border-t-transparent rounded-full" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Retrieving Live Municipal Workflows...</p>
        </div>
      ) : issues.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <p className="text-slate-800 dark:text-slate-100 font-bold text-sm">No municipal reports active</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Check back once citizens log civic issues.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/85 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#1a1a2e] border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  <th className="px-6 py-4">Civic Issue</th>
                  <th className="px-6 py-4">Reporter</th>
                  <th className="px-6 py-4">Routed Department</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4 text-right">Workflow Transition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-700 dark:text-slate-300">
                {issues.map((issue) => {
                  const pendingInfo = getPendingDaysInfo(issue.createdAt);
                  return (
                    <tr key={issue.id} className="hover:bg-slate-50/50 dark:hover:bg-[#1a1a2e]/30 transition-colors">
                      <td className="px-6 py-4 flex items-center space-x-3 max-w-sm">
                        <img
                          src={issue.imageUrl}
                          alt={issue.title}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-150 dark:border-slate-800"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{issue.title}</h4>
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md border ${pendingInfo.className}`}>
                              {pendingInfo.text}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">ID: {issue.id}</p>
                        </div>
                      </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{issue.reporterName}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{issue.reporterEmail}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">{issue.department}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-0.5 border text-[10px] font-bold uppercase rounded-md ${getStatusBadgeStyle(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {updatingId === issue.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                        ) : (
                          <>
                            <span className={`inline-block px-2 py-1 text-[10px] font-bold uppercase rounded-md border ${getStatusBadgeStyle(issue.status)}`}>
                              {issue.status}
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-500" />
                            <select
                              id={`select-status-${issue.id}`}
                              className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-[#1a1a2e] text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-green-500"
                              value={issue.status}
                              onChange={(e) => handleStatusChange(issue.id, e.target.value as any)}
                            >
                              <option value="Reported">Reported</option>
                              <option value="In Review">In Review</option>
                              <option value="Resolved">Resolved</option>
                            </select>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
