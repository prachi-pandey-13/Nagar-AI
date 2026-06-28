import { signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { auth } from "../firebase";
import { LogIn, LogOut, ShieldAlert, Award, FileText, Map, Settings, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeContext";

interface NavbarProps {
  user: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdminUser: boolean;
}

export default function Navbar({ user, activeTab, setActiveTab, isAdminUser }: NavbarProps) {
  const { theme, setTheme } = useTheme();

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = () => {
    signOut(auth).catch((error) => console.error("Sign out failed:", error));
  };

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  const navItems = [
    { id: "report", label: "Report Issue", icon: ShieldAlert },
    { id: "feed", label: "Issue Feed", icon: FileText },
    { id: "map", label: "Interactive Map", icon: Map },
    { id: "leaderboard", label: "Leaderboard", icon: Award },
    { id: "admin", label: "Admin Panel", icon: Settings },
  ];

  return (
    <header id="app-header" className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 shadow-sm dark:bg-[#1a1a2e] dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab("feed")}>
            <div className="bg-green-600 text-white p-2 rounded-lg flex items-center justify-center shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg leading-none text-slate-800 dark:text-slate-100 tracking-tight">Nagar AI</span>
              <span className="text-[10px] font-mono text-green-600 mt-0.5 uppercase tracking-widest font-semibold font-sans dark:text-green-400">Voice of Your Neighbourhood</span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-green-50 text-green-700 font-semibold dark:bg-green-950/40 dark:text-green-400"
                      : "text-slate-600 hover:text-slate-950 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/40"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Auth Button, Theme Toggle and Profile */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Theme Switcher Button */}
            <button
              id="btn-theme-toggle"
              onClick={cycleTheme}
              className="p-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-green-400 dark:hover:bg-[#1f1f3a] transition-all duration-150"
              title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Click to change)`}
            >
              <ThemeIcon className="h-5 w-5" />
            </button>

            {user ? (
              <div className="flex items-center space-x-2 sm:space-x-3 bg-slate-50 dark:bg-[#1f1f3a] px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                <div className="relative">
                  <img
                    id="user-avatar"
                    referrerPolicy="no-referrer"
                    src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
                    alt={user.displayName || "User"}
                    className="h-8 w-8 rounded-full border-2 border-green-600 dark:border-green-400 object-cover"
                  />
                  {isAdminUser && (
                    <span className="absolute -bottom-1 -right-1 bg-amber-500 text-[8px] font-bold text-white px-1 py-0.5 rounded-full border border-white">
                      AD
                    </span>
                  )}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                    {user.displayName}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 max-w-[120px] truncate">
                    {user.email}
                  </p>
                </div>
                <button
                  id="btn-signout"
                  onClick={handleSignOut}
                  className="p-1.5 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/20 transition-colors duration-150"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-signin"
                onClick={handleGoogleSignIn}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-medium text-sm px-3 sm:px-4 py-2 rounded-lg transition-all shadow-sm"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Sign In</span>
                <span className="sm:hidden">In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden border-t border-slate-100 dark:border-slate-800 py-2 justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center p-1.5 rounded-lg text-center transition-all ${
                  isActive
                    ? "text-green-700 dark:text-green-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-green-600 dark:text-green-400" : ""}`} />
                <span className="text-[10px] mt-0.5 font-medium">{item.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
