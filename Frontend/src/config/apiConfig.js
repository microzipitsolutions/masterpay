export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
export const API_BASE_API_URL = `${API_BASE_URL}/api`;

export function fileUrl(path) {
  if (!path) return "";
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) return path;
  return `${API_BASE_URL}${path}`;
}
