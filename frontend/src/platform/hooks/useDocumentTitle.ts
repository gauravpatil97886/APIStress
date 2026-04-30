// useDocumentTitle — updates the browser-tab `<title>` while a component
// is mounted, restoring the previous title when the user navigates away.
//
// Why a hook (vs. setting `<title>` in index.html once): each tool in the
// Choice Techlab toolkit is its own page, and users keep multiple tabs
// open. A static title means every tab reads "APIStress" regardless of
// which tool is actually loaded — confusing when you have APIStress,
// PostWomen, Crosswalk, and Kavach open side-by-side.

import { useEffect } from "react";

const SUFFIX = " · Choice Techlab";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title.includes("·") || title.endsWith("Choice Techlab")
      ? title
      : title + SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
