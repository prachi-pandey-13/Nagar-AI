import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { collection, doc, writeBatch, getDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Upload, MapPin, Loader2, Sparkles, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";

interface ReportPageProps {
  user: User | null;
  onSuccess: () => void;
}

interface AIResult {
  category: string;
  severity: "low" | "medium" | "high";
  department: string;
  title: string;
  description: string;
}

export default function ReportPage({ user, onSuccess }: ReportPageProps) {
  const [image, setImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("");
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "getting" | "success" | "denied">("idle");
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [additionalComments, setAdditionalComments] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [reportAnonymously, setReportAnonymously] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Request Geolocation automatically on load
  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }

    setLocationStatus("getting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationStatus("success");
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocationStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, JPEG).");
      return;
    }

    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setError(null);
      setAiResult(null); // Reset past AI classification if new photo added
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClassify = async () => {
    if (!image) return;
    setIsClassifying(true);
    setError(null);

    try {
      const response = await fetch("/api/classify-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: image,
          mimeType: imageMimeType,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to classify the image.");
      }

      const result = await response.json();
      setAiResult(result);
    } catch (err: any) {
      console.error("Classification error:", err);
      setError(err.message || "An error occurred while classifying with AI. Please try again.");
    } finally {
      setIsClassifying(false);
    }
  };

  const handleSubmitReport = async () => {
    if ((!reportAnonymously && !user) || !image || !aiResult) return;
    setIsSubmitting(true);
    setError(null);

    // Fallback coordinates if location was denied (defaulting to central region)
    const finalLat = coords ? coords.lat : 37.7749;
    const finalLng = coords ? coords.lng : -122.4194;

    const issueId = "issue_" + Math.random().toString(36).substring(2, 15);
    const issuePath = `issues/${issueId}`;

    const anonId = "anon_" + Math.random().toString(36).substring(2, 10);
    const finalReporterId = reportAnonymously ? anonId : (user?.uid || anonId);
    const finalReporterName = reportAnonymously ? "Anonymous Citizen" : (user?.displayName || "Anonymous User");
    const finalReporterEmail = reportAnonymously ? "" : (user?.email || "");
    const finalPhotoURL = reportAnonymously ? "" : (user?.photoURL || "");

    try {
      const batch = writeBatch(db);

      // Create Issue Document
      const issueRef = doc(db, "issues", issueId);
      batch.set(issueRef, {
        id: issueId,
        title: aiResult.title,
        description: `${aiResult.description}${additionalComments ? `\n\nUser Notes: ${additionalComments}` : ""}`,
        imageUrl: image,
        category: aiResult.category,
        severity: aiResult.severity,
        department: aiResult.department,
        status: "Reported",
        latitude: finalLat,
        longitude: finalLng,
        reporterId: finalReporterId,
        reporterName: finalReporterName,
        reporterEmail: finalReporterEmail,
        createdAt: serverTimestamp(),
        upvotesCount: 0,
      });

      // Update/Increment Reporter Count
      const reporterRef = doc(db, "reporters", finalReporterId);
      const reporterSnap = await getDoc(reporterRef);

      if (reporterSnap.exists()) {
        const currentData = reporterSnap.data();
        batch.update(reporterRef, {
          issueCount: (currentData.issueCount || 0) + 1,
          name: finalReporterName,
          photoURL: finalPhotoURL,
        });
      } else {
        batch.set(reporterRef, {
          uid: finalReporterId,
          name: finalReporterName,
          email: finalReporterEmail,
          photoURL: finalPhotoURL,
          issueCount: 1,
        });
      }

      await batch.commit();
      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccess(); // Switch back to feed
      }, 2000);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, issuePath);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityColor = (sev: string) => {
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

  if (!user && !reportAnonymously) {
    return (
      <div id="signin-prompt" className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-md mx-auto">
        <div className="bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 p-4 rounded-full mb-6">
          <ShieldCheck className="h-12 w-12" />
        </div>
        <h2 className="font-display font-bold text-2xl text-slate-800 dark:text-slate-100 mb-2">Submit a Civic Report</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed font-medium">
          Reporting issues like potholes, broken lights, and waste is easy. Sign in with your Google account to help improve our local community.
        </p>
        
        {/* Toggle switch to report anonymously when not signed in */}
        <div className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full mb-6 shadow-sm text-left">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">Report Anonymously</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">Skip signing in and file reports privately.</span>
            </div>
            <button
              id="btn-anon-toggle-prompt"
              onClick={() => setReportAnonymously(true)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all shadow-sm"
            >
              Enable
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            🔒 <span className="font-semibold">Privacy Note:</span> Your identity will not be shared publicly.
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-[#1f1f3a]/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 w-full">
          All issues are securely saved and routed to the proper city channels.
        </div>
      </div>
    );
  }

  return (
    <div id="report-view-container" className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-800 dark:text-slate-100 tracking-tight">Report a Civic Issue</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Upload a photo to automatically categorize and route the problem using AI.</p>
        </div>
        
        {/* Toggle switch on form */}
        <div className="flex items-center space-x-3 bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl shadow-sm self-start md:self-auto">
          <div className="text-left md:text-right">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Report Anonymously</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium">Your identity is hidden</span>
          </div>
          <button
            id="btn-anon-toggle-form"
            type="button"
            onClick={() => {
              if (reportAnonymously && !user) {
                setReportAnonymously(false);
              } else {
                setReportAnonymously(!reportAnonymously);
              }
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              reportAnonymously ? "bg-green-600" : "bg-slate-200 dark:bg-slate-800"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                reportAnonymously ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {submitSuccess ? (
        <div id="success-banner" className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center flex flex-col items-center">
          <div className="bg-green-600 text-white p-3 rounded-full mb-4 animate-bounce">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="font-display font-bold text-xl text-green-800 mb-2">Issue Reported Successfully!</h2>
          <p className="text-green-700 text-sm">Your civic issue has been logged, analyzed, and routed. Returning to feed...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Photo Uploader */}
          <div
            id="photo-dropzone"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-green-600 bg-green-50/50 dark:bg-green-950/20 scale-[1.01]"
                : image
                ? "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1a2e]/30"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 bg-white dark:bg-[#1f1f3a]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
            />

            {image ? (
              <div className="relative">
                <img
                  src={image}
                  alt="Civic Issue Preview"
                  className="max-h-80 mx-auto rounded-xl object-contain border border-slate-200 dark:border-slate-800"
                />
                <button
                  id="btn-change-photo"
                  onClick={onButtonClick}
                  className="mt-4 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#1a1a2e] border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-100 dark:hover:bg-[#1f1f3a] transition-all"
                >
                  Change Photo
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6" onClick={onButtonClick}>
                <div className="bg-slate-50 dark:bg-[#1a1a2e] text-slate-500 dark:text-slate-400 p-4 rounded-full mb-4">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-bold text-sm">Drag & drop your issue photo here, or click to browse</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Supports PNG, JPG, JPEG up to 10MB</p>
              </div>
            )}
          </div>

          {/* Location status bar */}
          <div id="location-bar" className="flex items-center justify-between bg-slate-50 dark:bg-[#1f1f3a]/40 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${coords ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"}`}>
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {coords ? "Location Detected Successfully" : "Location Permission Needed"}
                </p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : "Using fallback center coords"}
                </p>
              </div>
            </div>
            {locationStatus === "getting" ? (
              <Loader2 className="h-4 w-4 animate-spin text-green-600" />
            ) : (
              <button
                id="btn-retry-location"
                onClick={getLocation}
                className="text-xs text-slate-600 font-semibold hover:underline"
              >
                {coords ? "Refresh GPS" : "Allow GPS"}
              </button>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div id="report-error-banner" className="bg-red-50 border border-red-200 text-red-800 text-sm p-4 rounded-xl flex items-start space-x-2.5">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Classification Trigger */}
          {image && !aiResult && (
            <div className="text-center py-2">
              <button
                id="btn-ai-analyze"
                onClick={handleClassify}
                disabled={isClassifying}
                className="inline-flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition-all shadow-sm disabled:opacity-75"
              >
                {isClassifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing your image...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Analyze with Gemini AI</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* AI Results & Final Comments / Submission */}
          {aiResult && (
            <div id="ai-results-card" className="bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 animate-fade-in">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">AI Assessment Results</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Assessed Title</label>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{aiResult.title}</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Issue Category</label>
                  <select
                    id="select-report-category"
                    className={`px-3 py-1 border text-xs font-semibold rounded uppercase focus:outline-none focus:ring-1 focus:ring-green-500 block w-full bg-white dark:bg-[#1a1a2e] ${
                      aiResult.category === "public infrastructure"
                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-900/40 dark:text-blue-300"
                        : "bg-green-50 text-green-700 border-green-200 dark:border-green-900/40 dark:text-green-400"
                    }`}
                    value={aiResult.category}
                    onChange={(e) => setAiResult({ ...aiResult, category: e.target.value })}
                  >
                    <option value="pothole">pothole</option>
                    <option value="broken streetlight">broken streetlight</option>
                    <option value="waste">waste</option>
                    <option value="water leakage">water leakage</option>
                    <option value="public infrastructure">public infrastructure</option>
                    <option value="other">other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Severity Level</label>
                  <span className={`inline-block px-3 py-1 border text-xs font-semibold rounded uppercase ${getSeverityColor(aiResult.severity)}`}>
                    {aiResult.severity}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Government Agency Routing</label>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{aiResult.department}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1 font-mono">Detailed Analysis</label>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#1a1a2e]/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 leading-relaxed font-medium">
                  {aiResult.description}
                </p>
              </div>

              {/* Extra Comments */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Additional Comments (Optional)</label>
                <textarea
                  id="textarea-additional-comments"
                  placeholder="Add any extra context, landmarks, or details that might help the department address the issue..."
                  className="w-full h-24 p-3 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-green-500 focus:outline-none text-sm bg-slate-50 dark:bg-[#1a1a2e] dark:text-slate-200"
                  value={additionalComments}
                  onChange={(e) => setAdditionalComments(e.target.value)}
                />
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {reportAnonymously ? "🔒 Your identity will not be shared publicly" : ""}
                </span>
                <button
                  id="btn-submit-report"
                  onClick={handleSubmitReport}
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition-all shadow-sm disabled:opacity-75 flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting Report...</span>
                    </>
                  ) : (
                    <span>File Civic Report</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
