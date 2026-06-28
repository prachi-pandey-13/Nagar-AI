import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import Navbar from "./components/Navbar";
import ReportPage from "./components/ReportPage";
import FeedPage from "./components/FeedPage";
import MapPage from "./components/MapPage";
import LeaderboardPage from "./components/LeaderboardPage";
import AdminPanel from "./components/AdminPanel";
import { ShieldCheck, Heart } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("feed");
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      // Determine if logged-in user is the bootstrapped admin
      if (currentUser && currentUser.email === "prachipandey24975@gmail.com") {
        setIsAdminUser(true);
      } else {
        setIsAdminUser(false);
      }
      
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case "report":
        return <ReportPage user={user} onSuccess={() => setActiveTab("feed")} />;
      case "feed":
        return <FeedPage user={user} onNavigateToReport={() => setActiveTab("report")} />;
      case "map":
        return <MapPage />;
      case "leaderboard":
        return <LeaderboardPage />;
      case "admin":
        return <AdminPanel user={user} isAdminUser={isAdminUser} />;
      default:
        return <FeedPage user={user} onNavigateToReport={() => setActiveTab("report")} />;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#1a1a2e] flex flex-col items-center justify-center transition-colors duration-200">
        <div className="bg-green-600 text-white p-3.5 rounded-xl shadow-sm mb-6 animate-bounce">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div className="animate-spin text-green-600 h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full mb-3" />
        <p className="font-display font-semibold text-slate-805 text-sm tracking-wide dark:text-slate-200">Connecting Nagar AI...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a2e] dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Navigation */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminUser={isAdminUser}
      />

      {/* Main Content Area */}
      <main className="flex-1 bg-transparent">
        {renderActivePage()}
      </main>

      {/* Footer */}
      <footer id="app-footer" className="w-full bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500 font-medium dark:bg-[#1a1a2e] dark:border-slate-800 dark:text-slate-400 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="font-display font-bold text-slate-805 dark:text-slate-200">Nagar AI - Voice of Your Neighbourhood</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>Made with</span>
            <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />
            <span>for a cleaner, safer community</span>
          </div>
          <div>
            <span>&copy; {new Date().getFullYear()} Municipal Government. All Rights Reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
