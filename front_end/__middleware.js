// import { NextResponse } from 'next/server';

// export function middleware(request) {
//   const token = request.cookies.get('auth-token')?.value;
//   const { pathname } = request.nextUrl;

//     if (!token && pathname === "/") {
//       return NextResponse.redirect(new URL("/signup", request.url));
//     }

//     // Define public routes that don't require authentication
//     const publicRoutes = [
//       "/signup",
//       "/signin",
//       "/forgot-password",
//       "/firstSignIn",
//     ];

//     // Check if the current path is a public route
//     const isPublicRoute = publicRoutes.some((route) =>
//       pathname.startsWith(route)
//     );

//     // If user is not authenticated and trying to access a protected route
//     if (!token && !isPublicRoute) {
//       return NextResponse.redirect(new URL("/signup", request.url));
//     }

//   // If user is authenticated and trying to access public routes (signin/signup)
//   if (token && isPublicRoute) {
//     return NextResponse.redirect(new URL('/', request.url));
//   }

//   return NextResponse.next();
// }

// export const config = {
//   matcher: [
//     /*
//      * Match all request paths except for the ones starting with:
//      * - api (API routes)
//      * - _next/static (static files)
//      * - _next/image (image optimization files)
//      * - favicon.ico (favicon file)
//      * - public folder
//      */
//     '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
//   ],
// };

// middleware.js
// import { NextResponse } from "next/server";

// export function middleware(request) {
//   const url = request.nextUrl;
//   const { pathname } = url;

//   // Read the auth cookie set by your backend (rename if different)
//   const token = request.cookies.get("auth-token")?.value;

//   // Public routes that should be accessible without auth
//   const publicRoutes = [
//     "/signup",
//     "/signin",
//     "/forgot-password",
//     "/firstSignin",
//   ];
//   const isPublicRoute = publicRoutes.some((route) =>
//     pathname.startsWith(route)
//   );

//   // Special handling for root "/"
//   if (pathname === "/") {
//     // If not authenticated -> go to signup
//     if (!token) return NextResponse.redirect(new URL("/signup", request.url));
//     // If authenticated -> allow home
//     return NextResponse.next();
//   }

//   // If not authenticated and trying to access a protected route -> go to signup
//   if (!token && !isPublicRoute) {
//     return NextResponse.redirect(new URL("/signup", request.url));
//   }

//   // If authenticated and trying to access a public auth page -> send to home
//   if (token && isPublicRoute) {
//     return NextResponse.redirect(new URL("/", request.url));
//   }

//   return NextResponse.next();
// }

// export const config = {
//   matcher: [
//     "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
//   ],
// };

// middleware.js
import { NextResponse } from "next/server";

export function middleware(request) {
  const { nextUrl } = request;
  const { pathname } = nextUrl;

  // IMPORTANT: cookie name must match what your backend sets
  const token = request.cookies.get("auth-token")?.value;

  const publicRoutes = [
    "/signup",
    "/signin",
    "/forgot-password",
    "/firstSignin",
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Root landing: if not authed -> /signup, else allow "/"
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(new URL("/signup", request.url));
    return NextResponse.next();
  }

  // Hitting a protected route without auth -> /signup
  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  // If authed and they try to open a public auth page -> send to home
  if (token && isPublicRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
