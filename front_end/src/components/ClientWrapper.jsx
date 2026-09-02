"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { RevealProvider } from "@/contexts/RevealContext";
import { ToastProvider } from "@/contexts/ToastContext";
import ChatwootWidget from "@/components/ChatwootWidget";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export default function ClientWrapper({ children }) {
  if (!stripePromise) {
     return (
        <AuthProvider>
          <RevealProvider>
            <ToastProvider>
              <ChatwootWidget />
              {children}
            </ToastProvider>
          </RevealProvider>
        </AuthProvider>
     );
  }
  return (
    <AuthProvider>
      <RevealProvider>
        <ToastProvider>
          <Elements stripe={stripePromise}>
            <ChatwootWidget />
            {children}
          </Elements>
        </ToastProvider>
      </RevealProvider>
    </AuthProvider>
  );
}
