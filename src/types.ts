export interface Issue {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  severity: "low" | "medium" | "high";
  department: string;
  status: "Reported" | "In Review" | "Resolved";
  latitude: number;
  longitude: number;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  createdAt: any; // Firestore Timestamp
  upvotesCount: number;
}

export interface Reporter {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  issueCount: number;
}

export interface Upvote {
  voterId: string;
  createdAt: any;
}
