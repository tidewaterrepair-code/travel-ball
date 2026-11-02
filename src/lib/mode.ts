// Which part of the app this page load is: the public demo, a real club, sign-in, or your admin console.
const clubMatch = location.pathname.match(/^\/c\/([a-z0-9-]+)(?:\/|$)/)

export const CLUB_SLUG: string | null = clubMatch?.[1] ?? null
export const PAGE: 'demo' | 'club' | 'login' | 'admin' =
  CLUB_SLUG ? 'club' : location.pathname.startsWith('/login') ? 'login' : location.pathname.startsWith('/admin') ? 'admin' : 'demo'
export const IS_CLUB = PAGE === 'club'
