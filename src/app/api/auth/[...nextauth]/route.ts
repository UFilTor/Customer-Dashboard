import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "hubspot",
      name: "HubSpot",
      type: "oauth",
      authorization: {
        url: "https://app.hubspot.com/oauth/authorize",
        params: { scope: "oauth" },
      },
      token: "https://api.hubapi.com/oauth/v1/token",
      userinfo: {
        url: "https://api.hubapi.com/oauth/v1/access-tokens/",
        async request({ tokens }) {
          const res = await fetch(
            `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`
          );
          const data = await res.json();
          return {
            id: data.user_id,
            name: data.user,
            email: data.user,
          };
        },
      },
      clientId: process.env.HUBSPOT_CLIENT_ID,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.id?.toString(),
          name: profile.name,
          email: profile.email,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.hubspotOwnerId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { hubspotOwnerId?: string }).hubspotOwnerId = token.hubspotOwnerId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
