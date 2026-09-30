export const isLoggedIn = () => !!localStorage.getItem('token');

export const logout = () => {
  localStorage.removeItem('token');
  window.location.href = '/login';
};
