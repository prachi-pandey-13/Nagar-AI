export interface PendingInfo {
  text: string;
  className: string;
  days: number;
}

export function getPendingDaysInfo(createdAt: any): PendingInfo {
  if (!createdAt) {
    return {
      text: "New",
      className: "bg-green-50 text-green-700 border-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30",
      days: 0,
    };
  }

  let date: Date;
  if (createdAt.seconds) {
    date = new Date(createdAt.seconds * 1000);
  } else if (typeof createdAt === "object" && typeof createdAt.toDate === "function") {
    date = createdAt.toDate();
  } else if (createdAt instanceof Date) {
    date = createdAt;
  } else {
    date = new Date(createdAt);
  }

  const today = new Date();
  
  // Set both times to midnight to calculate pure days difference
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = todayMidnight.getTime() - dateMidnight.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const safeDays = days < 0 ? 0 : days;
  
  if (safeDays <= 3) {
    return {
      text: "New",
      className: "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30",
      days: safeDays,
    };
  } else if (safeDays <= 7) {
    return {
      text: `Pending ${safeDays} days`,
      className: "bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/30",
      days: safeDays,
    };
  } else {
    return {
      text: `Overdue ${safeDays} days`,
      className: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30",
      days: safeDays,
    };
  }
}
