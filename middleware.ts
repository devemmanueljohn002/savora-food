import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Production: replace with your auth/session check and role guards.
  const { pathname } = request.nextUrl
  const protectedPath = pathname.startsWith('/admin') || pathname.startsWith('/vendor') || pathname.startsWith('/account')
  if (!protectedPath) return NextResponse.next()
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/vendor/:path*', '/account/:path*'],
}
