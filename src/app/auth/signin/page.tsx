"use client";

import { signIn } from "next-auth/react";

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#022C12] mb-2">Customer Dashboard</h1>
        <p className="text-[#4D4D4D] mb-8">Sign in with your HubSpot account to continue</p>
        <button
          onClick={() => signIn("hubspot", { callbackUrl: "/" })}
          className="bg-[#022C12] text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with HubSpot
        </button>
      </div>
    </div>
  );
}
