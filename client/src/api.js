export const API_BASE = typeof process !== 'undefined' && process.env.API_BASE ? process.env.API_BASE.replace(/\/+$/, '') : ''

export const apiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalizedPath}`
}
