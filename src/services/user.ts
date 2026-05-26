export function getUserId(): string | null {
  return localStorage.getItem('auth_user_id');
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}
