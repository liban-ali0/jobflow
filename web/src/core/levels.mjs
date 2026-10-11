// Shared by the app (including the browser), the data layer, and the
// collector, so it imports nothing.

// LinkedIn's experience levels, with its filter codes and the label its
// job pages use.
export const EXPERIENCE_LEVELS = [
  { key: "internship", label: "Internship", linkedin: "1", listed: "Internship" },
  { key: "entry", label: "Entry level", linkedin: "2", listed: "Entry level" },
  { key: "associate", label: "Associate", linkedin: "3", listed: "Associate" },
  { key: "mid-senior", label: "Mid-senior", linkedin: "4", listed: "Mid-Senior level" },
  { key: "director", label: "Director", linkedin: "5", listed: "Director" },
  { key: "executive", label: "Executive", linkedin: "6", listed: "Executive" },
];
