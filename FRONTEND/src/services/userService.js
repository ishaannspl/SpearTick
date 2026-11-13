import api from "./api";

export const getUsers = async () => {
  const { data } = await api.get("/api/users");
  return data;
};

export const createUser = async (userData) => {
  const { data } = await api.post("/api/users", userData);
  return data;
};

export const updateUserRole = async (userId, role) => {
  const { data } = await api.patch(`/api/users/${userId}/role`, { role });

  return data;
};

export const updateUserStatus = async (userId, isActive) => {
  const { data } = await api.patch(`/api/users/${userId}/status`, { isActive });

  return data;
};

// Admin sets a new password for a team member.
export const resetUserPassword = async (userId, password) => {
  const { data } = await api.patch(`/api/users/${userId}/password`, { password });
  return data;
};
