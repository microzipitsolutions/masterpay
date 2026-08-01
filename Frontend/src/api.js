import axios from "axios";
import { API_BASE_URL } from "./config/apiConfig";

const api = axios.create({
  baseURL: API_BASE_URL,
});

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("rdpay_user_info") || "{}");
  } catch {
    return {};
  }
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

export function clearSession() {
  localStorage.removeItem("rdpay_token");
  localStorage.removeItem("rdpay_user");
  localStorage.removeItem("rdpay_role");
  localStorage.removeItem("rdpay_user_info");
  localStorage.removeItem("rdpay_view_as");

  sessionStorage.clear();
}

export function getCurrentSession() {
  const token = localStorage.getItem("rdpay_token");
  const userInfo = getStoredUser();
  let clientId = userInfo.client_id ?? userInfo.clientId ?? null;
  if (clientId === null && token) {
    const decoded = decodeJwt(token);
    clientId = decoded.clientId ?? null;
  }
  return {
    token,
    username: localStorage.getItem("rdpay_user"),
    role: localStorage.getItem("rdpay_role"),
    userInfo: { ...userInfo, client_id: clientId, clientId },
  };
}

export function roleHomePath(role) {
  if (role === "super-admin") return "/superadmin-dashboard";
  if (role === "merchant") return "/merchant-dashboard";
  if (role === "agent") return "/agent-dashboard";
  return "/";
}

function attachAuth(config) {
  const token = localStorage.getItem("rdpay_token");
  const role = localStorage.getItem("rdpay_role");
  const user = getStoredUser();

  config.headers = config.headers || {};

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (role) config.headers.role = role;
  if (user?.id) config.headers.userid = user.id;
  if (user?.agentId || user?.agent_id) config.headers.agentid = user.agentId || user.agent_id;
  if (user?.merchantId || user?.merchant_id) config.headers.merchantid = user.merchantId || user.merchant_id;

  const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");

if ((role === "admin" || role === "agent") && viewAs?.role && viewAs?.id) {
  config.headers.viewrole = viewAs.role;
  config.headers.viewid = viewAs.id;
}
  return config;
}

api.interceptors.request.use(attachAuth);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
